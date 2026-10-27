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
9. แจ้งสมาชิกกลุ่มว่าบอทเก็บ**เฉพาะลิงก์ URL และไฟล์ที่อัปโหลด** (ไม่เก็บข้อความอื่น) เพื่อ PDPA

## 2) รัน news-hub บนเครื่องที่เปิดตลอด

```bash
cd server
cp .env.example .env   # แก้ secret / groupId / tokens
npm install
npm run dev            # หรือ npm run build && npm start
```

เปิด tunnel (ngrok free หรือ Cloudflare) ชี้มาที่พอร์ตใน `.env` (ตอนนี้ `18080`)

**ngrok-free:** URL เปลี่ยนทุกครั้งที่โปรเซส/เครื่องตื่นจาก hibernate  
งาน `NewsIntel-LineWebhookWake` จะเปิด tunnel ใหม่ แล้ว `PUT` webhook ของ LINE ให้เอง (`PUBLIC_BASE_URL` + `/line/webhook`)  
งาน `NewsIntel-LineWebhook` ตรวจทุก 5 นาที ถ้า URL ตายหรือ LINE ชี้คนละโฮสต์จะซ่อมอัตโนมัติ

ตรวจ: `GET /health` และ `logs\webhook-watch.log`

## 3) สิ่งที่ webhook ทำ

| ขั้น | พฤติกรรม |
|------|----------|
| Signature | HMAC-SHA256 raw body ด้วย channel secret (`x-line-signature`) |
| ตอบ LINE | HTTP 200 ทันที แล้วค่อยประมวลผล |
| Allowlist | รับเฉพาะ `groupId` ใน `LINE_ALLOWED_GROUP_IDS` |
| เก็บอะไร | URL จากข้อความ `text` และไฟล์อัปโหลด `file` / `image` / `video` / `audio` — ข้อความที่ไม่มีลิงก์ทิ้ง / ไม่เก็บ userId |
| ไฟล์ | ดาวน์โหลดจาก LINE Content API เมื่อมี `LINE_CHANNEL_ACCESS_TOKEN` เก็บที่ `LINE_FILES_PATH` (เพดาน `LINE_FILE_MAX_BYTES`) ไฟล์ executable ไม่เขียนลงดิสก์ ถ้าเป็น external URL เก็บเฉพาะ metadata |
| Unsend | ลบแถว `line_links` / `line_files` ที่ `line_message_id` ตรงกัน และลบไฟล์บนดิสก์ |
| Canonical | ตัด `utm_*` / `fbclid` ขยาย short link (timeout + กัน SSRF) |
| domain_type | `official` / `media` / `social` / `unknown` — `social` → `fetchable=false` |

## 4) Export (ต่อเนื่อง + เช้า)

งาน **NewsIntel-LineExcel** เขียนไฟล์เดียวตลอดเวลา:

- `exports/line_intake_continuous.xlsx` (+ `.json`)
- แผ่น `line_intake`: แถว `kind=url` หรือ `kind=file` เท่านั้น (ข้อความแชทไม่มีลิงก์ไม่ถูกเก็บ)
- อัปเดตหลังทุก webhook และทุก 5 นาที

```bash
# เช้า: snapshot รายวัน (ก่อน Claude Task) — ยังใช้ได้
cd server && npm run job:export-links
# มือ: rewrite continuous workbook
cd server && npm run job:export-continuous
```

ไฟล์รายวัน (ทางเลือก):

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

**กฎ Task-2:** อ่าน `exports/line_intake_continuous.json` เป็นหลัก ใช้ลิงก์ของวันนี้ และลิงก์เมื่อวานที่ `status` ยังเป็น `new` MCP เป็นทางเลือก

## 6) ประเด็น scheduled task (Claude)

ทุก session เริ่มใหม่ — อย่าพึ่งไฟล์ใน workspace ของ Claude เป็น state

| จุดที่พังถ้าไม่มี DB/MCP | แก้ |
|--------------------------|-----|
| ไม่รู้ลิงก์เช้านี้มีอะไร | `line_links_get` / JSON export บนเครื่อง news-hub |
| ไม่รู้ลิงก์ไหนใช้ไปแล้ว | `status` ใน DB + `line_links_mark` |
| ไม่รู้รอบก่อนสำเร็จหรือไม่ | `run_status_get` |

Skill/plugin อ่าน**กฎ**ได้; ข้อมูลรันไทม์ต้องมาจาก news-hub
