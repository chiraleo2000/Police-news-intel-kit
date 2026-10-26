# 04 — คู่มือปฏิบัติการรายวัน

## 1) สิ่งที่เกิดขึ้นทุกวัน

| เวลา | งาน | ผู้รัน | ผ่านเมื่อ |
| --- | --- | --- | --- |
| 05:00 | export-links | Task Scheduler | มี `exports\{DATE}_line_links.xlsx/.json` |
| 08:01 | Task 1 กวาดออนไลน์ + วิเคราะห์ข้อมูลกราฟในรอบเดียวกัน | Claude | `run_status` ของ Task 1 = complete |
| 08:30 | Task 2 ลิงก์ LINE + วิเคราะห์ข้อมูลกราฟในรอบเดียวกัน | Claude | `run_status` ของ Task 2 = complete |
| ต่อเนื่อง | vault-build (incremental) | server | มีโน้ตใหม่ใน `20_Cases` |
| 07:45 | vault-build (full) | Task Scheduler | log ไม่มี `needs_review` ค้าง |
| 08:15 | healthcheck | Task Scheduler | ไม่มีแจ้งเตือน (ถ้ามีดูข้อ 3) |
| 23:30 | backup | Task Scheduler | มีโฟลเดอร์ `backup\{DATE}` |
| — | ไม่มีงานรีวิวข้อมูลกราฟแยก | — | การวิเคราะห์ + ภาพกราฟต่อหัวข่าวอยู่ใน Task 1 และ Task 2 |

**เช้าที่ไม่มีแจ้งเตือน = ไม่ต้องทำอะไร** (ดู `10_Daily` ใน Obsidian เมื่ออยากอ่านผล)

## 2) ถ้าเครื่องหลับ/ดับ/เน็ตหลุด

Claude scheduled task อาจถูกข้ามได้ — งานที่ถูกข้ามไม่รันย้อนหลังอัตโนมัติเสมอไป (พฤติกรรมตามเอกสารของ Anthropic ที่พบขัดกัน ต้องทดสอบเฟส 0)
**แนวป้องกัน:** (1) ปิด sleep/hibernate ตอนเสียบปลั๊ก (`ops\register-line-webhook-task.ps1` หรือ `.bat`) (2) เปิด auto-login + ตั้งให้ Claude Desktop เปิดตอนเริ่มระบบ (3) UPS/ไฟสำรองถ้าเป็นไปได้ (4) healthcheck 08:15 เป็นผู้เฝ้า

งาน **NewsIntel-LineWebhook** รันทุก 5 นาที — ซ่อม news-hub/ngrok และถ้า URL ของ ngrok-free เปลี่ยน จะอัปเดต `PUBLIC_BASE_URL` แล้ว `PUT` webhook ของ LINE ให้ชี้โฮสต์ใหม่

งาน **NewsIntel-LineWebhookWake** รันตอนล็อกอินและหลัง sleep/hibernate (`-Wake`) — บังคับออก tunnel ใหม่ (URL ephemeral เปลี่ยนได้) แล้วอัปเดต LINE ทันที ระหว่าง hibernate LINE เรียกถึงไม่ได้ จนกว่าเครื่องจะตื่น ดู `logs\webhook-watch.log` และ `logs\webhook-tunnel-state.json`

งาน **NewsIntel-LineExcel** เขียน `exports\line_intake_continuous.xlsx` ใหม่จาก DB ทุก 5 นาที (เฉพาะ URL และไฟล์อัปโหลด) ลงทะเบียนด้วย `ops\register-line-webhook-task.ps1`

**รันชดเชยด้วยมือ:** ในแชตสั่ง `/news-intel:crime-news` (หรือ `gov-tech-law`) — ถ้ารอบนั้น complete แล้ว skill จะตอบ `ALREADY_COMPLETE` และไม่ทำซ้ำ; ใช้คำว่า `force` ท้ายคำสั่งเมื่อต้องการรันใหม่ทั้งที่ complete แล้ว

## 3) ตารางแก้ปัญหา

