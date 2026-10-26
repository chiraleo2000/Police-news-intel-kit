---
name: task-1-police-crime-news-pipeline
description: >
  รายวัน 08:01 (Asia/Bangkok) — กวาดครบ registry Batch A–D (เน้นเว็บประชาสัมพันธ์ ตร.)
  ซ้ำได้ตอน scrape แล้วค่อย event-merge · tags 3–5 หัวข้อสำคัญ · taxonomy ขยาย
  → แนวโน้ม 7 วัน · ข้อมูลกราฟ + BD×งบ 2570 → JSON/Obsidian/PDF
  ⛔ NO GIT
schedule: "CRON_TZ=Asia/Bangkok 1 8 * * *"
trigger:
  - "กวาดข่าวอาชญากรรม"
  - "ข่าวตำรวจ"
  - "run police crime pipeline"
  - "task 1 online crime news"
---

# Task 1 — กวาดข่าวออนไลน์ (police-crime-news-pipeline)

ไฟล์นี้คือ **police-crime-news-pipeline.md** ที่ต่อยอดสำหรับ scheduled task  
ช่องทางหลัก = เว็บ (Batch A–D) · **ไม่ได้อ่าน Excel จาก LINE** (ดู Task 2)

## บังคับ v2 — วิเคราะห์ต่อหัวข่าว + retrieval (ไม่จัด PDF ตาม บช.)

แต่ละโพสต์ยังเป็น **1 หัวข่าว** เหมือนเดิม ห้ามจัดบท HTML/PDF เป็นรายการตาม บช.

ลำดับเนื้อหาในโพสต์:
1. `content` = สรุปข่าวเดิม (ห้ามทิ้ง)
2. `exec_blurb` = 2–4 ประโยคสำหรับผู้บริหาร ภาษาไม่เทคนิค
3. `analysis_notes` = ข้อสังเกตจากข้อเท็จจริงในแหล่งเท่านั้น
4. `related_cases` = **หลัง** MCP `brain_search` / `brain_timeline` (หรือ `GET /v1/brain/search` และ `GET /v1/brain/timeline`) เท่านั้น หาไม่เจอให้ `[]` ห้ามเดา
5. การ์ด: `topic` `area` `status_th` `stats.loss_thb` `gang_or_group` `primary_bureau` `references`

ตั้ง `format_version: 2` ทุกไฟล์ `{DATE}_crime.json`  
PDF รายวันยังรวมจาก HTML ตามประเภทคดีเหมือนเดิม — ห้าม copy โครงสรุปตาม บช.  
ตัวอย่างจัดตาม บช. ใช้เป็น **มาตรฐานความลึกของการ์ด** ไม่ใช่โครงเอกสาร

ชั้น **ข้อมูลกราฟ** (vault + Pages) ทำในรอบนี้ ไม่มี scheduled task แยก  
เรียก news-hub (`brain_search` / `brain_timeline`) ไม่เขียนไฟล์ vault ตรง ๆ  
Pages แท็บ **ข้อมูลกราฟ** เป็น snapshot หลัง `node ops/rebuild-pages-feed.js` เท่านั้น  
หลัง rebuild ต้องมี `graph.json` + ภาพ ego ต่อคดีที่ `github-pages/data/graphs/{case_id}.svg`

## สิ่งที่ต่อยอดจากต้นฉบับ
1. registry 55 แหล่ง Batch A–D (กวาดออนไลน์)
2. จัดกลุ่มประเภทอาชญากรรม + TAGs + แนวโน้ม 7 วัน
3. Infographic + PDF
4. จริยธรรมคดี · อ่านวันที่ พ.ศ. · registry health check
5. วิเคราะห์ข้อมูลกราฟ + BD×งบ 2570 ในรอบเดียวกัน (รวมภาพกราฟต่อหัวข่าว)
6. Output 3 ช่อง: JSON เว็บ · MD Obsidian · PDF+Infographic

## Run params
`RUN_DATE` / `TARGET_DATE` = วันนี้ (Asia/Bangkok). Window = 00:00 ของเมื่อวาน (TARGET_DATE-1) ถึงเวลารัน (เมื่อวาน+วันนี้) — ดู v1.2 ท้ายไฟล์.
รันอัตโนมัติ — ห้ามถามคำถามกลับ
manifest อ่านไม่ได้ → หยุด `PREFLIGHT_FAILED` · วันนี้เสร็จแล้วและไม่มี `force` → `ALREADY_COMPLETE`

## Global rules (ใช้ทุกขั้น)

### Git / deploy
- ⛔ ห้ามรัน `git add` / `git commit` / `git push` และห้ามเขียน deploy/push script
  การ copy ไฟล์เสร็จแล้วไป `github-pages/data/` ทำได้ แต่การ publish repo เป็นงานแยก

### Fetch order (บังคับ — ครบทุกแหล่งใน registry)
1. **Batch A ก่อนทั้งหมด** — เว็บทางการตำรวจ + **หน้าประชาสัมพันธ์/ข่าว/แถลง/กิจกรรม** ของ ตร. และหน่วยในสังกัด  
   (ห้ามข้ามแค่เพราะมีข่าวจากสื่อแล้ว · **PR ตร. อยู่ในขอบเขตบังคับ** ไม่ใช่ทางเลือก)
2. **Batch B** — ยุติธรรม / บังคับใช้กฎหมาย / เตือนภัยทางการ
3. **Batch C/D** — สื่อ (ใช้ยืนยัน + เติมเหตุการณ์ที่หน่วยทางการยังไม่ขึ้นเว็บ)
4. **Facebook / โซเชียล = reference only — ห้าม fetch/เปิด**
   เก็บ URL ใน `social_media.agency_facebook` เท่านั้น; ถ้าสื่ออ้าง FB ให้ดึงจากบทความสื่อ → `source.type = "aggregator"`
5. **เว็บรับแจ้งความ/ฟอร์ม** (เช่น thaipoliceonline.go.th): อ่านได้เฉพาะหน้า "ข่าว/เตือนภัย" — ห้ามกรอกฟอร์ม

### Coverage targets (แก้ปัญหาดึงน้อยเกินไป)
- **ต้องพยายามครบทุกแถวใน registry (55+)** ทุกวัน — รายงาน `source_health` ต่อแหล่งใน Completion Report  
  สถานะที่ยอมรับ: `ok | empty | blocked | no_listing | search_only | error`
- **ขั้น scrape อนุญาตซ้ำได้เต็มที่** — เก็บบทความจากหลายแหล่งแม้หัวข้อคล้ายกัน  
  การรวมเหตุการณ์ทำทีหลังใน event-merge เท่านั้น **ห้ามตัดทิ้งตั้งแต่ตอน fetch เพราะกลัวซ้ำ**
- เป้าหมายขั้นต่ำต่อรอบ (ถ้าต่ำกว่านี้ต้องขยาย search/fetch ก่อนปิดงาน ยกเว้นวันเงียบจริงและมีหลักฐาน `empty` ครบ Batch A):
  - `articles_scraped_pass` ≥ **35**
  - `official_pr_articles` (Batch A ที่ `source.type=official`) ≥ **8**
  - หลัง merge: `posts_published` ≥ **12** (หรือเท่าจำนวนเหตุการณ์จริงถ้าวันนั้นน้อยและ Batch A ครบ)
- Caps ต่อ batch (เพดานสูง — ใช้จนครบแหล่งก่อนจะหยุด):  
  A ≤12 `web_search` / ≤60 `web_fetch` · B ≤8 / ≤36 · C ≤10 / ≤48 · D ≤8 / ≤36  
  รวมทั้งรอบแนะนำไม่ต่ำกว่า 100 fetch ถ้ายังไม่ถึงเป้าและยังมี listing ที่ยังไม่กวาด
- ห้าม fetch URL ซ้ำ**เดียวกัน**; หน่วยงานที่ไม่มีข่าวใหม่ → `no_news_today` (ต้องมีหลักฐานว่าเปิดหน้า listing แล้ว)
- "pass" = HTTP 200 + มี title + body ≥300 ตัวอักษร

### Registry health check (ใหม่)
- แต่ละแหล่งใน registry มีสถานะ URL: **V** = ตรวจพบโดเมนจริงจากการค้นหา, **U** = มาจากรายการที่ผู้ใช้ให้ (ยังไม่ทดสอบ fetch),
  **?** = ยังไม่ยืนยัน ต้องตรวจก่อนใช้งานจริง
- ถ้า URL ตอบ 404/redirect ไปหน้าอื่น/ไม่มี listing: **ห้ามเดา URL ใหม่** ให้บันทึกใน `registry_issues[]` ของ Completion Report
  (`{key, url, problem, suggested_action}`) แล้วใช้ `web_search` (นับในโควตา) หา permalink ข่าวของหน่วยงานนั้นแทน
