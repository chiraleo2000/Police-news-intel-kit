# 01 — ติดตั้งทั้งหมด (Windows)

ใช้เครื่องที่ **เปิดตลอด** (เดสก์ท็อป/มินิพีซี/VM) เครื่องเดียวสำหรับ server + Obsidian vault + Claude Desktop ในเฟสแรก
(Topology A) แล้วค่อยย้าย server ไป Azure VM ภายหลังได้ (Topology B: เปลี่ยนแค่ `NEWSHUB_URL`)

## ขั้น 0 — เตรียมของ

| รายการ | รายละเอียด |
| --- | --- |
| Windows 10/11 หรือ Server | บัญชีผู้ดูแล (Administrator) |
| เวลาเครื่อง | ตั้ง Time zone = `(UTC+07:00) Bangkok, Hanoi, Jakarta` (ตรวจด้วย `tzutil /g` ต้องได้ `SE Asia Standard Time`) |
| Node.js LTS | เวอร์ชัน 22 หรือใหม่กว่า → ตรวจ `node -v` และ `npm -v` |
| Obsidian | เวอร์ชันล่าสุด (ต้องมี Bases เป็นปลั๊กอินหลัก) |
| Claude Desktop | ล็อกอินแผนที่รองรับ scheduled tasks + plugins + custom MCP |
| บัญชี LINE Developers + LINE Official Account | สิทธิ์สร้าง Messaging API channel |
| โดเมน/ช่องทาง HTTPS สาธารณะ | สำหรับ webhook (ขั้น 3) |
| ที่ว่างดิสก์ | ≥ 20 GB |

## ขั้น 1 — โครงโฟลเดอร์

ค่าเริ่มต้น `C:\news-intel` (เปลี่ยนได้โดยส่งพารามิเตอร์ให้ .bat)

```
C:\news-intel\
  server\     โค้ด news-hub (+ .env)
  data\       newshub.sqlite
  vault\      Obsidian vault
  exports\    ไฟล์ .xlsx/.json ของลิงก์ LINE ที่ส่งออกทุกเช้า
  backup\     สำรองรายคืน
  logs\       log ของ server และ jobs
```

`ops\setup-windows.bat` สร้างทั้งหมดนี้ให้ (ขั้น 5) และตั้งตัวแปรระบบ `NEWSINTEL_HOME`

## ขั้น 2 — สร้าง LINE Official Account + Messaging API

1. LINE Developers Console → สร้าง Provider → สร้าง **Messaging API channel** (หรือเปิด Messaging API ให้ LINE OA ที่มีอยู่)
2. แท็บ **Basic settings** → คัดลอก **Channel secret** → ใส่ `.env` (ขั้น 4)
3. แท็บ **Messaging API** → ออก **Channel access token (long-lived)** (ต้องใช้เมื่อให้บอทตอบ/ออกกลุ่ม; ถ้าบอทอ่านอย่างเดียวยังไม่จำเป็น)
4. ใน **LINE Official Account Manager** → Settings → Response settings:
   - Auto-response messages = **OFF**, Greeting message = **OFF**
   - Webhook = **ON**
   - เปิด **"Allow bot to join group chats"** (ชื่อเมนูอาจต่างตามเวอร์ชัน)
5. ชวนบอทเข้ากลุ่มที่ต้องการ **จากนั้นบอทจะได้เฉพาะข้อความที่ส่งหลังเข้ากลุ่ม** (ไม่ย้อนอ่านของเก่า)
6. **แจ้งสมาชิกกลุ่ม** ว่ามีบอทเก็บ "เฉพาะลิงก์" เพื่อทำสรุปข่าว (PDPA: โปร่งใสกับผู้ถูกเก็บข้อมูล) และกำหนดคนติดต่อหากอยากให้ลบ

## ขั้น 3 — ช่องทาง HTTPS สาธารณะให้ webhook

รายละเอียดครบ: ดู `docs/05-line-webhook-setup.md`

LINE ต้องเรียก `https://<โดเมน>/line/webhook` ได้จากอินเทอร์เน็ต เลือกอย่างใดอย่างหนึ่ง:

