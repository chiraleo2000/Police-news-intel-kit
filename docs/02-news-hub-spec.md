# 02 — สเปก news-hub (server + MCP)

สถานะ: **สเปกสำหรับสร้าง** — ยังไม่มีโค้ดในชุดนี้ จุดประสงค์คือให้ผลลัพธ์ที่ Claude, Obsidian และเว็บพึ่งพา "สัญญา" เดียวกัน

## 1) ส่วนประกอบ

| ส่วน | หน้าที่ | เทคโนโลยีที่แนะนำ |
| --- | --- | --- |
| `dist/index.js` | HTTP server: LINE webhook + REST `/api/*` + `/health` | Node LTS (≥22), TypeScript, Fastify/Express |
| DB | แหล่งความจริงเดียว | SQLite (WAL) ผ่าน `better-sqlite3` |
| `dist/mcp-stdio.js` | MCP server แบบ stdio ที่ Claude เรียก; แปลง tool → REST (ไม่มี logic ธุรกิจ) | `@modelcontextprotocol/sdk` |
| `dist/jobs/*.js` | `export-links`, `vault-build`, `healthcheck`, `backup` | สคริปต์เดี่ยว รันจาก Task Scheduler |
| `config/registry/crime.json`, `gov.json` | registry 55 / 109 แหล่ง (แปลงจากตารางใน SKILL) | JSON |
| `config/provinces.json` | 77 จังหวัด → ภาค | JSON |

เหตุผลที่ MCP เป็น stdio shim: custom connector แบบระยะไกลมักต้องการ OAuth และ URL สาธารณะ ส่วน shim บนเครื่องเดียวกับ Claude ใช้ bearer token ผ่าน env ได้ง่ายกว่า และ `.mcp.json` ของ plugin รองรับ `command` อยู่แล้ว (ถ้าต้องการให้ cloud task เรียกได้ ค่อยเพิ่ม remote MCP แยกต่างหากภายหลัง)

## 2) ฐานข้อมูล (SQLite DDL)

```sql
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;

CREATE TABLE line_links (
  id              INTEGER PRIMARY KEY,
  event_id        TEXT UNIQUE,                 -- webhookEventId (กันส่งซ้ำ/redelivery)
  line_message_id TEXT,                        -- ใช้จัดการ unsend
  received_at     TEXT NOT NULL,               -- ISO, Asia/Bangkok
  group_alias     TEXT NOT NULL,               -- ชื่อเล่นกลุ่มจาก config (ไม่เก็บ userId)
  url             TEXT NOT NULL,
  canonical_url   TEXT NOT NULL,
  domain          TEXT NOT NULL,
  domain_type     TEXT NOT NULL CHECK (domain_type IN ('official','media','social','unknown')),
  fetchable       INTEGER NOT NULL,            -- 0 สำหรับ social/ต้อง login
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','used','skipped')),
  reason          TEXT,
  article_id      TEXT,
  UNIQUE (canonical_url, substr(received_at,1,10))
);
CREATE INDEX ix_links_status ON line_links(status, received_at);

CREATE TABLE run_status (
  task TEXT NOT NULL,                          -- crime-news | gov-tech-law | brain-review
  run_date TEXT NOT NULL,                      -- YYYY-MM-DD หรือ YYYY-Www
  status TEXT NOT NULL CHECK (status IN ('running','complete','partial','failed')),
  counts_json TEXT, issues_json TEXT,
  started_at TEXT, finished_at TEXT,
  PRIMARY KEY (task, run_date)
);

CREATE TABLE articles (
  article_id TEXT PRIMARY KEY, run_date TEXT NOT NULL, task TEXT NOT NULL,
  source_url TEXT NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (source_url, run_date)
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY, run_date TEXT NOT NULL, task TEXT NOT NULL,
  kind TEXT NOT NULL,                          -- json|html|pdf|png|xlsx|index|by_crime_type|hotspots|tags|alerts|trends
  filename TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, stored_path TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE (task, run_date, filename)
);

CREATE TABLE cases (
  case_id TEXT PRIMARY KEY, run_date TEXT NOT NULL, task TEXT NOT NULL,
  title TEXT NOT NULL, summary TEXT NOT NULL, crime_type TEXT, secondary_json TEXT,
  grp TEXT, hashtags_json TEXT, severity TEXT, stage TEXT, verification TEXT,
  stats_json TEXT, implications_json TEXT, article_ids_json TEXT, source_url TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE entities (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,   -- name = ชื่อไฟล์ปลอดภัย
  aliases_json TEXT, parent TEXT, created_at TEXT NOT NULL,
  UNIQUE (type, name)
);

CREATE TABLE relations (
  id INTEGER PRIMARY KEY, from_ref TEXT NOT NULL, rel TEXT NOT NULL, to_ref TEXT NOT NULL,
  evidence TEXT, run_date TEXT NOT NULL,
  UNIQUE (from_ref, rel, to_ref)
);

CREATE TABLE merge_proposals (
  id INTEGER PRIMARY KEY, keep_ref TEXT NOT NULL, merge_json TEXT NOT NULL, reason TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','rejected')),
  created_at TEXT NOT NULL
);

CREATE TABLE brain_notes (            -- weekly_note / entity_timeline ที่ Claude ส่งมา
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (kind, key)
);

CREATE TABLE audit_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
```