- รอบแรกที่รัน ให้ประเมิน `source_health` ต่อแหล่ง: `ok | empty | blocked | no_listing | search_only`

### อ่านวันที่ (ใหม่ — แหล่งไทยใช้ พ.ศ. หลายรูปแบบ)
- แปลงทุกรูปแบบเป็น ISO ค.ศ. เวลา Asia/Bangkok ก่อนเทียบ window
  ตัวอย่าง: `9 เม.ย. 2568` → 2025-04-09; `06 ส.ค. 69` (พ.ศ. 2 หลัก) → 2026-08-06; `19 พ.ค. 2026` ใช้ตามนั้น
- ปี พ.ศ. = ปี ค.ศ. + 543; พ.ศ. 2 หลักให้ตีความเป็น 25xx
- ข้อความ "13 ชั่วโมงที่แล้ว" / "เมื่อวาน" ให้คำนวณจาก RUN_DATE; ถ้าคลุมเครือใช้กฎ top-3 ของหน้า "ล่าสุด"

### Window & dedupe / Event-level merge (บังคับ — ห้ามแยก blog ซ้ำ)
- เก็บเฉพาะข่าวที่เผยแพร่ตั้งแต่ 00:00 ของเมื่อวานถึงปัจจุบัน; ถ้าไม่เห็นวันที่ ให้เก็บเฉพาะรายการ top-3 ของหน้า "ล่าสุด" มิฉะนั้นข้าม
- **ประเมินก่อนสร้างโพสต์ใหม่ทุกครั้ง:** หัวข้อข่าวเดียวกัน / เนื้อหาเหตุการณ์เดียวกันหรือไม่
  ถือว่าเป็น**เหตุการณ์เดียวกัน**เมื่ออย่างน้อยหนึ่งข้อต่อไปนี้เป็นจริง:
  1. ≥3 ใน 4 ตรงกัน: สถานที่/จังหวัด, วันเกิดเหตุหรือวันจับกุม, ประเภทคดี, ผู้ต้องหา/ตัวเลขสำคัญ
  2. หัวข้อคล้าย ≥85% **และ** จังหวัด + ประเภทคดีตรงกัน
  3. URL ต่างกันแต่ permalink ชี้เหตุการณ์เดียวกัน (หน่วยงานเดียวกัน / ตัวเลขจับกุมเดียวกัน)
- → รวมเป็น **1 post / 1 case note เท่านั้น** — ห้ามสร้าง blog/article แยกต่อแหล่ง
  - `source_url` = แหล่งหลัก (official มาก่อน แล้วจึงสื่อ)
  - **ทุกแหล่งอื่น** รวมเป็น `corroborating_sources: [{name, url}]` (ลิสต์ครบ ไม่ทิ้ง)
  - รวม tags / secondary_topics / actions ที่ไม่ซ้ำ; ใช้เนื้อหาที่ละเอียดที่สุดเป็น `content`
- Same-day rerun: dedupe ด้วย `source.url`, title similarity, และ event-key ข้างต้น
  **Add-only ต่อเหตุการณ์** — ถ้าเจอเหตุการณ์เดิม ให้**merge แหล่งเข้า post เดิม** ห้ามสร้าง id ใหม่
  ก่อนรายงาน "completed" ให้สแกนโฟลเดอร์วันที่เป้าหมายและลบรายการซ้ำที่เพิ่งสร้าง (เก็บอันเก่า + รวมแหล่ง)

### Content rules
- `summary_1`: 80–150 คำไทย ย่อหน้าเดียว ไม่มี bullet/header เขียนด้วยสำนวนตัวเอง **ห้ามคัดลอกประโยคจากต้นฉบับ**
  (quote ได้ไม่เกิน 1 ครั้ง/แหล่ง และสั้นกว่า 15 คำ)
- `source.url` ต้องเป็น permalink ของข่าว ห้ามเป็นหน้าแรก/หน้า listing
- ใช้เฉพาะข้อเท็จจริงที่ปรากฏในแหล่งข่าว ห้ามแต่งเติม/คาดเดา
  (`content` ≥350 คำให้ได้จากบริบทที่แหล่งระบุ เช่น ลำดับเหตุการณ์ ข้อกล่าวหา มาตรการของตำรวจ ข้อมูลเตือนภัย ไม่ใช่การเติมคำ)
- แหล่งที่ไม่ใช่ทางการและเป็นฟอรัม (ASEAN NOW) = **lead เท่านั้น** ต้องมีแหล่งอื่นยืนยันก่อนจึงสร้าง article
- **ข่าวชี้แจง/ปฏิเสธข่าวปลอม** (เช่น กรมราชทัณฑ์ ตร. ชี้แจงข่าวลือ): สร้าง article ได้ ให้ตั้ง `meta.is_clarification = true`
  และสรุปทั้ง "ข้อกล่าวอ้าง" กับ "คำชี้แจงทางการ" โดยไม่ขยายข้อกล่าวอ้างที่ถูกปฏิเสธเป็นข้อเท็จจริง

### จริยธรรมการรายงานข่าวคดี (บังคับ)
- ใช้ถ้อยคำ **"ผู้ต้องหา / ผู้ถูกกล่าวหา / ตามที่ตำรวจแถลง / ตามข้อกล่าวหา"** ห้ามตัดสินว่าเป็นผู้กระทำผิดก่อนคำพิพากษา
- **ห้ามระบุตัวตนผู้เสียหาย** ในคดีทางเพศ ค้ามนุษย์ ความรุนแรงในครอบครัว และ **ทุกกรณีที่เกี่ยวกับเด็ก/เยาวชน**
  (ชื่อ ภาพ โรงเรียน ที่อยู่ ฯลฯ) ให้ใช้ "ผู้เสียหายรายหนึ่ง / เด็กหญิงอายุ X ปี"
- คดีค้ามนุษย์/แก๊งสแกมเมอร์ที่มีผู้ถูกบังคับกระทำผิด: แยก **ผู้กระทำผิด** ออกจาก **ผู้เสียหายจากการค้ามนุษย์**
  (ตามกลไกส่งต่อระดับชาติ NRM) อย่าเรียกผู้ถูกหลอกไปทำงานว่า "ผู้ต้องหา" เมื่อแหล่งข่าวระบุว่าเป็นผู้เสียหาย
- ชื่อผู้ต้องหา ระบุได้เฉพาะที่แหล่งทางการ/ตำรวจแถลงเปิดเผยแล้ว; ห้ามใส่เลขบัตรประชาชน เบอร์โทร บัญชีธนาคาร ที่อยู่บ้านเลขที่
- ห้ามลงรายละเอียดวิธีก่อเหตุเชิงปฏิบัติที่ลอกเลียนได้ (ขั้นตอนทำอาวุธ/ยา/มัลแวร์) สรุปแค่ระดับ "รูปแบบ (modus operandi)" พร้อมวิธีสังเกต/ป้องกัน
- ไม่ใส่ภาพ/คำบรรยายโจ่งแจ้งรุนแรง; ข่าวฆ่าตัวตายให้รายงานอย่างระมัดระวัง ไม่ระบุวิธี
- ข่าวพฤติกรรมตำรวจ (ร้องเรียน/วินัย/ทุจริต): แยก **ข้อกล่าวหา** ออกจาก **ผลการสอบสวน** และระบุสถานะให้ชัด
- ข่าวมิจฉาชีพแอบอ้างเป็นตำรวจ/AOC/หน่วยราชการ: ตั้ง `tags_struct.impersonation = true` และใน `actions_public`
  ให้ย้ำ **ช่องทางทางการเท่านั้น** (เว็บแจ้งความออนไลน์ thaipoliceonline.go.th และสายด่วน 1441) — ตรวจจากแหล่งข่าวที่ใช้ว่ายังเป็นช่องทางปัจจุบัน


### วิเคราะห์ในรอบนี้ (บังคับ — ไม่มี task weekly แยก)
หลัง merge ก่อนสร้างไฟล์เผยแพร่:
1. **ข้อมูลกราฟรายวัน** → เขียน `_brain_daily.md`
   - entities: หน่วยงาน / MO / จังหวัด / กฎหมายที่แหล่งระบุ
   - timeline สั้นต่อหน่วยงานที่ปรากฏวันนี้
   - ชื่อซ้ำ → `merge_proposal` สถานะ `proposed` เท่านั้น ห้ามรวมเอง
2. **ข้อเสนอธุรกิจ × งบปี 2570** → เขียน `_bd_leads.json`
   - อ่านเฉพาะ `reference/budget-fy2570-police-related.json` (หรือ `.md`)
   - จับคู่หน่วยงาน/เทคโนโลยีในข่าวกับโครงการ ตร.และหน่วยงานเกี่ยวข้อง
   - ห้ามเดาชื่อโครงการหรือตัวเลขงบ
