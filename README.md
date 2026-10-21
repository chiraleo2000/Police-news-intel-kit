# news-intel-kit — ชุดติดตั้งไปป์ไลน์ข่าวรายวัน (LINE → Claude → Obsidian)

ชุดนี้รวมทุกอย่างที่ต้องมีเพื่อรันตามเวลาทุกวัน ยกเว้น **โค้ดของ news-hub server** (ดูหัวข้อ "สิ่งที่ยังไม่อยู่ในชุดนี้")

## 1) คำตอบเรื่อง Obsidian: ควรเพิ่ม — ถ้าใช้เป็น "ชั้นแสดงผลและสำรวจความสัมพันธ์"

**เหตุผลที่คุ้ม**
- กราฟ/backlinks เห็นความเชื่อมโยง หน่วยงาน ↔ คดี ↔ รูปแบบการกระทำผิด ↔ จังหวัด ↔ กฎหมาย ได้เร็วกว่าอ่านรายงาน
- ไฟล์เป็น Markdown ธรรมดา: ค้นหา/ถ่ายโอน/สำรองง่าย ไม่ผูกกับเครื่องมือใดเครื่องมือหนึ่ง
- Bases (ฟีเจอร์หลักของ Obsidian ตั้งแต่ 1.9) และ Dataview ทำตาราง/แดชบอร์ดจาก frontmatter ได้โดยไม่ต้องเขียนโค้ด

**ข้อควรระวังที่ทำให้ออกแบบเป็นแบบนี้**
| ความเสี่ยง | วิธีรับมือในชุดนี้ |
| --- | --- |
| LLM เขียนไฟล์ vault ตรง ๆ → ชื่อเพี้ยน ซ้ำ ลิงก์พัง | Claude ส่ง JSON เข้า news-hub; **server เป็นคนเดียวที่เขียนโน้ต** (idempotent) |
| กราฟรก เมื่อมีข่าววันละหลายสิบเรื่อง | โน้ตหลักเป็น "คดี" (หลัง merge) ไม่ใช่ "บทความ"; จำกัดจำนวนลิงก์ต่อคดี; ไม่ลิงก์เข้าโน้ตวันที่; เก็บถาวรหลัง 90 วันและกรองออกจากกราฟ |
| ชื่อ entity ไม่ตรงกันข้ามวัน | `canonical-entities.md` + `brain_search` ก่อนสร้างใหม่ + ข้อเสนอรวมชื่อรายสัปดาห์ (ไม่รวมเอง) |
| ข้อมูลคดี/ผู้ต้องหาอยู่ในไฟล์ที่ซิงก์ได้ | ไม่สร้างโน้ตบุคคลสำหรับผู้ต้องหา/ผู้เสียหาย; vault เป็นความลับภายใน ห้ามซิงก์สาธารณะ; ลบที่ DB แล้ว rebuild |
| Obsidian ใช้ทีละคน | ทีมดูผ่านเว็บ (GitHub Pages ที่คุณมีแผนไว้) ส่วน Obsidian เป็นเครื่องมือวิเคราะห์ของคุณ |

**สรุปบทบาท:** DB = แหล่งความจริง · Obsidian = มุมมองและเครื่องมือวิเคราะห์ · เว็บ = เผยแพร่ · Claude = เก็บข่าว + วิเคราะห์

## 2) สถาปัตยกรรม

```
LINE กลุ่ม ─▶ LINE OA (bot) ─▶ /line/webhook ─┐
                                              ▼
                              ┌────────── news-hub server (Node + SQLite) ──────────┐
                              │ line_links · articles · cases · entities · relations │
                              │ jobs: export-links · vault-build · healthcheck · backup │
                              └──────▲────────────────────────────┬─────────────────┘
        REST + bearer                │                            │ เขียนโน้ต Markdown (เฉพาะ server)
   ┌──────────────┐  stdio  ┌────────┴────────┐                   ▼
   │ Claude tasks │◀───────▶│ mcp-stdio shim  │            Obsidian vault (กราฟ/Bases)
   │ (plugin      │         └─────────────────┘            └─ ซิงก์ไปเครื่องคุณ (ทางเลือก)
   │  news-intel) │──▶ เว็บ/แหล่งข่าว (WebSearch/WebFetch)
   └──────────────┘
```

## 3) ตารางเวลารายวัน (Asia/Bangkok)

| เวลา | งาน | ผู้รัน |
| --- | --- | --- |
| 05:00 | `export-links` ส่งออกลิงก์ LINE เป็น `.xlsx` + `.json` | server (Windows Task Scheduler) |
| 06:00 | Task 1 ข่าวกฎหมายเทคโนโลยีภาครัฐ | Claude scheduled task |
| 06:40 | Task 2 ข่าวอาชญากรรม/ตำรวจ + ลิงก์ LINE | Claude scheduled task |
| ต่อเนื่อง | `vault-build` แบบเพิ่มส่วน (debounce 2 นาที หลังได้ entities) | server |
| 07:45 | `vault-build` เต็มรูปแบบ (ประกันความถูกต้อง) | server |
| 08:15 | `healthcheck` + แจ้งเตือนถ้าผิดปกติ | server |
| อาทิตย์ 20:00 | Task 3 ทบทวน Second Brain | Claude scheduled task |
| 23:30 | `backup` DB + vault | server |