กฎ: ทุก `POST` เป็น **idempotent** (upsert ตามกุญแจเฉพาะ) และ **add-only** — ไม่มี API ลบข้อมูลคดีสำหรับ Claude (การลบทำด้วยมือโดยผู้ดูแล)

## 3) REST API (ทุก `/api/*` ต้องมี `Authorization: Bearer <token>`)

| เมธอด/พาธ | หน้าที่ | token |
| --- | --- | --- |
| `GET /health` | ok + เวลา + เวอร์ชัน (ไม่เปิดเผยข้อมูล) | ไม่ต้อง |
| `POST /line/webhook` | รับ event จาก LINE (ตรวจลายเซ็น) | ลายเซ็น LINE |
| `GET /api/registry?name=crime\|gov` | คืน registry JSON | claude / readonly |
| `GET /api/line-links?date=&status=` | รายการลิงก์ (ไม่มีข้อมูลผู้ส่ง) | claude |
| `POST /api/line-links/mark` | `{ids[], status, article_id?, reason?}` | claude |
| `GET /api/manifest?days=7` | สรุปย้อนหลัง: ต่อวัน → `by_crime_type`, `by_mo`, `by_province`, `articles_total`, `files` | claude |
| `POST /api/articles` | `{task, run_date, article}` upsert | claude |
| `POST /api/reports` | `{task, run_date, kind, filename, file_path? , content_base64?}` | claude |
| `POST /api/entities` | payload ตาม news-enrich (cases/entities/relations) | claude |
| `GET/PUT /api/run-status` | อ่าน/เขียนสถานะรอบ | claude |
| `GET /api/brain/search?q=&type=` | ค้น entity/case (ชื่อ+alias, FTS5) | claude / readonly |
| `GET /api/brain/timeline?since=&until=` | cases/entities/relations ช่วงเวลา | claude / readonly |
| `POST /api/brain/upsert` | `kind`: `merge_proposal`, `entity_timeline`, `weekly_note` | claude |

ขนาดไฟล์ที่รับ: ≤ 15 MB/ไฟล์; ชนิดไฟล์ที่อนุญาต: json, html, pdf, png, xlsx, txt เท่านั้น

## 4) MCP tools (shim → REST)