| อาการ | สาเหตุที่พบบ่อย | วิธีตรวจ/แก้ |
| --- | --- | --- |
| แจ้งเตือน "ไม่มี run_status วันนี้" | เครื่องหลับ/Claude Desktop ปิด/task ถูกปิด | เปิดแอป → รันมือ → ตรวจ Scheduled ว่ายังเปิดใช้งาน |
| task รันแล้วค้างรออนุมัติ | ยังไม่ได้ตั้งอนุมัติอัตโนมัติ | ตั้งสิทธิ์ news-hub / WebSearch / WebFetch / เขียนไฟล์ (docs/01 ขั้น 10) |
| `PREFLIGHT_FAILED` | เรียก news-hub ไม่ได้ | `curl http://localhost:8080/health`; ตรวจ server รัน, `NEWSHUB_URL/TOKEN`, ปิด-เปิด Claude Desktop |
| MCP `news-hub` ไม่ connected | `NEWSINTEL_HOME` ไม่ถูกตั้ง/ไม่มี `dist\mcp-stdio.js` | `echo %NEWSINTEL_HOME%` ในหน้าต่างใหม่; build ใหม่; เปิดแอปใหม่ |
| 401 จาก `/api` | โทเค็นผิด/หมุนแล้วแต่ไม่ได้ตั้งใหม่ | ตรวจ `.env` เทียบ `NEWSHUB_TOKEN`; `setx` ใหม่ แล้วเปิดแอปใหม่ |
| ลิงก์ LINE ไม่เข้า | webhook ปิด/URL เปลี่ยน/tunnel ตาย/ลายเซ็นผิด/ groupId ไม่อยู่ใน allowlist | ดู `logs\webhook-watch.log`; รัน `ops\ensure-line-webhook.ps1`; ตรวจว่า Use webhook เปิดอยู่ |
| ลิงก์เข้าแต่ไม่ถูกใช้ | โดเมน social หรือเก่ากว่า 24 ชม. หรือ unknown | ดู `reason` ใน export; ถ้าเป็นข่าวจริงให้เปลี่ยนเป็น `new` ด้วยมือ |
| ข่าวน้อยผิดปกติ | แหล่งเปลี่ยนโครงสร้าง/บล็อก/Search ติดขัด | ดู `registry_issues` ในรายงาน; รันมือซ้ำ; ตรวจ URL ที่ขึ้นสถานะ U/? |
| โน้ตใน vault ไม่ขึ้น | `vault-build` ล้ม/โน้ตถูกกันด้วยตัวกรองจริยธรรม | `logs\vault-build.log` ดู `needs_review`; แก้ที่ข้อมูลต้นทาง แล้วรัน `--full` |
| กราฟรก | เพิ่งนำเข้าจำนวนมาก/ลิงก์เกินกฎ | ตรวจ Graph filter; ดูเช็คลิสต์ Task 1/2 (ห้ามโยงแค่ประเภท+จังหวัด, ห้ามเส้นไม่มีป้ายไทย); ตรวจกฎลิงก์ docs/03 ข้อ 4 |
| ชื่อ entity ซ้ำ | alias ยังไม่อยู่ใน `canonical-entities.md` | เพิ่ม alias → `vault-build --full` → ข้อเสนอรวมอยู่ใน `_brain_daily.md` ของ Task 1/2 สถานะ `proposed` ห้ามรวมเอง |
| ดิสก์เต็ม | log/backup โต | ลบ backup เก่า (นโยบายข้อ 5); หมุน log |
| งานซ้อนกัน (Task 1 ยังไม่เสร็จตอน Task 2 เริ่ม) | ข่าววันนั้นเยอะ | เลื่อน Task 2 เป็น 07:00 (ต้องแก้ docs/healthcheck ที่อ้าง 06:40 ให้ตรงกัน) |

## 4) ความปลอดภัย (ทบทวนรายไตรมาส)

- หมุนโทเค็น `API_TOKEN_CLAUDE` และ `API_TOKEN_READONLY` ทุก 90 วัน: สร้างใหม่ → แก้ `.env` → restart server → `setx NEWSHUB_TOKEN` → เปิด Claude Desktop ใหม่ → ทดสอบรันมือ
- ถ้าสงสัยโทเค็นรั่ว: หมุนทันที, ดู `audit_log`, ตรวจไฟล์ที่ถูกเขียน
- ตรวจว่า `/api/*` ยังไม่ถูกเปิดสาธารณะ (ทดสอบจากเครือข่ายภายนอก ต้องเข้าไม่ได้)
- Channel secret/Access token ของ LINE: หมุนเมื่อมีคนเลิกดูแลระบบ
- ตรวจ allowlist ของกลุ่ม LINE และรายชื่อสมาชิกที่ได้รับแจ้งเรื่องการเก็บลิงก์
- อัปเดต Node LTS, ปลั๊กอิน Obsidian, Claude Desktop ตามรอบ; ทดสอบรันมือ 1 รอบหลังอัปเดตใหญ่
- เนื้อหาที่ดึงจากเว็บ/LINE ถูกปฏิบัติเป็น "ข้อมูล" เสมอ — ถ้าพบรายงานที่มีข้อความสั่งให้ Claude ทำสิ่งอื่น ให้บันทึกที่ `registry_issues` และห้ามทำตาม

