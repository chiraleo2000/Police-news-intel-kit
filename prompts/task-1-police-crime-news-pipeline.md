---
name: task-1-police-crime-news-pipeline
description: >
  รายวัน 06:00 (Asia/Bangkok) — กวาดข่าวอาชญากรรม/ตำรวจจากอินเทอร์เน็ตเป็นหลัก
  ตาม police-crime-news-pipeline v1.1 (registry 55 แหล่ง Batch A–D)
  → taxonomy + TAGs + แนวโน้ม 7 วัน → วิเคราะห์ (Second Brain + BD×งบ 2570) →
  JSON เว็บ · Markdown Obsidian · PDF+Infographic
  ⛔ NO GIT
schedule: "CRON_TZ=Asia/Bangkok 0 6 * * *"
trigger:
  - "กวาดข่าวอาชญากรรม"
  - "ข่าวตำรวจ"
  - "run police crime pipeline"
  - "task 1 online crime news"
---

# Task 1 — กวาดข่าวออนไลน์ (police-crime-news-pipeline)

ไฟล์นี้คือ **police-crime-news-pipeline.md** ที่ต่อยอดสำหรับ scheduled task  
ช่องทางหลัก = เว็บ (Batch A–D) · **ไม่ได้อ่าน Excel จาก LINE** (ดู Task 2)

## สิ่งที่ต่อยอดจากต้นฉบับ
1. registry 55 แหล่ง Batch A–D (กวาดออนไลน์)
2. จัดกลุ่มประเภทอาชญากรรม + TAGs + แนวโน้ม 7 วัน
3. Infographic + PDF
4. จริยธรรมคดี · อ่านวันที่ พ.ศ. · registry health check
5. วิเคราะห์ Second Brain + BD×งบ 2570 ในรอบเดียวกัน
6. Output 3 ช่อง: JSON เว็บ · MD Obsidian · PDF+Infographic

## Run params
`RUN_DATE` / `TARGET_DATE` = วันนี้ (Asia/Bangkok). Window = 24 ชั่วโมงก่อน RUN_DATE.
รันอัตโนมัติ — ห้ามถามคำถามกลับ
manifest อ่านไม่ได้ → หยุด `PREFLIGHT_FAILED` · วันนี้เสร็จแล้วและไม่มี `force` → `ALREADY_COMPLETE`

## Global rules (ใช้ทุกขั้น)

### Git / deploy
- ⛔ ห้ามรัน `git add` / `git commit` / `git push` และห้ามเขียน deploy/push script
  การ copy ไฟล์เสร็จแล้วไป `github-pages/data/` ทำได้ แต่การ publish repo เป็นงานแยก

### Fetch order
1. **Official** `.go.th` / `.or.th` URL (`truncated` mode → ถ้าเนื้อหา <300 ตัวอักษร retry `rendered`)
2. **สื่อหมวดอาชญากรรม** (Batch C/D) — ใช้เป็นแหล่งยืนยันของ Batch A/B เมื่อเว็บทางการไม่มีข่าว/ดึงไม่ได้
3. **Facebook / โซเชียล = reference only — ห้าม fetch/เปิดเด็ดขาด**
   เก็บ URL ไว้ใน `social_media.agency_facebook` เท่านั้น ถ้าข่าวจาก FB ถูกสื่ออ้างถึง
   ให้ดึงจากบทความสื่อนั้น แล้วระบุ `source.type = "aggregator"`
4. **เว็บรับแจ้งความ/ฟอร์มใด ๆ (เช่น thaipoliceonline.go.th)**: อ่านได้เฉพาะหน้า "ข่าว/เตือนภัย"
   ห้ามกรอก/ส่งแบบฟอร์ม ห้ามสร้างบัญชี
- Caps ต่อ batch: A ≤4 `web_search` / ≤18 `web_fetch`; B ≤3 / ≤14; C ≤3 / ≤16; D ≤3 / ≤14
- ห้าม fetch URL ซ้ำ; หน่วยงานที่ไม่มีข่าวใหม่ให้ข้ามและรายงาน `no_news_today`
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

### Window & dedupe
- เก็บเฉพาะข่าวที่เผยแพร่ในช่วง 24 ชม.; ถ้าไม่เห็นวันที่ ให้เก็บเฉพาะรายการ top-3 ของหน้า "ล่าสุด" มิฉะนั้นข้าม
- **Case-level merge:** คดีเดียวกันมักถูกรายงานหลายสื่อ ถือว่าเป็นคดีเดียวกันเมื่อ ≥3 ใน 4 ตรงกัน:
  สถานที่/จังหวัด, วันเกิดเหตุหรือวันจับกุม, ประเภทคดี, ผู้ต้องหา/ตัวเลขสำคัญ
  → รวมเป็น **1 article** ใช้แหล่งทางการเป็น `source.url` หลัก ส่วนแหล่งอื่นใส่ `corroborating_sources[]`