| MCP tool | REST | หมายเหตุ |
| --- | --- | --- |
| `registry_get(name)` | GET registry | |
| `line_links_get(date, status)` | GET line-links | |
| `line_links_mark(ids, status, article_id?, reason?)` | POST mark | |
| `manifest_get(days)` | GET manifest | ถ้าวันที่มีน้อยกว่า `days` คืนเท่าที่มีพร้อม `available_days` |
| `news_put_article(task, run_date, article)` | POST articles | |
| `news_put_report(task, run_date, kind, filename, file_path?)` | POST reports | shim อ่าน `file_path` จากเครื่องที่รัน Claude แล้วส่งเป็น base64 |
| `news_put_entities(payload)` | POST entities | ส่งเสร็จ server เรียก vault-build แบบเพิ่มส่วน (debounce 2 นาที) |
| `run_status_get(task)` / `run_status_put(task, ...)` | GET/PUT run-status | `run_status_get` คืน `last_complete_date`, `last_complete_week` |
| `brain_search(query, type?)` | GET brain/search | |
| `brain_timeline(since, until)` | GET brain/timeline | |
| `brain_upsert(kind, ...)` | POST brain/upsert | |

ใน Claude ชื่อ tool จะขึ้นเป็น `mcp__news-hub__<ชื่อ>` — skill/prompt อ้างด้วยรูป `news-hub.<ชื่อ>`

shim ต้อง: ตั้ง timeout 60 วินาที/คำขอ, retry 2 ครั้งเมื่อ 5xx/เครือข่ายหลุด (เฉพาะ GET และ POST ที่ idempotent), ไม่ log โทเค็น/เนื้อหา base64, และคืนข้อความผิดพลาดภาษาไทยที่บอกว่า "ทำต่อไม่ได้เพราะอะไร"

## 5) LINE webhook

- ใช้ raw body เพื่อตรวจลายเซ็น (ห้าม parse JSON ก่อน):