3. ใส่บทวิเคราะห์ทั้งสองใน PDF และในไฟล์ Markdown ของ Obsidian
4. ห้ามแตะโน้ตที่ `generated: false`
5. **กราฟต่อหัวข่าว (บังคับ — ทุกโพสต์ในชุดวิเคราะห์ของรอบ)**  
   ครอบคลุมทั้งข่าวใหม่ที่ ingest ในรอบนี้ **และ** โพสต์เดิมที่ถูกอัปเดต/re-analysis ในวันนั้น:
   - หลังเขียน vault + รัน `node ops/rebuild-pages-feed.js` ตรวจว่ามี  
     `github-pages/data/graphs/{case_id}.svg` (+ `.json` สรุป relations) ต่อทุก `case_id` ในชุด
   - ในบทความ HTML/MD/PDF ของแต่ละหัวข่าว ใส่ส่วน **「ข้อมูลกราฟของข่าวนี้」**:
     - ฝังหรือลิงก์ภาพ ego subgraph (คดี + เอนทิตี/ประเภท/related_cases + ป้ายเส้น เช่น `related_to` `arrested_by`)
     - รายการความสัมพันธ์แบบมีป้าย (label) ชัดเจน
   - หน้า GitHub Pages รายโพสต์ (`#/{DATE}/{postId}`) แสดงบล็อกเดียวกันจาก `graph.json` / `data/graphs/` อัตโนมัติ — อย่าข้ามขั้น rebuild

### ช่องทางผลลัพธ์ (บังคับครบ 3)
1. **JSON รายวันสำหรับเว็บ (GitHub Pages)** — copy ไป `github-pages/data/` (file copy เท่านั้น ห้าม git push)  
   ไฟล์หลัก `{DATE}_crime.json` ต้องตรง schema (`date`, `generated_at`, `stats`, `posts[]`)  
   แต่ละ `posts[]` ต้องมี `source_url` + `corroborating_sources[]` + `tags[]` + `topic`  
   พร้อม `{DATE}_hotspots.json`, `{DATE}_alerts.json`, `{DATE}_trends.json`, `{DATE}_bd_leads.json`  
   อัปเดต `manifest.json` (add-only) + `downloads[]`  
   **บังคับรัน** `node ops/rebuild-pages-feed.js` หลัง copy เพื่อสร้าง/อัปเดต `feed.json` (หน้าเว็บอ่านไฟล์นี้เป็นหลัก — ไม่มี feed จะดูเหมือนไม่มีข่าว)
2. **Obsidian ข้อมูลกราฟ — 1 คดี = 1 โน้ต (รวมแหล่ง ไม่แยกตามสื่อ)**
   - `vault/20_Cases/{case_id}.md` = 1 เหตุการณ์ / 1 โน้ต (`generated: true`) · frontmatter `sources:` เป็นลิสต์ URL ทั้งหมด
   - `vault/40_CrimeTypes/{ชื่อประเภท}.md` = อัปเดตหน้ารวมประเภทที่มีข่าววันนี้
   - `vault/30_Entities/...` = หน่วย / จังหวัด / MO / กฎหมายที่ปรากฏ
   - ใช้ `[[wikilinks]]` เชื่อม คดี↔ประเภท↔หน่วย/จังหวัด เสมอ (แท็บ **ข้อมูลกราฟ** บน Pages อ่านจากลิงก์เหล่านี้)
   - หลังเขียน vault: รัน `node ops/rebuild-pages-feed.js`  
     (สร้าง `feed.json` + `graph.json` + `data/graphs/{case_id}.svg`) — **ห้าม** git push ใน Task 1
   - ในโน้ตคดีและบท HTML ใส่ลิงก์/ฝัง `graphs/{case_id}.svg` และสรุป relations ของคดีนั้น
   - **ห้าม** พึ่ง `vault/10_Daily/{DATE}.md` เป็นผลลัพธ์หลัก · **ห้าม** สร้างโน้ตซ้ำสำหรับแหล่งที่ 2/3 ของเหตุการณ์เดียวกัน
3. **PDF สำหรับดาวน์โหลด + Infographic** — HTML→PDF และ infographic HTML→PNG (THSarabun บังคับ)  
   คัดลอกไป `github-pages/data/downloads/{DATE}_crime.pdf` และ `{DATE}_infographic.png` ด้วย

ท้ายรอบต้องพิมพ์ **ลิงก์ GitHub Pages**:
- รายการข่าว: `{GITHUB_PAGES_BASE_URL}/#/{DATE}`
- ดาวน์โหลด PDF: `{GITHUB_PAGES_BASE_URL}/#/downloads/{DATE}`
- ตัวอย่างโพสต์: `{BASE}/#/{DATE}/{postId}`  
(ไม่มี base ใน env ให้บอกว่าเปิดด้วย `npx serve github-pages`)

### PDF / Font
- PDF บังคับ ห้ามรายงานว่าข้าม ลองตามลำดับ: weasyprint → playwright → wkhtmltopdf → headless chrome/edge `--print-to-pdf`
- ต้อง embed THSarabun (Regular/Bold/Italic/Bold-Italic) ไม่ให้ภาษาไทยเป็นกล่อง

---

## การจัดกลุ่มตามประเภทอาชญากรรม (Crime Taxonomy)

ทุก article มี **1 primary** `crime_type_code` และ 0–2 `secondary_crime_types`
(`topic` / `category_label` ใช้ **ชื่อไทยเต็มเท่านั้น**; โค้ดใช้ภายในเท่านั้น)

| code | ชื่อกลุ่ม (category_label) | ครอบคลุม |
| --- | --- | --- |
| CYBER | อาชญากรรมไซเบอร์และออนไลน์ | แก๊งคอลเซ็นเตอร์ หลอกลวงออนไลน์ ฟิชชิง แฮก บัญชีม้า ซิมม้า มิจฉาชีพโซเชียล แอบอ้างหน่วยงาน ภัยคุกคามไซเบอร์ Deepfake |
| ECON | คดีเศรษฐกิจ การเงิน และฟอกเงิน | แชร์ลูกโซ่ หลอกลงทุน (รวมสินทรัพย์ดิจิทัล) ปลอมแปลงเอกสาร ฉ้อโกง ยึด/อายัดทรัพย์ ปปง. ปล่อยกู้นอกระบบ |
| DRUG | ยาเสพติด | ผลิต ลำเลียง จำหน่าย เสพ ยึดทรัพย์ขบวนการ สารออกฤทธิ์ต่อจิตประสาทที่ถูกควบคุม |
| HUMAN | ค้ามนุษย์ แรงงานผิดกฎหมาย และคุ้มครองเด็ก | ค้ามนุษย์ แรงงานบังคับ บังคับกระทำผิดในแก๊งสแกม ล่วงละเมิดเด็ก ข่มขู่ทางเพศ (sextortion) ลักลอบเข้าเมือง |
| VIOLENT | คดีชีวิต ร่างกาย และเพศ | ฆาตกรรม ทำร้ายร่างกาย ข่มขืน/อนาจาร ความรุนแรงในครอบครัว วิสามัญฆาตกรรมที่เกี่ยวกับคดี |
| PROPERTY | คดีทรัพย์สิน | ลักทรัพย์ ชิงทรัพย์ ปล้น โจรกรรมรถ งัดที่พัก/ร้าน |
| ORGANIZED | คดีอุกฉกรรจ์ ผู้มีอิทธิพล และอาวุธ | กลุ่มอิทธิพล มือปืน อาวุธปืน/ระเบิดผิดกฎหมาย หมายจับสำคัญ ผู้หลบหนี นักโทษแหกคุก/หนีจากเรือนจำ |
| GAMBLE | พนันและบ่อนผิดกฎหมาย | บ่อนคาสิโน หวยเถื่อน พนันออนไลน์ (ถ้าแก่นคือพนัน ไม่ใช่แค่เครื่องมือไซเบอร์) |
| CONSUMER | คุ้มครองผู้บริโภคและสินค้าผิดกฎหมาย | สินค้าปลอม ยา/อาหารเสริมอันตราย โฆษณาเกินจริง สารเคมี/สินค้าเถื่อนที่ขายทั่วไป |
| TOURIST | อาชญากรรมที่เกี่ยวข้องกับนักท่องเที่ยวและชาวต่างชาติ | นักท่องเที่ยวตกเป็นเหยื่อ/ผู้ต้องหา แก๊งต่างชาติ ทัวร์ผิดกฎหมาย ไกด์เถื่อน นอมินี overstay |
| ROAD | ความปลอดภัยทางหลวงและการสกัดจับ | ด่านตรวจ สกัดลำเลียงของผิดกฎหมาย รถบรรทุก อุบัติเหตุร้ายแรงที่มีคดี ขับรถอันตรายที่มีข้อหาอาญา |
| ENV | สิ่งแวดล้อม ทรัพยากร และสัตว์ป่า | ค้าสัตว์ป่า ตัดไม้ของกลาง มลพิษ/สารเคมีผิดกฎหมาย การลักลอบทรัพยากร |
| PUBLIC | ความสงบเรียบร้อยและความมั่นคงภายใน | ชุมนุม/ก่อความวุ่นวายที่มีคดี ขู่เข็ญสาธารณะ วัตถุระเบิดในที่สาธารณะ (ไม่ใช่คดีบุคคลทั่วไป) |
| CORRUPT | ทุจริตและประพฤติมิชอบของเจ้าหน้าที่รัฐ | ทุจริต เรียกรับผลประโยชน์ สืบสวนข้าราชการ ป.ป.ช./ป.ป.ท. |
| POLICE | การปฏิบัติหน้าที่ ประชาสัมพันธ์ และนโยบายตำรวจ | **แถลง/ประชาสัมพันธ์เว็บ ตร.** นโยบาย โยกย้าย-แต่งตั้ง วินัย ร้องเรียน ผลงานเชิงรุก ชี้แจงข่าว กิจกรรมหน่วย |
| TRANSNAT | อาชญากรรมข้ามชาติและความร่วมมือระหว่างประเทศ | INTERPOL/UNODC/OCCRP ผู้ร้ายข้ามแดน ขบวนการข้ามชาติ ความร่วมมือ ตม./ตร.สากล |
| OTHER | อื่น ๆ | ไม่เข้ากลุ่มใด (ใช้น้อยที่สุด — ถ้าใช้ได้ให้ระบุเหตุใน Completion Report) |