| ทางเลือก | เหมาะกับ | หมายเหตุ |
| --- | --- | --- |
| **Cloudflare Tunnel** | เฟสแรก/เครื่องหลังไฟร์วอลล์ | ต้องมีโดเมนบน Cloudflare; ติดตั้ง `cloudflared`, สร้าง tunnel ชี้ `http://localhost:8080`, ติดตั้งเป็น Windows service |
| **Azure Dev Tunnels** | ทดสอบ | ออกแบบเพื่อ dev ไม่ใช่ production |
| **Azure App Service / VM + reverse proxy** | production (Topology B) | ใส่ TLS, เก็บ `.env` ใน Key Vault/Application settings |

ข้อกำหนดร่วม: **เปิดเฉพาะ path `/line/webhook` และ `/health` ให้สาธารณะ**; `/api/*` ต้องเข้าได้เฉพาะจากเครื่องที่รัน Claude (localhost หรือ IP allowlist/VPN) และมี bearer token เสมอ

หลังได้ URL แล้ว: LINE Developers → Messaging API → **Webhook URL** = `https://<โดเมน>/line/webhook` → กด **Verify** (ทำหลังขั้น 5 เมื่อ server รันแล้ว) → เปิด **Use webhook**

## ขั้น 4 — วางโค้ด server และสร้าง `.env`

1. วางโค้ด news-hub ที่ `C:\news-intel\server` (ตามสเปก docs/02; โค้ดยังเป็นงานถัดไปตาม README ข้อ 6)
2. สร้างไฟล์ `C:\news-intel\server\.env`:

```
PORT=8080
TZ=Asia/Bangkok
PUBLIC_BASE_URL=https://news.example.com
DB_PATH=C:\news-intel\data\newshub.sqlite
VAULT_PATH=C:\news-intel\vault
EXPORT_PATH=C:\news-intel\exports
BACKUP_PATH=C:\news-intel\backup
LINE_CHANNEL_SECRET=<จากขั้น 2>
LINE_CHANNEL_ACCESS_TOKEN=<ถ้ามี>
LINE_ALLOWED_GROUP_IDS=<ขั้น 7 จะได้ค่านี้>
LINE_GROUP_ALIASES=C123...=กลุ่มข่าว-ตร.
API_TOKEN_CLAUDE=<สุ่มยาว ≥ 40 ตัวอักษร>
API_TOKEN_READONLY=<สุ่มยาว ≥ 40 ตัวอักษร>
ALERT_WEBHOOK_URL=<Teams/Slack/อีเมลเกตเวย์ ถ้ามี>
RETENTION_LINKS_DAYS=180
ARCHIVE_CASES_DAYS=90
```

3. จำกัดสิทธิ์ไฟล์ `.env` เฉพาะผู้ใช้ที่รัน server: `icacls "C:\news-intel\server\.env" /inheritance:r /grant:r "SYSTEM:R" "Administrators:F"`
4. สร้างโทเค็นสุ่ม (cmd): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## ขั้น 5 — รัน `ops\setup-windows.bat`

เปิด Command Prompt แบบ **Run as administrator**:

```
cd /d <โฟลเดอร์ news-intel-kit>\ops
setup-windows.bat C:\news-intel
```

สคริปต์เดียวนี้ทำ: ตรวจ Node และ time zone → สร้างโฟลเดอร์ → ตั้ง `NEWSINTEL_HOME` (ระบบ) → `npm ci` + `npm run build` ถ้ามีโค้ด → ปิด sleep/hibernate ตอนเสียบปลั๊ก → ลงทะเบียน Task Scheduler:

| ชื่อ Task | เวลา | สคริปต์ |
| --- | --- | --- |
| NewsIntel-Server | ตอนบูต | `dist\index.js` |
| NewsIntel-ExportLinks | 05:00 | `dist\jobs\export-links.js` |
| NewsIntel-VaultBuild | 07:45 | `dist\jobs\vault-build.js` |
| NewsIntel-Healthcheck | 08:15 | `dist\jobs\healthcheck.js` |
| NewsIntel-Backup | 23:30 | `dist\jobs\backup.js` |

ตรวจ: `schtasks /Query /TN "NewsIntel-Server"` และ `curl http://localhost:8080/health`
หลังรันครั้งแรก **ปิดและเปิด Claude Desktop และ Obsidian ใหม่** เพื่อให้เห็น `NEWSINTEL_HOME`

## ขั้น 6 — ตั้งตัวแปรสำหรับ Claude (ผู้ใช้ปัจจุบัน)