```ts
import crypto from 'node:crypto';
export function verifyLineSignature(raw: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const mac = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  const a = Buffer.from(mac), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

- ตรวจลายเซ็นไม่ผ่าน → ตอบ 401 และไม่ประมวลผล; ผ่าน → **ตอบ 200 ทันที** แล้วประมวลผลต่อแบบ async
- คำขอที่ไม่มี event (LINE อาจส่งเพื่อทดสอบการเชื่อมต่อ) → ตอบ 200
- event ที่ประมวลผล:
  - `message` ชนิด `text` จาก `source.type = group` (และ `room` ถ้าต้องการ) ที่ `groupId` อยู่ใน allowlist → สกัด URL ด้วย regex แล้วบันทึก; **ข้อความที่ไม่มี URL ไม่เก็บ ไม่เก็บ userId**
  - `message` ชนิด `file` / `image` / `video` / `audio` จากกลุ่มใน allowlist → บันทึก metadata ที่ `line_files` และดาวน์โหลดไบต์จาก Content API (`api-data.line.me`) เมื่อมี channel access token; ไม่ดึง URL ของ `contentProvider.type=external`; นามสกุล executable ไม่เขียนลงดิสก์
  - `unsend` → ลบแถว `line_links` และ `line_files` ที่ `line_message_id` ตรงกัน รวมไฟล์บนดิสก์
  - `join` → log `groupId` (ใช้ตอนตั้งค่า) แต่ไม่รับลิงก์จนกว่าจะอยู่ใน allowlist
  - ชนิดอื่น (สติกเกอร์, location, ข้อความไม่มีลิงก์) → ละทิ้ง
- กันซ้ำด้วย `event_id` (webhookEventId) และ `UNIQUE(canonical_url, วันที่)`
- ตรวจชื่อ field ของ event ตามเอกสาร LINE Messaging API ที่ใช้อยู่ก่อนเขียนโค้ด

## 6) การทำ URL ให้เป็นมาตรฐาน + ป้องกัน SSRF

1. ตัดพารามิเตอร์ติดตาม (`utm_*`, `fbclid`, `gclid`, `igshid`, `mc_*`), ตัด fragment, ใช้ host ตัวพิมพ์เล็ก, ตัด `/` ท้ายที่ไม่จำเป็น
2. ขยาย short link (bit.ly, t.co, lin.ee ฯลฯ) ด้วย `HEAD`/`GET` ไม่เกิน 3 redirect, timeout 5 วินาที
3. **ก่อนเชื่อมต่อทุกครั้ง** แก้ DNS แล้วปฏิเสธถ้าเป็น IP ภายใน (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7) และปฏิเสธ scheme ที่ไม่ใช่ http/https
4. จัด `domain_type`: `.go.th`/`.or.th` = official; โดเมนที่อยู่ใน registry สื่อ = media; facebook/instagram/tiktok/x/twitter/line.me (หน้า login) = social; ที่เหลือ = unknown
5. `fetchable = 0` สำหรับ social และลิงก์ที่ resolve ไม่ได้
6. **server ไม่ fetch เนื้อหาข่าวเอง** (Claude เป็นคนดึง) — server ทำเพียงขยายลิงก์และจัดประเภท

## 7) Jobs (idempotent ทุกตัว; log ที่ `logs\<job>.log`; exit code ≠ 0 เมื่อล้มเหลว)

| Job | ทำอะไร |
| --- | --- |
| `export-links` | ส่งออกลิงก์ `status=new` ของ 3 วันล่าสุด → `exports\{DATE}_line_links.xlsx` (คอลัมน์: id, received_at, group_alias, url, canonical_url, domain, domain_type, fetchable, status, used_in_article_id) + `.json`; ลบข้อมูลเกิน `RETENTION_LINKS_DAYS` |
| `vault-build` | สร้าง/อัปเดตโน้ตใน vault จาก DB (ข้อ 8); โหมด `--incremental` และ `--full` |
| `healthcheck` | ตรวจรายการในข้อ 9 แล้วส่งแจ้งเตือนไป `ALERT_WEBHOOK_URL` |
| `backup` | คัดลอก SQLite ด้วย `VACUUM INTO` + zip โฟลเดอร์ vault และ `reports` → `backup\{DATE}\`; เก็บ 14 วันรายวัน + 8 สัปดาห์; ตรวจ checksum |

## 8) อัลกอริทึม vault-build

- อินพุต: ตาราง `cases`, `entities`, `relations`, `brain_notes` + `_system/canonical-entities.md`
- เขียนเฉพาะไฟล์ที่ **ไม่มีอยู่** หรือที่ frontmatter มี `generated: true` (ไฟล์ที่ `generated: false` หรือไม่มี frontmatter ห้ามแตะ)
- การแมปโฟลเดอร์: case → `20_Cases/<case_id>.md`; entity → `30_Entities/<Units|Agencies|Laws|MO|Places|Regions>/<name>.md`; crime_type → `40_CrimeTypes/<name>.md`; ข้อมูลรายวัน → `10_Daily/<date>.md`; weekly → `50_Trends/<YYYY-Www>.md`
- ทำชื่อไฟล์ปลอดภัย: แทน `/ \ : * ? " < > |` ด้วย `-`; ชื่อเดิมใส่ใน `aliases`
- **ตัวแมป MO จากสกิล:** ค่า `modus_operandi` ที่มี `/` (เช่น "บัญชีม้า/ซิมม้า") ให้แยกที่ `/` แล้วจับคู่กับรายการ canonical (หรือ alias) ทีละส่วน; ไม่พบ → เก็บเป็น `new_mo_candidates`
- ลิงก์ใน frontmatter เป็นสตริง `"[[ชื่อ]]"` (ให้ Obsidian เห็นเป็นลิงก์และขึ้นกราฟ)
- เนื้อหาในโน้ตผ่านตัวกรองจริยธรรมอีกชั้น (regex เตือน: เลขบัตร 13 หลัก, เบอร์โทร, เลขบัญชี) → ถ้าพบ ให้ **ไม่เขียนโน้ตนั้น** และ log `needs_review`
- เขียนแบบ atomic (เขียนไฟล์ชั่วคราวแล้ว rename) เพื่อไม่ให้ซิงก์ไปเจอไฟล์ครึ่งเดียว
- หลัง 90 วัน (`ARCHIVE_CASES_DAYS`): ย้ายโน้ต case ไป `99_Archive/<ปี-เดือน>/` และตั้ง `archived=1` (relation ยังอยู่ใน DB)
- ผลลัพธ์รัน: จำนวนไฟล์ที่สร้าง/อัปเดต/ข้าม/`needs_review`