- Same-day rerun: dedupe ด้วย `source.url`, title similarity ≥90% และ case-key ข้างต้น
  **Add-only** — ห้ามลบ/เขียนทับ article หรือ manifest entry เดิม
  ก่อนรายงาน "completed" ให้สแกนโฟลเดอร์วันที่เป้าหมายและลบรายการซ้ำที่เพิ่งสร้าง (เก็บอันเก่า)

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
1. **Second Brain รายวัน** → เขียน `_brain_daily.md`
   - entities: หน่วยงาน / MO / จังหวัด / กฎหมายที่แหล่งระบุ
   - timeline สั้นต่อหน่วยงานที่ปรากฏวันนี้
   - ชื่อซ้ำ → `merge_proposal` สถานะ `proposed` เท่านั้น ห้ามรวมเอง
2. **ข้อเสนอธุรกิจ × งบปี 2570** → เขียน `_bd_leads.json`
   - อ่านเฉพาะ `reference/budget-fy2570-police-related.json` (หรือ `.md`)
   - จับคู่หน่วยงาน/เทคโนโลยีในข่าวกับโครงการ ตร.และหน่วยงานเกี่ยวข้อง
   - ห้ามเดาชื่อโครงการหรือตัวเลขงบ
3. ใส่บทวิเคราะห์ทั้งสองใน PDF และในไฟล์ Markdown ของ Obsidian
4. ห้ามแตะโน้ตที่ `generated: false`

### ช่องทางผลลัพธ์ (บังคับครบ 3)
1. **JSON สำหรับเว็บ (GitHub Pages)** — copy ไป `github-pages/data/` (file copy เท่านั้น ห้าม git push)
2. **Markdown/text สำหรับ Obsidian** — `vault/10_Daily/...` และสำเนาใน `Document/...` (`generated: true`)
3. **PDF สำหรับดาวน์โหลด + Infographic** — HTML→PDF และ infographic HTML→PNG (THSarabun บังคับ)

### PDF / Font
- PDF บังคับ ห้ามรายงานว่าข้าม ลองตามลำดับ: weasyprint → playwright → wkhtmltopdf → headless chrome/edge `--print-to-pdf`
- ต้อง embed THSarabun (Regular/Bold/Italic/Bold-Italic) ไม่ให้ภาษาไทยเป็นกล่อง

---

## การจัดกลุ่มตามประเภทอาชญากรรม (Crime Taxonomy)

ทุก article มี **1 primary** `crime_type_code` และ 0–2 `secondary_crime_types`
(`topic` / `category_label` ใช้ **ชื่อไทยเต็มเท่านั้น**; โค้ดใช้ภายในเท่านั้น)