กฎเลือก primary:
1. เลือกตาม **ความผิดหลักที่เป็นแก่นข่าว**
2. ถ้าแก่นคือ **ตำรวจ/หน่วยงานทำอะไร** (แถลง ประชาสัมพันธ์ นโยบาย วินัย ผลงานหน่วย) → `POLICE` + secondary เป็นประเภทคดีที่เกี่ยวข้อง
3. ข่าวจากเว็บประชาสัมพันธ์ ตร. ที่เป็นแถลงจับกุม → primary = ประเภทคดี, secondary ใส่ `POLICE` ได้
4. ข่าวชี้แจงข่าวปลอม → กลุ่มของเรื่องที่ถูกกล่าวถึง + `is_clarification = true`

## ระบบ TAGs (เน้นหัวข้อสำคัญ — ห้ามเยอะเกิน)

เป้าหมาย UI: ผู้ใช้กรองได้เร็วด้วย **หัวข้อสำคัญไม่กี่คำ** ไม่ใช่ลิสต์ยาวซ้ำกับจังหวัด/หน่วยงาน

### `meta.tags` (โชว์บนเว็บ) — เข้มงวด
- **3–5 tag เท่านั้นต่อข่าว** (ห้ามเกิน 5; แนะนำ 3–4)
- ใส่เฉพาะ **หัวข้อสำคัญของเหตุการณ์** ที่ช่วยแยกข่าว เช่น รูปแบบการกระทำ / ประเด็นหลัก / ชื่อปฏิบัติการสั้น ๆ
- **ห้าม** ใส่ลง `tags[]`: ชื่อจังหวัด, ชื่อหน่วยเต็ม, วันที่, คำทั่วไป ("จับกุม","ข่าว","ตำรวจ"), ความรุนแรง, verification
- จังหวัด / หน่วย / MO เก็บใน `tags_struct` เท่านั้น (UI กรองประเภทจาก `topic` อยู่แล้ว)

ตัวอย่างดี: `["ปล่อยกู้นอกระบบ","แอปกู้เงิน","บัญชีม้า"]`  
ตัวอย่างแย่: `["พิษณุโลก","บช.สอท.","จับกุม","ดอกเบี้ยเกินอัตรา","แอปกู้เงิน","ทวงหนี้","QR code","สายลับ",…]`

### `meta.tags_struct` (โครงสร้างวิเคราะห์ — ไม่ต้องยาวใน UI)

```json
"tags_struct": {
  "crime_type_code": "CYBER",
  "secondary_crime_types": ["ECON"],
  "case_stage": "จับกุม",
  "police_role": "สืบสวนจับกุม",
  "modus_operandi": ["คอลเซ็นเตอร์", "บัญชีม้า"],
  "province": ["กรุงเทพมหานคร"],
  "region": ["กรุงเทพฯ และปริมณฑล"],
  "units": ["บช.สอท."],
  "scale": "ข้ามจังหวัด",
  "alert": true,
  "impersonation": false,
  "is_police_pr": false
}
```

ค่าที่อนุญาต:
- `case_stage`: เกิดเหตุ | ออกหมายจับ | จับกุม | แถลงข่าว | ส่งฟ้อง | ศาล/คำพิพากษา | ยึด/อายัดทรัพย์ | ติดตามตัว | ประชาสัมพันธ์
- `police_role`: ป้องกัน/เตือนภัย | สืบสวนจับกุม | สอบสวน | ปราบปรามเชิงรุก | นโยบาย/บริหาร | วินัย/ร้องเรียน | ความร่วมมือสากล | ชี้แจงข่าว | ประชาสัมพันธ์
- `scale`: ท้องถิ่น | ข้ามจังหวัด | ระดับชาติ | ข้ามชาติ
- `region`: กรุงเทพฯ และปริมณฑล | ภาคกลาง | ภาคเหนือ | ภาคตะวันออกเฉียงเหนือ | ภาคตะวันออก | ภาคตะวันตก | ภาคใต้ | ต่างประเทศ
- `alert`: true เมื่อมีการเตือนภัยประชาชนโดยตรง
- `province` / `units`: เก็บครบใน struct — **ไม่ copy ทั้งก้อนเข้า tags[]**
- `is_police_pr`: true เมื่อต้นทางเป็นหน้าประชาสัมพันธ์/ข่าวของเว็บ ตร. หรือหน่วยในสังกัด
- `modus_operandi`: ≤2 ค่าจาก canonical; ส่วนเกินเก็บใน `_tags.json` → `new_mo_candidates`

**Canonical MO:** คอลเซ็นเตอร์ · แอบอ้างเจ้าหน้าที่รัฐ/ตำรวจ · ส่งพัสดุปลอม · หลอกลงทุนคริปโต/สินทรัพย์ดิจิทัล ·
หลอกลงทุนหุ้น/ฟอเร็กซ์ · หลอกรักออนไลน์ · หลอกซื้อขายออนไลน์ · หลอกหางาน · ปล่อยกู้นอกระบบ ·
บัญชีม้า/ซิมม้า · ลิงก์ปลอม/ฟิชชิง · มัลแวร์/แอปดูดเงิน · ข่มขู่ทางเพศ · พนันออนไลน์ · ศูนย์/แก๊งสแกมชายแดน ·
แชร์ลูกโซ่ · ฟอกเงิน · ลำเลียงยาเสพติด · สินค้า/ยาปลอม · ค้ามนุษย์บังคับกระทำผิด · แรงงานต่างด้าวผิดกฎหมาย ·
ไกด์/ทัวร์เถื่อน · นอมินีธุรกิจต่างชาติ · ค้าสัตว์ป่า · บ่อน/คาสิโนผิดกฎหมาย

---

## Pipeline — one run, 10 ขั้นตอน (ออนไลน์)

**Scrape (4 batch — ต้องครบทุกแหล่ง · ซ้ำได้ก่อน merge)**
1. **Batch A** — หน่วยตำรวจ + **หน้าประชาสัมพันธ์/ข่าวเว็บทางการ** (บังคับก่อน)  
   → `News/Articles/{Parent}/{Agency}/{DATE}/{Slug}/`  
   ต่อแหล่ง: เปิดหน้า listing ข่าว/PR แล้วเก็บ **top 5 permalink ใน 24 ชม.** (หรือทั้งหมดในหน้าล่าสุดถ้า ≤5)
2. **Batch B** — ยุติธรรม / บังคับใช้กฎหมาย / เตือนภัย — ครบทุกแถว เช่นกัน
3. **Batch C** — สื่อไทยหมวดอาชญากรรม — ครบทุกสำนัก; อนุญาตหลายบทความต่อสำนัก
4. **Batch D** — สื่อ EN / สากล — เฉพาะที่เกี่ยวกับไทย/ภูมิภาค

   ทุก article มี `article.json` + `article.md` + `crime_type_code` + tags (3–5 หัวข้อสำคัญ)  
   **อย่าลดจำนวนเพราะซ้ำ** — เก็บไว้ให้ขั้น merge รวมแหล่ง