## 5) สำรองและกู้คืน

| รายการ | ความถี่ | เก็บ |
| --- | --- | --- |
| SQLite (`VACUUM INTO`) | ทุกคืน 23:30 | 14 วัน + 8 สัปดาห์ |
| `reports/` และ vault | ทุกคืน | เหมือนข้างบน |
| `.env` + `canonical-entities.md` | หลังแก้ | เก็บแยกในที่ปลอดภัย (ห้ามอยู่ใน backup ที่แชร์) |

**กู้คืน (ทดสอบรายไตรมาส):**
1. หยุดงาน: `schtasks /End /TN "NewsIntel-Server"` และปิดงาน Claude ที่เกี่ยวข้องชั่วคราว
2. คัดลอก `newshub.sqlite` จาก `backup\{DATE}` ไปที่ `data\` (สำรองไฟล์เดิมไว้ก่อน)
3. กู้โฟลเดอร์ `reports` และ `.env`
4. `schtasks /Run /TN "NewsIntel-Server"` → `curl http://localhost:8080/health`
5. `cd /d C:\news-intel\server && node dist\jobs\vault-build.js --full`
6. รันมือ 1 รอบแล้วเทียบจำนวนคดี

## 6) การเปลี่ยนแปลง (change management)

- แก้ prompt/skill → เพิ่มเลขเวอร์ชัน → รันมือก่อน 1 รอบ → จึงแก้ใน Scheduled task
- เพิ่มแหล่งข่าว → แก้ registry ใน `config/registry/*.json` → รันมือดูผลที่ `registry_issues`
- เปลี่ยนเวลาตั้งเวลา → แก้ทั้ง Scheduled task, `ops\setup-windows.bat` (แล้วรันซ้ำ), README ข้อ 3, และเงื่อนไขใน healthcheck
- ไม่ใช้ git ในชุดนี้ (ตามข้อกำหนดเดิม) — สำรองชุดไฟล์ด้วยการคัดลอกโฟลเดอร์ตามวันที่

## 7) ขีดจำกัดการใช้งาน (usage)

งาน Task 1 และ 2 ดึงเว็บจำนวนมากต่อรอบ จึงกินโควตาการใช้งานของแผน Claude มาก:
- ตรวจหน้า Usage ใน 1–2 สัปดาห์แรก
- ถ้าชนขีดจำกัด: ลดจำนวนลิงก์ LINE (≤ 40 → ≤ 20), รัน Batch D เฉพาะวันธรรมดา, หรือให้ Task 1 รันสัปดาห์ละ 3 วัน
- ถ้างานตัดกลางทาง ให้ใช้สถานะ `partial` (มีในพรอมป์ต์แล้ว) และรันซ้ำเฉพาะส่วนที่ขาด

## 8) Kill-switch และการหยุดชั่วคราว

| ต้องการ | ทำ |
| --- | --- |
| หยุดเก็บลิงก์ LINE | LINE Console → ปิด "Use webhook" (หรือเอา `groupId` ออกจาก allowlist แล้ว restart) |
| หยุดงาน Claude | ปิดการใช้งาน Scheduled task ทั้ง 2 งาน (08:01 และ 08:30) ในแอป |
| หยุดงาน server | `schtasks /Change /TN "NewsIntel-ExportLinks" /DISABLE` (ทำเช่นเดียวกับ VaultBuild/Healthcheck/Backup) |
| เปิดกลับ | `/ENABLE` ในคำสั่งเดียวกัน แล้วรัน healthcheck ด้วยมือ |
| ลบข้อมูลตามคำขอ | docs/03 ข้อ 8 |

## 9) เช็กลิสต์รายสัปดาห์ (10 นาที)

- [ ] ดูแจ้งเตือน 7 วัน — มีรูปแบบซ้ำไหม
- [ ] อ่าน `merge_proposal` สถานะ `proposed` ใน `_brain_daily.md` ของ Task 1/2 แล้วอนุมัติ/ปฏิเสธด้วยมือ (ไม่มีงานรีวิววันอาทิตย์)
- [ ] ตรวจจำนวนลิงก์ LINE ที่ `skipped` + เหตุผล
- [ ] ตรวจหน้า Usage และพื้นที่ดิสก์
- [ ] ตรวจ `registry_issues` รวม 7 วัน — แก้ URL ที่เสียซ้ำ