| code | ชื่อกลุ่ม (category_label) | ครอบคลุม |
| --- | --- | --- |
| CYBER | อาชญากรรมไซเบอร์และออนไลน์ | แก๊งคอลเซ็นเตอร์ หลอกลวงออนไลน์ ฟิชชิง แฮก บัญชีม้า ซิมม้า มิจฉาชีพโซเชียล แอบอ้างหน่วยงาน ภัยคุกคามไซเบอร์ |
| ECON | คดีเศรษฐกิจ การเงิน และฟอกเงิน | แชร์ลูกโซ่ หลอกลงทุน (รวมสินทรัพย์ดิจิทัล) ปลอมแปลงเอกสาร ฉ้อโกง ยึด/อายัดทรัพย์ ปปง. |
| DRUG | ยาเสพติด | ผลิต ลำเลียง จำหน่าย เสพ ยึดทรัพย์ขบวนการ |
| HUMAN | ค้ามนุษย์ แรงงานผิดกฎหมาย และคุ้มครองเด็ก | ค้ามนุษย์ แรงงานบังคับ บังคับกระทำผิดในแก๊งสแกม ล่วงละเมิดเด็ก ข่มขู่ทางเพศ (sextortion) ลักลอบเข้าเมือง |
| VIOLENT | คดีชีวิต ร่างกาย และเพศ | ฆาตกรรม ทำร้ายร่างกาย ข่มขืน/อนาจาร ความรุนแรงในครอบครัว |
| PROPERTY | คดีทรัพย์สิน | ลักทรัพย์ ชิงทรัพย์ ปล้น โจรกรรมรถ |
| ORGANIZED | คดีอุกฉกรรจ์ ผู้มีอิทธิพล และอาวุธ | กลุ่มอิทธิพล มือปืน อาวุธปืน/ระเบิดผิดกฎหมาย หมายจับสำคัญ ผู้หลบหนี นักโทษแหกคุก/หนีจากเรือนจำ |
| CONSUMER | คุ้มครองผู้บริโภคและสินค้าผิดกฎหมาย | สินค้าปลอม ยา/อาหารเสริมอันตราย โฆษณาเกินจริง |
| TOURIST | อาชญากรรมที่เกี่ยวข้องกับนักท่องเที่ยวและชาวต่างชาติ | นักท่องเที่ยวตกเป็นเหยื่อ/ผู้ต้องหา แก๊งต่างชาติ ทัวร์ผิดกฎหมาย ไกด์เถื่อน นอมินี overstay |
| ROAD | ความปลอดภัยทางหลวงและการสกัดจับ | ด่านตรวจ สกัดลำเลียงของผิดกฎหมาย รถบรรทุก อุบัติเหตุร้ายแรงที่มีคดี |
| CORRUPT | ทุจริตและประพฤติมิชอบของเจ้าหน้าที่รัฐ | ทุจริต เรียกรับผลประโยชน์ สืบสวนข้าราชการ ป.ป.ช./ป.ป.ท. |
| POLICE | การปฏิบัติหน้าที่และนโยบายตำรวจ | นโยบาย/แถลง ตร. โยกย้าย-แต่งตั้ง วินัยตำรวจ ร้องเรียน การปฏิบัติการพิเศษ ผลงานเชิงรุก การชี้แจงข่าว |
| TRANSNAT | อาชญากรรมข้ามชาติและความร่วมมือระหว่างประเทศ | INTERPOL/UNODC/OCCRP ผู้ร้ายข้ามแดน ขบวนการข้ามชาติ ความร่วมมือ ตม./ตร.สากล |
| OTHER | อื่น ๆ | ไม่เข้ากลุ่มใด (ใช้น้อยที่สุด) |

กฎเลือก primary: เลือกตาม "ความผิดหลักที่เป็นแก่นข่าว"; ถ้าแก่นข่าวคือ **ตำรวจ/หน่วยงานทำอะไร** (แถลง นโยบาย วินัย)
ให้ใช้ POLICE และใส่ประเภทคดีที่เกี่ยวข้องเป็น secondary. ข่าวชี้แจงข่าวปลอมใช้กลุ่มของเรื่องที่ถูกกล่าวถึง + `is_clarification`.

## ระบบ TAGs