**Analyze + Publish (รอบเดียวกัน)**
5. Glob `News/Articles/**/{TARGET_DATE}/**/article.json` เก็บ `fetch.status == "pass"`, case-level merge
6. **Trend 7 วัน:** อ่าน manifest / `_by_crime_type` ย้อนหลัง; `surge` เมื่อ `delta_pct ≥ +50%` และ `today_count ≥ 3`;
   ข้อมูล <3 วัน → `baseline: "insufficient"` ห้ามอ้างแนวโน้ม
7. **วิเคราะห์** ตามหัวข้อ "วิเคราะห์ในรอบนี้" → `_brain_daily.md` + `_bd_leads.json`
8. สร้างชุดไฟล์ครบ 3 ช่องทาง (ดู Document output tree)
9. อัปเดต `Document/manifest.json` (prepend, add-only); `meta.status = "published"`; copy JSON → `github-pages/data/`
10. Verify แล้ว Completion Report **จบ — ไม่ git push**

---

## article.json (ต่อบทความ)
```json
{
  "article_id": "",
  "agency": {"parent": "", "name": "", "registry_key": "", "official_url": ""},
  "source": {"url": "", "type": "official|aggregator", "origin": "direct|indirect", "fetch_priority_used": "1_official|2_media"},
  "corroborating_sources": [{"name": "", "url": ""}],
  "verification": "official_confirmed|media_only|single_source",
  "fetch": {"status": "pass|fail", "http_status": 200, "fetched_at": "", "fetch_mode": "truncated|rendered"},
  "meta": {
    "published_at": "", "target_date": "", "within_24h": true,
    "status": "scraped|published", "batch": "A|B|C|D", "priority": "A|B|C",
    "original_language": "th|en",
    "is_clarification": false,
    "category_label": "ชื่อกลุ่มประเภทอาชญากรรมภาษาไทยเต็ม",
    "tags": [],
    "tags_struct": {"crime_type_code": "", "secondary_crime_types": [], "case_stage": "", "police_role": "", "modus_operandi": [], "province": [], "region": [], "units": [], "scale": "", "alert": false, "impersonation": false}
  },
  "content": {"title": "", "slug": "", "summary_1": "", "language": "th"},
  "crime_insights": {
    "severity": "high|medium|low",
    "trend_signal": "ข้อสังเกตแนวโน้ม/รูปแบบที่ซ้ำ หรือ N/A",
    "stats": {"arrested": null, "suspects": null, "victims": null, "loss_thb": null, "seized_value_thb": null},
    "related_laws": [],
    "actions_public": ["", ""],
    "actions_org": ["", ""],
    "police_performance": {
      "operation": "ชื่อ/ลักษณะปฏิบัติการ หรือ N/A",
      "units_involved": [],
      "outcome": "จับกุม|ยึดทรัพย์|ปิดเว็บ/อายัดบัญชี|เตือนภัย|นโยบาย|อื่น ๆ|N/A",
      "note": "ประเด็นการปฏิบัติหน้าที่ของตำรวจในข่าวนี้ หรือ N/A"
    }
  },
  "social_media": {"agency_facebook": ""}
}
```
- `severity`: high = ชีวิต/ความรุนแรงร้ายแรง, ความเสียหาย ≥ 10 ล้านบาท, ขบวนการข้ามชาติ, หรือภัยที่กระทบประชาชนวงกว้าง; medium = ทรัพย์สินหรือกลุ่มเฉพาะ; low = นโยบาย/แต่งตั้ง/ข่าวติดตามผล
- `related_laws`: ใส่เฉพาะที่แหล่งข่าวระบุ ห้ามเติมจากความจำ (กฎหมายด้านอาชญากรรมเทคโนโลยีมีการออกใหม่/แก้ไขเป็นระยะ ให้ยึดตามข่าว)
- `actions_public` (2 ข้อ) = วิธีสังเกต/ป้องกันสำหรับประชาชน; `actions_org` (2 ข้อ) = สิ่งที่ธนาคาร/SME/หน่วยงานควรทำ
  ข่าวที่ไม่มีนัยเชิงป้องกัน (เช่น แต่งตั้งโยกย้าย) ให้ `["N/A","N/A"]` และ `severity: "low"`
- ตัวเลขใน `stats` ใส่เฉพาะที่แหล่งระบุ ไม่ประมาณเอง ถ้าไม่มีให้ `null`

## {DATE}_crime.json (publish artifact — GitHub Pages schema)
```json
{
  "date": "", "generated_at": "",
  "stats": {
    "total": 0, "direct": 0, "indirect": 0,
    "priority_A": 0, "priority_B": 0, "priority_C": 0,
    "alerts": 0, "official_confirmed": 0,
    "by_crime_type": {"อาชญากรรมไซเบอร์และออนไลน์": 0},
    "total_loss_thb": 0, "total_seized_value_thb": 0, "total_arrested": 0
  },
  "posts": [{
    "id": "", "slug": "", "title": "",
    "topic": "ชื่อกลุ่มประเภทอาชญากรรมภาษาไทยเต็ม",
    "secondary_topics": [],
    "agency": "Parent > Name", "origin": "direct|indirect", "priority": "A|B|C",
    "severity": "", "verification": "",
    "case_stage": "", "police_role": "", "province": [], "region": [], "alert": false, "impersonation": false, "is_clarification": false,
    "content": "≥350 คำ ภาษาไทย (ห้ามมี field summary แยก)",
    "source_url": "", "corroborating_sources": [{"name": "", "url": ""}],
    "actions_public": [], "actions_org": [], "police_performance": {},
    "stats": {}, "tags": [], "category_label": "", "published_at": ""
  }]
}
```
Field mapping `post ← article`: `id←article_id`, `slug/title←content.*`, `topic/category_label←meta.category_label`,
`secondary_topics←tags_struct.secondary_crime_types (แปลงเป็นชื่อไทย)`, `agency←agency.parent + " > " + agency.name`,
`origin←source.origin`, `priority←meta.priority`, `severity/actions_*/police_performance/stats←crime_insights.*`,
`content←content.summary_1 ขยายเป็น ≥350 คำ (เฉพาะข้อเท็จจริงจากแหล่ง)`, `source_url←source.url`,
`corroborating_sources←article.corroborating_sources` (หลัง event-merge ต้องมีครบทุกแหล่งรอง),
`tags←meta.tags`, `published_at←meta.published_at`

**UI บน GitHub Pages อ่านฟิลด์เหล่านี้:** กรอง `topic` / `tags` · แสดงลิสต์แหล่งจาก `source_url`+`corroborating_sources` · แท็บดาวน์โหลดอ่าน `manifest.downloads`

### ไฟล์ JSON ประกอบ
- `_by_crime_type.json`: `{ "<ชื่อกลุ่ม>": {"count": n, "post_ids": [], "top_tags": [], "total_loss_thb": 0} }`
- `_hotspots.json`: `[{"province": "", "region": "", "count": n, "top_crime_types": [], "post_ids": []}]` เรียงมาก→น้อย
- `_tags.json`: `{"tags": [{"tag": "", "count": n}], "modus_operandi": [{"mo": "", "count": n}], "new_mo_candidates": []}`
- `_alerts.json`: ข่าว `alert=true` พร้อม `actions_public` (และแยกกลุ่ม `impersonation=true`)
- `_trends.json`: `{"baseline": "ok|insufficient", "window_days": 7, "by_crime_type": [{"type": "", "today": 0, "avg_prev_7d": 0, "delta_pct": 0, "surge": false}], "by_mo": [...], "by_province": [...]}`
- `_index.json`: manifest ไฟล์ทั้งหมด + stats + `no_news_today` + `source_health` + `registry_issues`

---

## Infographic spec (`{DATE}_infographic.html` + `.png`)

หน้าเดียวแนวตั้ง กว้าง 1080px (ความสูงตามเนื้อหา), self-contained (CSS + inline SVG, ไม่พึ่ง JS ภายนอก),
ฟอนต์ THSarabun ผ่าน `@font-face` → `./fonts/`, สีแยกตามประเภทคดี (คงสีเดิมทุกส่วนของหน้า), พื้นหลังโทนเข้ม อ่านง่ายเมื่อแชร์ทางมือถือ

ลำดับส่วน:
1. **Header** — "สรุปข่าวอาชญากรรมและการปฏิบัติหน้าที่ตำรวจ" + วันที่ (พ.ศ.) + เวลาสร้าง
2. **KPI strip** — จำนวนข่าว | ผู้ต้องหาที่ถูกจับกุมรวม | มูลค่าความเสียหาย | มูลค่าทรัพย์ที่ยึด/อายัด | ข่าวเตือนภัย
   (เฉพาะที่แหล่งระบุ; ไม่มีข้อมูลให้แสดง "—" ไม่ใส่ 0 หลอก)