**หลักสำคัญ:** server คือ "ผู้เฝ้า" (watchdog) — ถ้า Claude task ไม่รัน (เครื่องหลับ/แอปปิด/เน็ตหลุด) server จะเห็นว่าไม่มี `run_status` แล้วแจ้งเตือน

## 4) สารบัญไฟล์

```
README.md                         ← ไฟล์นี้
docs/01-install-windows.md        ← ขั้นตอนติดตั้งทั้งหมด (LINE, server, Obsidian, Claude, ตั้งเวลา, ทดสอบ)
docs/02-news-hub-spec.md          ← สเปกของ server: DB, REST, MCP tools, jobs, LINE webhook, ความปลอดภัย
docs/03-obsidian-vault.md         ← โครง vault, รูปแบบโน้ต, ปลั๊กอิน, คิวรีกราฟ/Bases, ความเป็นส่วนตัว
docs/04-operations-runbook.md     ← ปฏิบัติการรายวัน, แจ้งเตือน, แก้ปัญหา, สำรอง/กู้คืน, ความปลอดภัย

prompts/                          ← แหล่งความจริงของ prompt ตั้งเวลา (แก้ที่นี่ก่อน)
scheduled-tasks/                  ← packages พร้อมวางใน Claude Scheduled Task / ~/.claude/scheduled-tasks/
  daily-gov-tech-law-news/SKILL.md
  daily-crime-news/SKILL.md
  weekly-brain-review/SKILL.md

plugin/                           ← ปลั๊กอิน news-intel (skills, commands, agent, .mcp.json)
  news-intel/skills/
    police-crime-news-pipeline/   ← จาก police-crime-news-pipeline.md + v1.2 MCP addendum
    gov-tech-law-news/
    line-link-intake/             ← Batch L (ลิงก์ LINE)
    news-enrich/
    second-brain-update/
  news-intel/.mcp.json            ← ชี้ MCP news-hub

server/                           ← skeleton news-hub (ดู docs/02; ยังไม่รันได้)
schemas/                          ← JSON Schema + สรุป MCP tools
vault-template/_system/           ← README ของ vault + canonical-entities.md
ops/setup-windows.bat             ← สร้างโฟลเดอร์ runtime + Task Scheduler
data/ exports/ logs/ backup/      ← runtime placeholders (.gitkeep)
police-crime-news-pipeline.md     ← เอกสารต้นทาง skill อาชญากรรม (canonical อยู่ที่ plugin)
```

## 5) ลำดับที่แนะนำ (อย่าข้ามเฟส)

| เฟส | ทำอะไร | ผ่านเมื่อ |
| --- | --- | --- |
| 0 | ทดสอบว่า scheduled task ของคุณเรียก MCP `news-hub` ตอนไม่มีคนเฝ้าได้ (ดู docs/01 ขั้น 8) | task ทดสอบอ่านลิงก์ LINE แล้วเขียนไฟล์ทดสอบกลับได้ |
| 1 | LINE OA + webhook + DB + export `.xlsx` | ส่งลิงก์ในกลุ่มแล้วเห็นในไฟล์ 05:00 วันถัดไป |
| 2 | Task 2 (อาชญากรรม) รันมือด้วย `/crime-news` | ได้ article/รายงาน/infographic เข้า news-hub |
| 3 | ตั้ง schedule Task 1, 2 + healthcheck | 3 วันติดต่อกัน `complete` ทุกวัน |
| 4 | เปิด vault + Bases/กราฟ | เห็นคดีของวันและความเชื่อมโยงใน Obsidian |
| 5 | Task 3 รายสัปดาห์, เว็บ GitHub Pages, A2A/Engagement | ตามแผนภาพของคุณ |

## 6) Claude schedules — วิธีใช้ repo นี้

1. ติดตั้ง plugin จาก `plugin/` (marketplace local `news-intel-local`)
2. เปิด `scheduled-tasks/<task>/SKILL.md` → คัดลอกกล่อง **PROMPT** ไปสร้าง Scheduled Task
3. แนบ skills ตามตารางใน `scheduled-tasks/README.md` + ตั้งอนุมัติอัตโนมัติ
4. แก้ prompt ที่ `prompts/` แล้ว sync ไป `scheduled-tasks/` (อย่าแก้แค่ข้างเดียว)

## 7) สิ่งที่ยังไม่อยู่ในชุดนี้ และสิ่งที่ต้องตรวจเอง

- **โค้ด news-hub ที่รันได้**: มี skeleton ที่ `server/` + สเปก docs/02 — ยังไม่มี implementation จริง (stub `process.exit(1)`)
- **รันไม่ต้องมีคนเฝ้าได้แค่ไหน**: เอกสาร Anthropic มีข้อความขัดกัน — ออกแบบให้ใช้เครื่องเปิดตลอด + server เป็น watchdog และทดสอบเฟส 0 ก่อน
- **รูปแบบ plugin/marketplace**: อิง `.claude-plugin/plugin.json`, `skills/`, `commands/`, `agents/`, `.mcp.json` — ชื่อเมนูในแอปอาจต่างกัน
- **ไวยากรณ์ `.base` ของ Obsidian Bases**: ตัวอย่างใน docs/03 ต้องตรวจกับเวอร์ชันที่ติดตั้ง
- **URL ใน registry**: ไฟล์ `server/config/registry/*.json` ยังเป็นโครงเปล่า — ต้องแปลงจากตารางใน skill