เก็บใน `meta.tags` (array ภาษาไทย ไม่เกิน 10 tag/ข่าว) และ `meta.tags_struct`:

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
  "impersonation": false
}
```

ค่าที่อนุญาต:
- `case_stage`: เกิดเหตุ | ออกหมายจับ | จับกุม | แถลงข่าว | ส่งฟ้อง | ศาล/คำพิพากษา | ยึด/อายัดทรัพย์ | ติดตามตัว
- `police_role`: ป้องกัน/เตือนภัย | สืบสวนจับกุม | สอบสวน | ปราบปรามเชิงรุก | นโยบาย/บริหาร | วินัย/ร้องเรียน | ความร่วมมือสากล | ชี้แจงข่าว
- `scale`: ท้องถิ่น | ข้ามจังหวัด | ระดับชาติ | ข้ามชาติ
- `region`: กรุงเทพฯ และปริมณฑล | ภาคกลาง | ภาคเหนือ | ภาคตะวันออกเฉียงเหนือ | ภาคตะวันออก | ภาคตะวันตก | ภาคใต้ | ต่างประเทศ
  (แมปจากจังหวัดเสมอ ไม่เดา)
- `alert`: true เมื่อข่าวมีการเตือนภัยประชาชนโดยตรง
- `province`: ชื่อจังหวัดเต็มภาษาไทย (ใช้สร้าง hotspot); ถ้าไม่ระบุจังหวัดให้เป็น `[]` ไม่เดาจากชื่อหน่วย
- `modus_operandi`: เลือกจากรายการ canonical ก่อน ถ้าไม่มีให้สร้างคำสั้นใหม่และเก็บใน `_tags.json` ส่วน `new_mo_candidates`

**Canonical MO (ใช้ปรับให้ tag สอดคล้องข้ามวัน):** คอลเซ็นเตอร์ · แอบอ้างเจ้าหน้าที่รัฐ/ตำรวจ · ส่งพัสดุปลอม · หลอกลงทุนคริปโต/สินทรัพย์ดิจิทัล ·
หลอกลงทุนหุ้น/ฟอเร็กซ์ · หลอกรักออนไลน์ (romance scam) · หลอกซื้อขายออนไลน์ · หลอกหางาน/งานออนไลน์ · ปล่อยกู้นอกระบบออนไลน์ ·
บัญชีม้า/ซิมม้า · ลิงก์ปลอม/ฟิชชิง · มัลแวร์/แอปดูดเงิน · ข่มขู่ทางเพศ (sextortion) · เว็บพนันออนไลน์ · ศูนย์/แก๊งสแกมชายแดน ·
แชร์ลูกโซ่ · ฟอกเงินผ่านบัญชีม้า/คริปโต · ลักลอบขนยาเสพติด · สินค้า/ยาปลอม · ค้ามนุษย์เพื่อบังคับกระทำผิด · แรงงานต่างด้าวผิดกฎหมาย ·
ไกด์/ทัวร์เถื่อน · นอมินีธุรกิจต่างชาติ

---

## Pipeline — one run, 10 ขั้นตอน (ออนไลน์)

**Scrape (4 batch — แหล่งหลักของ Task 1)**
1. **Batch A** — หน่วยตำรวจ (14) → `News/Articles/{Parent}/{Agency}/{DATE}/{Slug}/`
2. **Batch B** — หน่วยยุติธรรม/บังคับใช้กฎหมายอื่น และหน่วยเตือนภัย (12)
3. **Batch C** — สื่อไทยหมวดอาชญากรรม/โรงพัก (16)
4. **Batch D** — สื่อภาษาอังกฤษและองค์กรระหว่างประเทศ (13)

   ทุก article มี `article.json` และ `article.md` และต้องจัด `crime_type_code` + tags ตั้งแต่ขั้นสแครป

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
    "source_url": "", "corroborating_sources": [],
    "actions_public": [], "actions_org": [], "police_performance": {},
    "stats": {}, "tags": [], "category_label": "", "published_at": ""
  }]
}
```
Field mapping `post ← article`: `id←article_id`, `slug/title←content.*`, `topic/category_label←meta.category_label`,
`secondary_topics←tags_struct.secondary_crime_types (แปลงเป็นชื่อไทย)`, `agency←agency.parent + " > " + agency.name`,
`origin←source.origin`, `priority←meta.priority`, `severity/actions_*/police_performance/stats←crime_insights.*`,
`content←content.summary_1 ขยายเป็น ≥350 คำ (เฉพาะข้อเท็จจริงจากแหล่ง)`, `source_url←source.url`, `tags←meta.tags`, `published_at←meta.published_at`

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
github-pages/data/{DATE}_crime.json, {DATE}_hotspots.json, {DATE}_alerts.json,
  {DATE}_trends.json, {DATE}_bd_leads.json, manifest.json