3. **สัดส่วนตามประเภทอาชญากรรม** — donut/แท่งแนวนอน (SVG) เรียงมาก→น้อย + ลูกศร ▲▼ เทียบค่าเฉลี่ย 7 วัน (ซ่อนถ้า `baseline = insufficient`)
4. **ประเภทที่พุ่งขึ้น (surge)** — การ์ดสั้น ๆ เฉพาะประเภท/MO ที่ `surge = true`
5. **Top 5 จังหวัด (hotspot)** — แท่งแนวนอน + ประเภทคดีเด่น และแถบสัดส่วนตามภาค
6. **Top Tags / Modus Operandi** — chip 10 อันดับ
7. **ข่าวเด่น 5 เรื่อง** — การ์ด: ประเภท, หน่วยงาน, สรุป 1 บรรทัด, ป้าย severity, ป้ายยืนยัน (ทางการ/สื่อเท่านั้น)
8. **บทบาทตำรวจวันนี้** — จำนวนข่าวตาม `police_role` และผลปฏิบัติการ (`police_performance.outcome`)
9. **เตือนภัยประชาชน** — 3–5 ข้อจาก `actions_public` ของข่าว `alert=true` (ไม่ซ้ำ) + กล่อง "ช่องทางแจ้งความ/ขอความช่วยเหลือที่เป็นทางการ" (เฉพาะช่องทางที่แหล่งข่าววันนั้นยืนยัน)
10. **Footer** — รายชื่อแหล่งข้อมูล + "ข้อมูลรวบรวมจากแหล่งข่าวสาธารณะ ผู้ต้องหายังถือเป็นผู้บริสุทธิ์จนกว่าศาลจะมีคำพิพากษา"

PNG: render ด้วย playwright / headless chrome (`--window-size=1080,<height>`, device scale factor 2)
ถ้า render ไม่ได้ให้ลองเครื่องมือถัดไปตามลำดับเดียวกับ PDF และห้ามรายงานว่าข้าม

## รายงานฉบับเต็ม (`{DATE}_crime.html` / `.pdf`)
- หน้าปก: วันที่ + executive summary 5–7 บรรทัด (ภาพรวม ประเภทที่พุ่งขึ้น รูปแบบมิจฉาชีพที่ขึ้นสูง ประเด็นตำรวจ)
- **จัดเป็นหมวดตามประเภทอาชญากรรม** (เรียงตามจำนวนข่าว) แต่ละหมวด: จำนวนข่าว, ข่าวเรียงตาม severity, tag ของหมวด,
  กล่อง "แนวโน้ม/ข้อสังเกต" (จาก `trend_signal` ที่ซ้ำ ≥2 ข่าว และ `_trends.json`)
- ภาคผนวก: ตาราง hotspot จังหวัด/ภาค, ตาราง tag/MO, หน่วยงานที่ `no_news_today`, ข่าว `media_only`/`single_source`,
  ข่าวชี้แจง (`is_clarification`), และ `registry_issues`

## Document output tree (Task 1 — ออนไลน์)
```
Document/{DATE}_Crime/
  {DATE}_crime.{json,md,html,pdf}
  {DATE}_infographic.{html,png}
  _index.json, _by_crime_type.json, _by_agency.json,
  _hotspots.json, _tags.json, _alerts.json, _trends.json,
  _bd_leads.json, _brain_daily.md
  fonts/THSarabun{,.Bold,.Italic,.BoldItalic}.ttf
Document/manifest.json
github-pages/data/{DATE}_crime.json
github-pages/data/{DATE}_hotspots.json
github-pages/data/{DATE}_alerts.json
github-pages/data/{DATE}_trends.json
github-pages/data/{DATE}_bd_leads.json
github-pages/data/downloads/{DATE}_crime.pdf
github-pages/data/downloads/{DATE}_infographic.png
github-pages/data/manifest.json   # days[].downloads[] ชี้ไฟล์ด้านบน
vault/20_Cases/{case_id}.md       # 1 เหตุการณ์ = 1 โน้ต · sources: [url...]
vault/40_CrimeTypes/{ชื่อประเภท}.md
vault/30_Entities/{Units|Agencies|Laws|MO|Places|Regions}/...
github-pages/data/graph.json
github-pages/data/graphs/{case_id}.svg   # ego subgraph ต่อหัวข่าว (สร้างโดย rebuild-pages-feed)
github-pages/data/graphs/{case_id}.json  # สรุป relations ของคดี
```

## Completion Report
```json
{
  "run_date": "", "target_date": "",
  "task": "1-online",
  "pipeline": "task-1-police-crime-news-pipeline-1.1",
  "base_skill": "police-crime-news-pipeline-combined-1.1",
  "batches": {
    "A": {"attempted": 14, "created": 0, "no_news_today": []},
    "B": {"attempted": 12, "created": 0, "no_news_today": []},
    "C": {"attempted": 16, "created": 0, "no_news_today": []},
    "D": {"attempted": 13, "created": 0, "no_news_today": [], "skipped_out_of_scope": 0}
  },
  "articles_scraped_pass": 0,
  "articles_total": 0,
  "posts_published_after_merge": 0,
  "official_pr_articles": 0,
  "sources_attempted": 0,
  "sources_with_news": 0,
  "sources_empty": 0,
  "bd_leads_count": 0,
  "brain_entities_touched": 0,
  "obsidian_cases": 0,
  "tag_policy": "3-5 key topic tags only",
  "outputs": {"json_web": false, "obsidian_md": false, "pdf": false, "infographic": false},
  "trend_baseline": "ok|insufficient",
  "registry_issues": [],
  "discovered_paths": [],
  "github_pages": {
    "base_url": "",
    "day_url": "",
    "files": ["{DATE}_crime.json", "{DATE}_hotspots.json", "{DATE}_alerts.json", "{DATE}_trends.json"]
  },
  "github_pages_copied": false,
  "git_push": "NOT PERFORMED — no git task run",
  "status": "complete|partial|failed"
}
```

### ข้อความท้ายรอบ (บังคับ ≤12 บรรทัด รวมลิงก์)
1. สถานะ + จำนวนบทความ + bd_leads  
2. พาธใต้ `github-pages/data/`  
3. ลิงก์เว็บ: `{BASE}/#/{DATE}` และ `{BASE}/#/{DATE}/{postId}` (`GITHUB_PAGES_BASE_URL` ถ้ามี; ไม่มีให้แนะ `npx serve github-pages`)  
4. จำนวนโน้ตใน `vault/20_Cases` และประเภทที่อัปเดตใน `40_CrimeTypes`

---

## Source registry (55) — `Agency | official_url | search keyword | facebook (reference only, never fetched)`

สถานะ URL: **V** = ตรวจพบโดเมนจริงจากการค้นหา (ยังไม่ได้ทดสอบ fetch ทุกหน้า) · **U** = จากรายการของผู้ใช้ · **?** = ยังไม่ยืนยัน ต้องตรวจก่อนใช้
`search_only` = ไม่มีเว็บทางการที่ทราบ ให้ใช้ `web_search` แล้ว fetch บทความจากเว็บ ตร./สื่อ

### Batch A — หน่วยตำรวจ + ประชาสัมพันธ์เว็บทางการ (ขยาย) · Priority A · origin = `direct`

**บังคับ:** ทุกแถวต้องถูกเปิด/ค้นในรอบนี้ · เน้นหน้า **ข่าว / ประชาสัมพันธ์ / แถลงข่าว / กิจกรรม** ของเว็บ `.go.th` จริง  
ตั้ง `tags_struct.is_police_pr = true` เมื่อต้นทางเป็นหน้า PR/ข่าวของหน่วยตำรวจ

