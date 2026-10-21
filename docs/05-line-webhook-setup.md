# LINE → Webhook → DB → export → MCP

เป้าหมาย: กลุ่ม LINE เป็นแหล่งลิงก์จริง — **ไม่ใช้ Excel เป็น DB**

```
LINE กลุ่ม → Bot → Webhook → SQLite
                              ├─ export Excel/JSON ทุกเช้า 05:00 ICT (ตรวจดู)
                              └─ MCP news-hub (Task-2 อ่าน/mark)
```

## 1) ตั้งค่า LINE OA

1. LINE Developers → Channel type **Messaging API**
2. เปิด **Allow bot to join group chats**
3. ในกลุ่ม: เชิญบอทเข้ากลุ่ม แล้ว **ปิด** auto-reply / greeting / join message ที่รบกวน
4. บอทอ่านได้เฉพาะข้อความ**หลัง**เข้ากลุ่ม — ไม่ย้อนของเก่า
5. Webhook URL: `https://<PUBLIC_BASE_URL>/line/webhook` (alias `/webhook/line` ก็ได้)
6. เปิด Use webhook; ปิด Response mode ถ้าไม่ต้องการ reply จากบอท
7. คัดลอก **Channel secret** → `LINE_CHANNEL_SECRET`
8. หา `groupId` (จาก webhook log ครั้งแรก หรือ Messaging API) → `LINE_ALLOWED_GROUP_IDS`
9. แจ้งสมาชิกกลุ่มว่าบอทเก็บ**เฉพาะลิงก์ URL** เพื่อ PDPA

## 2) รัน news-hub บนเครื่องที่เปิดตลอด

```bash
cd server
cp .env.example .env   # แก้ secret / groupId / tokens
npm install
npm run dev            # หรือ npm run build && npm start
```

เปิด tunnel (Cloudflare / ngrok) ชี้มาที่ `:8080` แล้วใส่ URL ใน LINE webhook

ตรวจ: `GET /health`

## 3) สิ่งที่ webhook ทำ

| ขั้น | พฤติกรรม |
|------|----------|
| Signature | HMAC-SHA256 raw body ด้วย channel secret (`x-line-signature`) |
| ตอบ LINE | HTTP 200 ทันที แล้วค่อยประมวลผล |
| Allowlist | รับเฉพาะ `groupId` ใน `LINE_ALLOWED_GROUP_IDS` |
| เก็บอะไร | URL จากข้อความ `text` เท่านั้น — ไม่เก็บข้อความอื่น / ไม่เก็บ userId |
| Unsend | ลบแถวที่มี `line_message_id` ตรงกัน |
| Canonical | ตัด `utm_*` / `fbclid` ขยาย short link (timeout + กัน SSRF) |
| domain_type | `official` / `media` / `social` / `unknown` — `social` → `fetchable=false` |

## 4) Export เช้า (ก่อน Claude Task)

```bash
# cron / Task Scheduler 05:00 Asia/Bangkok
cd server && npm run job:export-links
```

ได้ไฟล์:

- `exports/{DATE}_line_links.xlsx`
- `exports/{DATE}_line_links.json`

คอลัมน์: `id, received_at(ICT), group_alias, url, canonical_url, domain, domain_type, fetchable, status, used_in_article_id`

## 5) MCP สำหรับ Claude (แก้ปัญหา session ใหม่ไม่มี memory)

`plugin/news-intel/.mcp.json` ชี้ไป `server/dist/mcp-stdio.js` (หรือ `tsx src/mcp-stdio.ts` ตอน dev)

Tools:

- `line_links_get` — อ่านจาก DB (แหล่งจริง)
- `line_links_mark` — หลังใช้ในบทความ
- `run_status_get` / `run_status_put` — สถานะรอบก่อน
- `export_path_hint` — path Excel ถ้าต้องเปิดดูเอง

**กฎ Task-2:** ใช้ MCP ก่อน; Excel เป็น fallback สำหรับคนตรวจ ไม่ใช่ source of truth

## 6) ประเด็น scheduled task (Claude)

ทุก session เริ่มใหม่ — อย่าพึ่งไฟล์ใน workspace ของ Claude เป็น state

| จุดที่พังถ้าไม่มี DB/MCP | แก้ |
|--------------------------|-----|
| ไม่รู้ลิงก์เช้านี้มีอะไร | `line_links_get` / JSON export บนเครื่อง news-hub |
| ไม่รู้ลิงก์ไหนใช้ไปแล้ว | `status` ใน DB + `line_links_mark` |
| ไม่รู้รอบก่อนสำเร็จหรือไม่ | `run_status_get` |

Skill/plugin อ่าน**กฎ**ได้; ข้อมูลรันไทม์ต้องมาจาก news-hub