```
setx NEWSHUB_URL "http://localhost:8080"
setx NEWSHUB_TOKEN "<ค่าเดียวกับ API_TOKEN_CLAUDE>"
```

(Topology B: `NEWSHUB_URL` = URL ของ server บน Azure) แล้วปิด/เปิด Claude Desktop ใหม่

## ขั้น 7 — ทดสอบ webhook และหา groupId

1. LINE Developers → Webhook → **Verify** ต้องขึ้น Success
2. เชิญบอทเข้ากลุ่ม → server บันทึก event `join` พร้อม `groupId` ใน `logs\server.log` → นำค่า `C…` ไปใส่ `LINE_ALLOWED_GROUP_IDS` และ `LINE_GROUP_ALIASES` แล้ว restart: `schtasks /End /TN "NewsIntel-Server" & schtasks /Run /TN "NewsIntel-Server"`
3. ส่งลิงก์ทดสอบ 3 แบบในกลุ่ม: ข่าว `.go.th`, ข่าวสื่อ, ลิงก์ Facebook
4. ตรวจ: `curl -H "Authorization: Bearer <API_TOKEN_CLAUDE>" "http://localhost:8080/api/line-links?date=<วันนี้>&status=new"` ต้องเห็น 3 แถว; ลิงก์ Facebook ต้อง `fetchable=false`
5. รัน export ทันที: `cd /d C:\news-intel\server && node dist\jobs\export-links.js` → ได้ไฟล์ใน `C:\news-intel\exports\`

## ขั้น 8 — ติดตั้ง plugin ใน Claude และทดสอบเฟส 0

### ติดตั้ง plugin `news-intel`
- **Claude Code (CLI/Desktop):**
  ```
  /plugin marketplace add <โฟลเดอร์ news-intel-kit>\plugin
  /plugin install news-intel@news-intel-local
  ```
  ทดสอบแบบไม่ติดตั้งถาวร: `claude --plugin-dir "<โฟลเดอร์ news-intel-kit>\plugin\news-intel"`
- **Claude Desktop / Cowork (หน้า Plugins):** ถ้า UI รองรับการอัปโหลด plugin ให้บีบอัดโฟลเดอร์ `plugin\news-intel` เป็น zip (เปลี่ยนนามสกุลเป็น `.plugin` ถ้าหน้าจอระบุ) แล้วอัปโหลด — ตรวจชื่อเมนูจริงในแอปของคุณ
- ตรวจว่าเห็น skills 5 ตัว, commands `/news-intel:crime-news` ฯลฯ, และ MCP server `news-hub` สถานะ connected (ถ้าไม่ connected: ตรวจ `NEWSINTEL_HOME`, `NEWSHUB_*`, ว่า server รันอยู่, และ `dist\mcp-stdio.js` มีจริง)

### เฟส 0 — ทดสอบตอน "ไม่มีคนเฝ้า" (ห้ามข้าม)
1. สร้าง scheduled task ทดสอบ รันครั้งเดียวอีก ~5 นาที ด้วย prompt:
   ```
   เรียก news-hub run_status_get(task="crime-news") และ line_links_get(date=วันนี้, status="new")
   สรุปผลเป็น 3 บรรทัด แล้วเรียก news_put_report ส่งไฟล์ข้อความ test.txt ที่มีเวลาปัจจุบัน
   ```
2. **ล็อกหน้าจอเครื่อง** (Win+L) แล้วรอให้งานรัน
3. ผ่านเมื่อ: `news-hub` เห็นไฟล์ `test.txt` และ log ของ server มีการเรียกจาก client ตามเวลา
4. ถ้าไม่ผ่าน: ดู docs/04 หัวข้อ "task ไม่รัน / เรียก MCP ไม่ได้" — อย่าไปขั้นถัดไปจนกว่าจะผ่าน

## ขั้น 9 — ติดตั้ง Obsidian vault

1. คัดลอกโฟลเดอร์ `vault-template\_system` ไปที่ `C:\news-intel\vault\_system`
2. สร้างโฟลเดอร์ใน vault: `00_Inbox 10_Daily 20_Cases 30_Entities 40_CrimeTypes 50_Trends 60_Notes 70_Canvas 90_Bases 99_Archive`
   (หรือปล่อยให้ `vault-build` สร้างให้ตอนรันครั้งแรก)
3. เปิด Obsidian → **Open folder as vault** → `C:\news-intel\vault`
4. Settings → Core plugins: เปิด **Properties, Bases, Backlinks, Graph view, Outline, Search**
5. Settings → Community plugins (ปิด Restricted mode): ติดตั้ง **Dataview** (ถ้าต้องการคิวรี) และ ถ้าต้องการกราฟ/ไทม์ไลน์ในมุมมอง Bases: **Base Graph** หรือ **Bases Plus** (ทางเลือก; ตรวจเวอร์ชัน Obsidian ขั้นต่ำของแต่ละตัว)
6. ตั้งค่ากราฟและ Bases ตาม docs/03
7. ซิงก์ไปเครื่องอื่น (ทางเลือก — เลือกอย่างเดียว): Obsidian Sync, Syncthing, หรือ OneDrive. **ห้ามใช้ซิงก์สาธารณะ/แชร์ลิงก์สาธารณะ** (vault มีข้อมูลคดี)

## ขั้น 10 — สร้าง Scheduled tasks ใน Claude

ทำทีละงาน คัดลอกข้อความในกล่อง **PROMPT** จากไฟล์ใน `prompts\`

| งาน | ไฟล์ | ตั้งเวลา (Asia/Bangkok) |
| --- | --- | --- |
| daily-gov-tech-law-news | `prompts\task-1-gov-tech-law.md` | ทุกวัน 06:00 |
| daily-crime-news | `prompts\task-2-crime-news.md` | ทุกวัน 06:40 |
| weekly-brain-review | `prompts\task-3-weekly-brain-review.md` | อาทิตย์ 20:00 |

- Claude Desktop (Cowork): ไปที่ **Scheduled** ในแถบซ้าย → สร้างงานใหม่ → วาง prompt → เลือกความถี่ → พิมพ์ `/` เพื่อแนบ plugin/skill → **Save**
- Claude Code Desktop: บันทึกไฟล์ prompt เป็น `~\.claude\scheduled-tasks\<ชื่องาน>\SKILL.md` (frontmatter `name`/`description` มีอยู่ในไฟล์แล้ว) แล้วตั้งความถี่ในแอป
- ตั้งสิทธิ์ให้ **อนุมัติอัตโนมัติ** ที่ MCP `news-hub`, WebSearch/WebFetch และการเขียนไฟล์ในโฟลเดอร์ทำงาน — ถ้ารอการอนุมัติ งานที่ไม่มีคนเฝ้าจะค้าง
- เว้นเวลา Task 1 ↔ Task 2 อย่างน้อย 40 นาที เพื่อไม่ชนกัน

## ขั้น 11 — รันมือ 1 รอบแล้วค่อยปล่อยตามเวลา

1. ในแชต: `/news-intel:crime-news` (รันมือ) → ตรวจผล: `run_status` = complete, มีรายงาน/infographic, `vault-build` สร้างโน้ตใน `20_Cases`
2. เปิด Obsidian → ดู `10_Daily`, `20_Cases`, กราฟ
3. ปล่อยให้ schedule รัน 3 วัน แล้วตรวจ checklist ด้านล่าง

## Go-live checklist

- [ ] `tzutil /g` = `SE Asia Standard Time`
- [ ] webhook Verify ผ่าน และลิงก์ทดสอบเข้า DB
- [ ] `/health` ตอบ ok; `schtasks /Query` เห็น 5 งาน NewsIntel-*
- [ ] เฟส 0 ผ่าน (task ไม่มีคนเฝ้าเรียก MCP ได้)
- [ ] `.env` จำกัดสิทธิ์; โทเค็นไม่อยู่ใน prompt/ไฟล์ที่แชร์
- [ ] vault ไม่ถูกซิงก์สาธารณะ; แจ้งสมาชิกกลุ่ม LINE แล้ว
- [ ] รันมือผ่าน 1 รอบ + ปล่อยตามเวลา 3 วันติด `complete`
- [ ] healthcheck ส่งแจ้งเตือนทดสอบถึงปลายทางที่ต้องการแล้ว (ทดสอบด้วยการหยุด server ชั่วคราว)
- [ ] ทดสอบกู้คืนจาก backup 1 ครั้ง (docs/04)