| # | หน่วยงาน | official_url / หน้าข่าว-PR | สถานะ | search keyword | facebook (ref only) |
| --- | --- | --- | --- | --- | --- |
| 1 | สำนักงานตำรวจแห่งชาติ (ตร.) | https://www.royalthaipolice.go.th/ · หาเมนูข่าว/ประชาสัมพันธ์ | U | ตร. แถลงข่าว ประชาสัมพันธ์ Royal Thai Police | https://www.facebook.com/royalthaipolice |
| 2 | ตำรวจไซเบอร์ (บช.สอท./CCIB) | https://ccid1.ccib.go.th/ · หน้าข่าว/เตือนภัย | U | บช.สอท. แถลง จับกุม มิจฉาชีพ | https://www.facebook.com/CybercopTH |
| 3 | ตำรวจสอบสวนกลาง (CIB) | https://www.cib.go.th/news?category=general | U | CIB แถลง จับกุม | https://www.facebook.com/CIBTHAILAND |
| 4 | กองปราบปราม (บก.ป./CSD) | https://csd.go.th/ | U | กองปราบ แถลง หมายจับ | https://www.facebook.com/csdthai |
| 5 | สืบนครบาล (บก.สส.บช.น./IDMB) | search_only + เว็บ บช.น. ถ้าพบ | – | สืบนครบาล แถลงจับกุม | https://www.facebook.com/IDMB.Bangkok |
| 6 | ตำรวจทางหลวง (บก.ทล.) | search_only | – | ตำรวจทางหลวง สกัดจับ ประชาสัมพันธ์ | https://www.facebook.com/highway1193 |
| 7 | ตำรวจเศรษฐกิจ (บก.ปอศ.) | search_only | – | ปอศ. แถลง เศรษฐกิจ | https://www.facebook.com/ECDThai |
| 8 | ตำรวจคุ้มครองผู้บริโภค (บก.ปคบ.) | search_only | – | ปคบ. แถลง สินค้าปลอม | https://www.facebook.com/cppd1135 |
| 9 | ตำรวจค้ามนุษย์ (บก.ปคม.) / ศตคม.ตร. | search_only | – | ปคม. ศตคม. แถลง ค้ามนุษย์ | https://www.facebook.com/ATPDPOLICE |
| 10 | ตำรวจท่องเที่ยว (บช.ทท.) | https://www.touristpolice.go.th/ (โพสต์ `/post/…`) | V | Tourist Police แถลง | https://www.facebook.com/1155TPB |
| 11 | ศูนย์ PCT (ศปอส.ตร.) | search_only | – | ศูนย์ PCT แถลง อาชญากรรมเทคโนโลยี | https://www.facebook.com/PCTPOLICE |
| 12 | ตำรวจเทคโนโลยี (บก.ปอท.) | search_only | – | ปอท. แถลง หลักฐานดิจิทัล | https://www.facebook.com/jahooktcsd |
| 13 | สำนักงานตรวจคนเข้าเมือง (ตม.) | https://www.immigration.go.th/ · หน้าข่าว | ? | ตม. ประชาสัมพันธ์ จับกุม | (ไม่มี) |
| 14 | บช.น. / ตำรวจภูธรภาค 1–9 / ตชด. | search_only — **ค้นแยกอย่างน้อย บช.น. + ภ.1–ภ.9 + ตชด.** | – | บช.น. แถลง; ภ.X แถลงจับกุม; ตชด. | (ไม่มี) |
| 14b | เว็บข่าวรวม/PR ตร. ที่ค้นพบระหว่างรอบ | บันทึก URL จริงใน `discovered_paths` | – | site:go.th ตำรวจ แถลงข่าว | – |

หมายเหตุ Batch A (ประชาสัมพันธ์):
- **ลำดับงาน:** (1) เปิด official_url / หน้าข่าว-PR → เก็บ permalink ใน 24 ชม. (2) ถ้า listing ว่าง/พัง ค่อย `web_search`  
- search_only: ใช้โควตา search ของ Batch A เพื่อหา **permalink จากโดเมน `.go.th` ของตำรวจก่อน** แล้วค่อยสื่อ  
- ตำรวจท่องเที่ยว: ใช้หน้าโพสต์ `/post/...`; EN → สรุปเป็นไทย + `original_language=en`  
- พบเว็บทางการใหม่ → เติม registry / `discovered_paths` และตั้ง `is_police_pr`  
- **ห้ามเปิด Facebook**

### Batch B — ยุติธรรม บังคับใช้กฎหมายอื่น และหน่วยเตือนภัย (12) · Priority A · origin = `direct`

| # | หน่วยงาน | official_url | สถานะ | search keyword |
| --- | --- | --- | --- | --- |
| 15 | กรมสอบสวนคดีพิเศษ (DSI) | https://www.dsi.go.th/th/Type/Mission-News | U | Thailand DSI special case money laundering |
| 16 | สำนักงาน ป.ป.ส. (ONCB) | https://www.oncb.go.th/ | U | Thailand ONCB narcotics seizure |
| 17 | สำนักงาน ปปง. (AMLO) | https://www.amlo.go.th/ | U | Thailand AMLO asset seizure money laundering |
| 18 | สำนักงานอัยการสูงสุด (OAG) | https://www.ago.go.th/ | ? | อัยการสูงสุด แถลง สั่งฟ้อง ไม่ฟ้อง คดีสำคัญ |
| 19 | กรมราชทัณฑ์ | https://www.correct.go.th/ | V | กรมราชทัณฑ์ ผู้ต้องขัง หลบหนี ชี้แจง |
| 20 | ศูนย์ AOC 1441 (กระทรวงดีอี) / ศปอท. | https://www.mdes.go.th/ (หน้าข่าว) | U | AOC 1441 ดีอี อายัดบัญชี อาชญากรรมออนไลน์ |
| 21 | ศูนย์รับแจ้งความออนไลน์ (Thai Police Online) — **หน้าข่าว/เตือนภัยเท่านั้น** | https://www.thaipoliceonline.go.th/ | V | thaipoliceonline เตือนภัย แจ้งความออนไลน์ |
| 22 | ThaiCERT (ETDA) | https://www.thaicert.or.th/ | V | ThaiCERT ภัยคุกคามไซเบอร์ แจ้งเตือน |
| 23 | สำนักงาน ก.ล.ต. | https://www.sec.or.th/ | V | ก.ล.ต. เตือน หลอกลงทุน SEC Investor Alert |
| 24 | สำนักงาน ป.ป.ช. (NACC) | https://www.nacc.go.th | U | Thailand NACC corruption anti-graft |
| 25 | สำนักงาน ป.ป.ท. | https://www.pacc.go.th/ | ? | ป.ป.ท. ทุจริต ข้าราชการ ภาครัฐ |
| 26 | สำนักงานคณะกรรมการคุ้มครองผู้บริโภค (สคบ.) | https://www.ocpb.go.th/ | ? | สคบ. สินค้าไม่ปลอดภัย โฆษณาเกินจริง |

หมายเหตุ Batch B: ข้อมูลที่ติดตามจากตำรวจ+ดีอี+ก.ล.ต. ในหมวดไซเบอร์มักซ้ำกับ Batch A/C ให้ทำ case-level merge เสมอ

### Batch C — สื่อไทยหมวดอาชญากรรม/โรงพัก (16) · Priority B · origin = `indirect`

ดึงจากหน้าหมวดอาชญากรรมโดยตรง (หน้า listing ใช้หาลิงก์ แล้ว fetch permalink)

| # | สำนักข่าว | หมวด | URL | สถานะ |
| --- | --- | --- | --- | --- |
| 27 | ไทยรัฐ | ข่าวอาชญากรรม | https://www.thairath.co.th/news/crime | V |
| 28 | เดลินิวส์ | อาชญากรรม | https://www.dailynews.co.th/crime/ | U |
| 29 | ผู้จัดการออนไลน์ | อาชญากรรม / โรงพักผู้จัดการ | https://mgronline.com/crime | V |
| 30 | มติชนออนไลน์ | อาชญากรรม / ยุติธรรม | https://www.matichon.co.th/local/crime | U |
| 31 | ข่าวสด | อาชญากรรม | https://www.khaosod.co.th/crime | U |
| 32 | Thai PBS | อาชญากรรมและกระบวนการยุติธรรม | https://www.thaipbs.or.th/news/categories/crime | U |
| 33 | อมรินทร์ทีวี | ข่าวอาชญากรรม | https://www.amarintv.com/news/crime | U |
| 34 | เนชั่นทีวี | อาชญากรรม | https://www.nationtv.tv/crime | U |
| 35 | ช่อง 7HD | ข่าวอาชญากรรม | https://news.ch7.com/crime | U |
| 36 | PPTV HD 36 | อาชญากรรม | https://www.pptvhd36.com/news/อาชญากรรม | U |
| 37 | คมชัดลึก | อาชญากรรม | https://www.komchadluek.net/crime | U |
| 38 | สำนักข่าวอิศรา | สืบสวนสอบสวน / ทุจริตข้าราชการ | https://www.isranews.org/ | U |
| 39 | แนวหน้า | ข่าวท้องถิ่น/อาชญากรรม | https://www.naewna.com/ (หาเมนูหมวดอาชญากรรม) | V (โดเมน) / ? (path หมวด) |
| 40 | ไทยโพสต์ | ข่าวเด่น/อาชญากรรม | https://www.thaipost.net/ (หาเมนูหมวดอาชญากรรม) | V (โดเมน) / ? (path หมวด) |
| 41 | กรุงเทพธุรกิจ | อาชญากรรมการเงิน/คริปโต/ไซเบอร์ | https://www.bangkokbiznews.com/ (หาเมนูหมวดที่เกี่ยวข้อง) | V (โดเมน) / ? (path หมวด) |
| 42 | The Thaiger (ฉบับไทย) | ข่าวอาชญากรรม | https://thethaiger.com/th/news | V (โดเมน) / ? (path หมวด) |