vault/10_Daily/{DATE}.md
vault/20_Cases/{case_id}.md
```

## Completion Report
```json
{
  "run_date": "", "target_date": "",
  "task": "1-online",
  "pipeline": "task-1-police-crime-news-pipeline-1.0",
  "base_skill": "police-crime-news-pipeline-combined-1.1",
  "batches": {
    "A": {"attempted": 14, "created": 0, "no_news_today": []},
    "B": {"attempted": 12, "created": 0, "no_news_today": []},
    "C": {"attempted": 16, "created": 0, "no_news_today": []},
    "D": {"attempted": 13, "created": 0, "no_news_today": [], "skipped_out_of_scope": 0}
  },
  "articles_total": 0,
  "bd_leads_count": 0,
  "brain_entities_touched": 0,
  "outputs": {"json_web": false, "obsidian_md": false, "pdf": false, "infographic": false},
  "trend_baseline": "ok|insufficient",
  "registry_issues": [],
  "github_pages_copied": false,
  "git_push": "NOT PERFORMED — no git task run",
  "status": "complete|partial|failed"
}
```
ข้อความสุดท้าย ≤10 บรรทัด

---

## Source registry (55) — `Agency | official_url | search keyword | facebook (reference only, never fetched)`

สถานะ URL: **V** = ตรวจพบโดเมนจริงจากการค้นหา (ยังไม่ได้ทดสอบ fetch ทุกหน้า) · **U** = จากรายการของผู้ใช้ · **?** = ยังไม่ยืนยัน ต้องตรวจก่อนใช้
`search_only` = ไม่มีเว็บทางการที่ทราบ ให้ใช้ `web_search` แล้ว fetch บทความจากเว็บ ตร./สื่อ

### Batch A — หน่วยตำรวจ (14) · Priority A · origin = `direct`

| # | หน่วยงาน | official_url | สถานะ | search keyword | facebook (ref only) |
| --- | --- | --- | --- | --- | --- |
| 1 | สำนักงานตำรวจแห่งชาติ (ตร.) | https://www.royalthaipolice.go.th/ | U | Royal Thai Police announcement policy | https://www.facebook.com/royalthaipolice |
| 2 | ตำรวจไซเบอร์ (บช.สอท./CCIB) | https://ccid1.ccib.go.th/ | U | Thailand CCIB cyber police scam | https://www.facebook.com/CybercopTH |
| 3 | ตำรวจสอบสวนกลาง (CIB) | https://www.cib.go.th/news?category=general | U | Thailand CIB crackdown arrest | https://www.facebook.com/CIBTHAILAND |
| 4 | กองปราบปราม (บก.ป./CSD) | https://csd.go.th/ | U | Thailand CSD arrest warrant gang | https://www.facebook.com/csdthai |
| 5 | สืบนครบาล (บก.สส.บช.น./IDMB) | search_only | – | กองบังคับการสืบสวนสอบสวน นครบาล จับกุม | https://www.facebook.com/IDMB.Bangkok |
| 6 | ตำรวจทางหลวง (บก.ทล.) | search_only | – | ตำรวจทางหลวง สกัดจับ ลำเลียง | https://www.facebook.com/highway1193 |
| 7 | ตำรวจเศรษฐกิจ (บก.ปอศ.) | search_only | – | ตำรวจเศรษฐกิจ ปอศ. แชร์ลูกโซ่ หลอกลงทุน | https://www.facebook.com/ECDThai |
| 8 | ตำรวจคุ้มครองผู้บริโภค (บก.ปคบ.) | search_only | – | บก.ปคบ. สินค้าปลอม อาหารเสริม ยา | https://www.facebook.com/cppd1135 |
| 9 | ตำรวจค้ามนุษย์ (บก.ปคม.) + ศูนย์ต่อต้านการค้ามนุษย์ ตร. (ศตคม.) | search_only | – | บก.ปคม. ศตคม.ตร. ค้ามนุษย์ แก๊งสแกม | https://www.facebook.com/ATPDPOLICE |
| 10 | ตำรวจท่องเที่ยว (บช.ทท.) | https://www.touristpolice.go.th/ (ข่าวอยู่ที่ /post/…, มีฉบับ EN) | V | Tourist Police Bureau Thailand | https://www.facebook.com/1155TPB |
| 11 | ศูนย์ PCT (ศปอส.ตร.) | search_only | – | ศูนย์ PCT ปราบปรามอาชญากรรมทางเทคโนโลยี | https://www.facebook.com/PCTPOLICE |
| 12 | ตำรวจเทคโนโลยี (บก.ปอท.) | search_only | – | บก.ปอท. หลักฐานดิจิทัล เจาะระบบ | https://www.facebook.com/jahooktcsd |
| 13 | สำนักงานตรวจคนเข้าเมือง (ตม./Immigration Bureau) | https://www.immigration.go.th/ | ? | ตม. จับกุม ต่างด้าว overstay นอมินี | (ไม่มี) |
| 14 | ตำรวจภูธรภาค 1–9 / บช.น. / ตชด. (รวมเป็นรายการค้นหา) | search_only | – | ตำรวจภูธรภาค แถลงจับกุม; บช.น. แถลง | (ไม่มี) |

หมายเหตุ Batch A:
- แถว search_only ใช้ `web_search` (≤4 ครั้ง/batch รวมทุกแถว) → fetch บทความจากเว็บ ตร. หรือสื่อ Batch C/D; **ห้ามเปิด Facebook**
- ตำรวจท่องเที่ยว: หน้าข่าวเป็นโพสต์ย่อย (`/post/...`) ใช้หน้าแรกหา permalink; ข่าวฉบับ EN ให้ตั้ง `original_language = "en"` และเขียนสรุปเป็นไทย
- ถ้าพบเว็บทางการของแถว search_only ภายหลัง ให้เติมใน registry และเปลี่ยนสถานะเป็น V หลังตรวจ

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