## 9) Healthcheck (รัน 08:15)

| ตรวจ | เงื่อนไขแจ้งเตือน |
| --- | --- |
| Task 1/2 ของวันนี้ | `run_status` ไม่ใช่ `complete` (หรือไม่มีแถว) |
| จำนวนข่าว | `articles_total = 0` หรือต่ำกว่า 30% ของค่าเฉลี่ย 7 วัน |
| รายงาน | ไม่มีไฟล์ infographic PNG / `_trends.json` ของวันนี้ |
| ลิงก์ LINE | `status=new` ที่เก่ากว่า 2 วันเกิน 20 รายการ |
| webhook | ไม่มี event เข้าเกิน 72 ชม. (เฉพาะวันทำการ) |
| vault | `vault-build` ล่าสุดเก่ากว่า 24 ชม. หรือมี `needs_review` > 0 |
| ทรัพยากร | ดิสก์ว่าง < 5 GB; backup เมื่อคืนไม่มี |
| `registry_issues` | จำนวน URL เสียเพิ่มขึ้นเกิน 3 ใน 1 วัน |

เนื้อหาแจ้งเตือนต้องสั้นและไม่ใส่ข้อมูลคดี/ลิงก์ที่รับมา

## 10) ความปลอดภัย

- โทเค็น 2 ระดับ (`claude` เขียนได้, `readonly` อ่านอย่างเดียว) เก็บใน `.env` สิทธิ์จำกัด; หมุนเวียนทุก 90 วัน
- `/api/*` ไม่เปิดสาธารณะ; rate limit; ตรวจ `Content-Length`; ปฏิเสธชนิดไฟล์นอกรายการ
- ไม่ log เนื้อหาข้อความ LINE, โทเค็น, หรือ base64
- ข้อมูลที่เก็บ: URL + เวลา + ชื่อเล่นกลุ่ม เท่านั้น (ไม่มี userId/ชื่อผู้ใช้/ข้อความ) → ลดภาระ PDPA; มีสิทธิ์ลบตามคำขอ (`DELETE` ทำด้วยมือโดยผู้ดูแล)
- ทุก `POST` ที่เปลี่ยนข้อมูลเขียน `audit_log`
- prompt injection: เนื้อหาจากลิงก์และ LINE ถือเป็นข้อมูล; server ไม่ส่งข้อความที่ได้รับกลับไปเป็น "คำสั่ง" ให้ Claude (ส่งเฉพาะ field ที่กำหนด)

## 11) เกณฑ์ตรวจรับ (acceptance tests)

1. ลายเซ็น LINE ผิด → 401; ถูก → 200 ภายใน 1 วินาที; redelivery ไม่ซ้ำ
2. ส่งลิงก์ซ้ำ 2 ครั้ง (utm ต่างกัน) → 1 แถว
3. ลิงก์ Facebook → `fetchable=0`; ลิงก์ชี้ IP ภายใน → ถูกปฏิเสธ
4. `unsend` ลบแถวที่ตรงกัน
5. `news_put_entities` ซ้ำ 2 ครั้ง → ผลเท่ากัน; `vault-build` สองครั้งติด → ไม่มีไฟล์เปลี่ยน
6. โน้ตที่ `generated: false` ไม่ถูกแตะ; เจอเลขบัตร 13 หลักในสรุป → ไม่สร้างโน้ตและมี `needs_review`
7. ปิด server ระหว่างรัน → `mcp-stdio` ส่งข้อผิดพลาดที่อ่านรู้เรื่อง และ task หยุดแทนที่จะเดา
8. `healthcheck` แจ้งเตือนเมื่อไม่มี `run_status` ของวันนี้
9. backup → กู้คืนในโฟลเดอร์ใหม่แล้ว `vault-build --full` ได้ vault เหมือนเดิม