หมายเหตุ: แถวที่ path หมวดยังไม่ยืนยัน ให้เริ่มจากหน้าแรก/เมนูหาหมวดอาชญากรรม แล้วบันทึก path ที่ใช้ได้ใน `_index.json` (`discovered_paths`) เพื่อเติม registry รอบถัดไป

### Batch D — สื่อภาษาอังกฤษและองค์กรระหว่างประเทศ (13) · Priority C · origin = `indirect`

เนื้อหา EN → เขียน `summary_1`/`content` เป็นภาษาไทย (`content.language = "th"`, `meta.original_language = "en"`)

| # | แหล่งข่าว/องค์กร | ขอบเขต | URL | สถานะ / หมายเหตุ |
| --- | --- | --- | --- | --- |
| 43 | Bangkok Post | Thailand General / Crime | https://www.bangkokpost.com/thailand/general/ | U |
| 44 | The Thaiger | Thailand Crime News | https://thethaiger.com/hot-news/crime | U |
| 45 | The Nation Thailand | National / Legal & Security | https://www.nationthailand.com/ | U |
| 46 | Khaosod English | Crime & Justice | https://www.khaosodenglish.com/ | U |
| 47 | Thai Rath English | Crime | https://en.thairath.co.th/news/crime | V |
| 48 | Pattaya Mail | คดีชาวต่างชาติ/พัทยา-ชลบุรี | https://www.pattayamail.com/ | U (จากรายการ Tier-1 เดิม) |
| 49 | The Phuket News | คดีภูเก็ต/นักท่องเที่ยว | https://www.thephuketnews.com/ | ? |
| 50 | Thai PBS World | Crime & Justice | https://www.thaipbsworld.com/ | ? |
| 51 | ASEAN NOW | Thailand Crime News Forum | https://aseannow.com/forum/163-thailand-crime-news/ | U — ⚠️ ฟอรัม = lead เท่านั้น ต้องมีแหล่งอื่นยืนยัน |
| 52 | INTERPOL | Global Crime & Operations | https://www.interpol.int/en/News-and-Events/News | U — เฉพาะข่าวที่เกี่ยวกับไทย/ภูมิภาค |
| 53 | UNODC SEAP | Transnational Crime (SE Asia) | https://www.unodc.org/southeastasiaandpacific/ | U — เช่นเดียวกัน |
| 54 | OCCRP | Organized Crime & Corruption | https://www.occrp.org/ | U — เช่นเดียวกัน |
| 55 | Reuters | Legal & Law Enforcement | https://www.reuters.com/legal/ | U — เช่นเดียวกัน; paywall → rendered mode หรือข้าม ไม่หลบ paywall |

ข่าวต่างประเทศที่ไม่เกี่ยวกับไทยหรือภูมิภาคให้ข้าม (นับเป็น `skipped_out_of_scope`).


---

## v1.2 — แก้ไขหลังรอบ 2026-10-22 (บังคับ ทับกฎเดิมเมื่อขัดกัน)

### ช่วงเวลาข่าว (แก้)
- Window = **00:00 ของเมื่อวาน (TARGET_DATE-1) ถึงเวลารัน** (Asia/Bangkok) — ครอบคลุม "เมื่อวานทั้งวัน + วันนี้" ไม่ใช่แค่ 24 ชม.ย้อนหลังนับจาก 08:01
- ข่าวที่เหตุเกิดก่อนหน้าต่างแต่เผยแพร่ในหน้าต่าง ให้เก็บได้ (ใช้วันเผยแพร่) · ข่าวต่างประเทศที่ไม่เกี่ยวกับไทย → `skipped_out_of_scope`

### วินัยการกวาด (แก้ปัญหาดึงน้อย)
1. **ห้ามปิดงานก่อนทุกแถว registry มีสถานะใน `source_health`** (`ok|empty|blocked|no_listing|search_only|error|not_attempted`) — `not_attempted` ต้องไม่มี; ถ้าไม่ทัน ให้รายงาน `status: partial` พร้อมเหตุผล ไม่ใช่ข้ามเงียบ ๆ
2. ลำดับ: (ก) เปิดหน้า listing ทุกแหล่งก่อนเพื่อรวบรวมรายการ+วันที่+permalink (ข) แล้วค่อย fetch เนื้อหาบทความทั้งหมดในหน้าต่าง (ค) ค่อย search เติม
3. แหล่งที่ fetch ล้มเหลว: ลอง path อื่น 1 ครั้ง แล้ว `web_search` ด้วย `allowed_domains` ของโดเมนนั้น (เช่น `["oncb.go.th"]`) **ห้ามใช้ web_search แบบไม่จำกัดโดเมนค้นหาข่าวรายวัน** (ได้ผลไม่มีวันที่)
4. ต้องเปิดหน้า listing ที่มีวันที่ของสื่อทุกสำนักใน Batch C/D อย่างน้อย 2 หน้า (หน้า 1 + หน้า 2 หรือ "ข่าวล่าสุด") เพื่อไม่ตกข่าวช่วงเช้ามืดของเมื่อวาน
5. ขั้นต่ำ: fetch ≥ 100 ครั้ง/รอบ · `articles_scraped_pass` ≥ 35 · `official_pr_articles` ≥ 8 (ถ้าไม่ถึงต้องอธิบายรายแหล่งใน Completion Report)

### Registry fixes (จากการทดสอบจริง 2026-10-22)
| แหล่ง | ผล | วิธีใช้ที่ถูก |
| --- | --- | --- |
| royalthaipolice.go.th | หน้าแรกแสดงข่าวปี 2563 | ไม่ใช้หน้าแรก; ค้น `allowed_domains=["royalthaipolice.go.th"]` หรือหา path ข่าวปัจจุบัน แล้วบันทึกใน `discovered_paths` |
| cib.go.th | client_error (/ และ /news) | ค้น allowed_domains ["cib.go.th"] |
| csd.go.th | มีแต่ประกาศจัดซื้อ | ถือเป็น `empty` ถ้าไม่มีข่าว |
| ccid1.ccib.go.th | ข่าวเก่า/ลิงก์ Facebook | `ok-stale` |
| touristpolice.go.th | **ใช้ `/tpb-news`** (permalink `/post/tpbnews{YYYYMMDD}{NN}`) | ✅ ใช้ได้ มีวันที่ |
| immigration.go.th | client_error | ค้น allowed_domains ["immigration.go.th"] (มี sub-site ตม.จว.) |
| dsi.go.th | **`/th/Type/Mission-News` ใช้ได้ มีวันที่+เวลา** | ✅ official |
| oncb.go.th | `/news` = 404 | ค้น allowed_domains ["oncb.go.th"] → permalink `or{N}.oncb.go.th/news/{id}` |
| amlo.go.th / sec.or.th / ocpb.go.th | หน้าแรกไม่มี listing | ค้น allowed_domains |
| pacc.go.th | หน้าแรกเป็น splash | ใช้ `https://www.pacc.go.th/home1` |
| nacc.go.th / isranews / bangkokbiznews | client_error | ค้น allowed_domains |
| ago.go.th | ✅ มีวันที่ | ข่าวคดีเฉพาะ `/press…` |
| correct.go.th / news.ch7.com | robots_disallowed | ตั้ง `blocked` ไม่หลบ |
| thaipoliceonline.go.th | ต้องใช้ JavaScript | ใช้ browser render หรือตั้ง `blocked` (ห้ามกรอกฟอร์ม) |
| mdes.go.th | **`/news` ใช้ได้ มีวันที่** (เตือนภัย/แอบอ้าง) | ✅ official |
| thaicert.or.th | ✅ หน้าแรกมี 6 ประกาศพร้อมวันที่ | ✅ official |
| thethaiger.com | **ใช้ `/th/news` (มีวันที่)** + `/hot-news/crime` (EN) | ✅ |
| thairath / dailynews / matichon / amarintv | ✅ listing มีวันที่/เวลา | ดูหน้า 2 ด้วย (`/crime/page/2/`) |
| mgronline /crime | ไม่มีวันที่ใน listing | เปิด permalink ตรวจวันที่ |
| naewna / khaosodenglish / thephuketnews / thaipbsworld | listing ไม่มีวันที่ | ตรวจวันที่ใน permalink |
| thaipost / khaosod / komchadluek | error/ว่าง | ค้น allowed_domains |

### ข้อควรระวัง
- Thaiger ฉบับไทยมีข่าวคดีต่างประเทศ (สหรัฐฯ สหราชอาณาจักร สิงคโปร์) → out_of_scope
- ข่าวเตือนแอบอ้างตำรวจ: ใช้ช่องทางที่ **แหล่งข่าวนั้นระบุ** (เช่น ดีอีระบุ 1111 กด 87) และอ้างอิง 1441/thaipoliceonline เฉพาะเมื่อมีแหล่งปัจจุบันยืนยัน
