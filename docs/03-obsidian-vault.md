# 03 — Obsidian vault: โครง กฎ และการใช้วิเคราะห์

## 1) บทบาท

Vault เป็น **ชั้นมุมมอง (view layer)** ที่ server สร้างจาก DB ทุกวัน ไม่ใช่แหล่งความจริง
ถ้าไฟล์ในโฟลเดอร์ที่ server เขียนถูกแก้หรือลบ — `vault-build --full` สร้างกลับมาได้
ถ้าต้องการจดความเห็นของตัวเอง ให้เขียนในโฟลเดอร์ของมนุษย์ (ตารางข้อ 2)

## 2) โครงโฟลเดอร์และเจ้าของ

| โฟลเดอร์ | เจ้าของ | เนื้อหา |
| --- | --- | --- |
| `00_Inbox` | คุณ | ร่าง/จดชั่วคราว |
| `10_Daily` | (เลิกใช้เป็นผลลัพธ์หลัก) | ดัชนีสั้นได้ถ้าจำเป็น — **Task 1/2 เขียน Cases + CrimeTypes เป็นหลัก** |
| `20_Cases` | server | 1 โน้ต = 1 คดี/หัวข้อข่าวหลัง merge (`generated: true`) |
| `30_Entities/Units, Agencies, Laws, MO, Places, Regions` | server | โน้ตหน่วยงาน กฎหมาย รูปแบบการกระทำผิด สถานที่ ภาค |
| `40_CrimeTypes` | server | 14 ประเภท (หน้ารวมของแต่ละประเภท) |
| `50_Trends` | server | แนวโน้มรายสัปดาห์ (จาก `weekly_note`) |
| `60_Notes` | คุณ | บันทึกวิเคราะห์ของคุณ ลิงก์เข้า `[[คดี]]` ได้ |
| `70_Canvas` | คุณ | Canvas สำหรับวางภาพรวมคดี |
| `90_Bases` | คุณ (มีตัวอย่างจาก server ครั้งแรก) | ไฟล์ `.base` |
| `99_Archive` | server | คดีเกิน 90 วัน (กรองออกจากกราฟ) |
| `_system` | คุณ | README + `canonical-entities.md` |

กฎเหล็ก: server เขียนเฉพาะไฟล์ที่ frontmatter มี `generated: true`. โน้ตของคุณใส่ `generated: false` (หรือไม่มี frontmatter) แล้ว server จะไม่แตะ

## 3) รูปแบบโน้ต (frontmatter)

**คดี** `20_Cases/<case_id>.md`

```yaml
---
type: case
generated: true
case_id: 2026-10-21-cyber-001
date: 2026-10-21
crime_type: "[[อาชญากรรมไซเบอร์และออนไลน์]]"
secondary: ["[[คดีเศรษฐกิจ การเงิน และฟอกเงิน]]"]
group: "แก๊งคอลเซ็นเตอร์/บัญชีม้า"
severity: high            # low | medium | high | critical
stage: arrest             # report|investigation|arrest|prosecution|verdict|policy
verification: confirmed   # confirmed | single_source | unverified
provinces: ["[[เชียงใหม่]]"]
units: ["[[บช.สอท.]]"]
mo: ["[[บัญชีม้า]]", "[[ซิมม้า]]"]
laws: ["[[พ.ร.ก.มาตรการป้องกันและปราบปรามอาชญากรรมทางเทคโนโลยี]]"]
tags: [crime/cyber, stage/arrest]
hashtags: ["#บัญชีม้า", "#บช_สอท"]
sources: ["https://..."]
---
```

เนื้อหา: สรุป 3–5 บรรทัดตามที่ตำรวจแถลง (ใช้คำว่า "ผู้ต้องหา/ตามที่ตำรวจแถลง"), ตัวเลข, ผลกระทบเชิงวิเคราะห์ (แยกจากข้อเท็จจริง พร้อมความมั่นใจ/ระยะเวลา), ลิงก์ต้นทาง

**Entity** `30_Entities/<ชนิด>/<ชื่อ>.md`: `type`, `generated: true`, `aliases`, `parent` (เช่น หน่วยใต้ บช.), ส่วน "ไทม์ไลน์" (รายการคดีเรียงวันที่ — server สร้าง) และ "ความเกี่ยวข้อง" (relation นับจำนวน)

**ห้ามสร้างโน้ตบุคคล** สำหรับผู้ต้องหา ผู้เสียหาย หรือพยาน; ไม่ใส่ชื่อ-นามสกุลจริงใน frontmatter/ชื่อไฟล์; คดีเพศ/ค้ามนุษย์/เด็กไม่ระบุตัวผู้เสียหายและสถานที่เฉพาะเจาะจง

## 4) กฎการลิงก์ (กันกราฟรก)

1. คดีลิงก์ไปที่: crime_type 1 + secondary ≤ 2, units ≤ 3, laws ≤ 3, provinces ≤ 3, mo ≤ 4
2. `10_Daily` **ไม่** ลิงก์เข้าคดีด้วย wikilink (ใช้ตารางข้อความ + ชื่อไฟล์เป็นข้อความธรรมดา) เพื่อไม่ให้ทุกคดีผูกกับโน้ตวันที่
3. หน้า crime_type/entity ไม่ลิงก์ย้อนทุกคดีในเนื้อหา — ใช้ Backlinks/Bases แสดงแทน
4. ชื่อเรียกต้องมาจาก `canonical-entities.md`; ถ้าไม่พบ server จะเก็บเป็นข้อเสนอชื่อใหม่ แล้วให้ Task 3 รายสัปดาห์เสนอรวม/ยอมรับ (ต้องมีคนอนุมัติ)
5. คดีเก่ากว่า 90 วัน → `99_Archive/` (ไม่ลบ relation ใน DB)

## 5) ตั้งค่า Obsidian

**Graph view → Filters**
```
-path:"99_Archive" -path:"10_Daily" -path:"_system"
```
**Groups** (สี): `path:"20_Cases"` · `path:"30_Entities/Units"` · `path:"30_Entities/MO"` · `path:"30_Entities/Laws"` · `path:"40_CrimeTypes"`
**Display:** ปิด "Orphans"; ใช้ Local graph ที่ depth 2 เมื่อเปิดดูทีละหน่วย/คดี

**Core plugins:** Properties, Bases, Backlinks, Graph view, Outline, Search
**Community (ทางเลือก):**
| ปลั๊กอิน | ใช้ทำ | หมายเหตุ |
| --- | --- | --- |
| Dataview | คิวรีตาราง/นับ | ถ้าใช้ Bases ครบแล้วไม่จำเป็น |
| Base Graph / Bases Plus | กราฟ/มุมมองเสริมใน Bases | ตรวจเวอร์ชัน Obsidian ขั้นต่ำและชื่อ view ก่อนติดตั้ง |
| Excalidraw / Canvas | วาดแผนผังคดีด้วยมือ | Canvas เป็น core |

## 6) ตัวอย่างคิวรี

> ตัวอย่างด้านล่างเขียนจากความเข้าใจไวยากรณ์ ณ ปัจจุบัน **ต้องทดสอบกับเวอร์ชันที่ติดตั้ง** (Bases ยังพัฒนาต่อเนื่อง)

**Dataview — คดีความรุนแรงสูง 30 วัน**
````
```dataview
TABLE date, crime_type, units, provinces
FROM "20_Cases"
WHERE date >= date(today) - dur(30 days) AND (severity = "high" OR severity = "critical")
SORT date DESC
```
````

**Dataview — จำนวนคดีต่อ MO**
````
```dataview
TABLE length(rows) AS คดี
FROM "20_Cases"
FLATTEN mo AS m
GROUP BY m
SORT length(rows) DESC
```
````

**Bases — `90_Bases/cases-30d.base`** (ร่างโครงสร้าง)
```yaml
filters:
  and:
    - file.inFolder("20_Cases")
    - 'date >= today() - "30d"'
views:
  - type: table
    name: คดี 30 วัน
    order:
      - date
      - crime_type
      - severity
      - units
      - provinces
    sort:
      - property: date
        direction: DESC
```

## 7) คำถามวิเคราะห์ที่ใช้กราฟตอบได้

| คำถาม | วิธีดู |
| --- | --- |
| หน่วยใดจับคดีรูปแบบ X บ่อยที่สุด | เปิดโน้ต MO → Backlinks → กรองคดี → ดู `units` |
| รูปแบบ X ย้ายพื้นที่ไปไหน | Bases กรอง `mo` แล้วจัดกลุ่มตาม `provinces` รายสัปดาห์ |
| กฎหมายใดถูกอ้างถึงบ่อยในคดีไซเบอร์ | โน้ตกฎหมาย → Backlinks |
| คดีที่เกี่ยวพันกัน | Local graph depth 2 ของคดี; relation `follow_up_of` |
| กลุ่มที่ไม่มีโน้ต (orphans) | Task 3 รายสัปดาห์ตรวจแล้วเสนอเชื่อม |

**ข้อควรจำ:** กราฟแสดงความเกี่ยวข้องที่ถูกสกัดจากข่าว ไม่ใช่หลักฐานเชิงสาเหตุ และรายงานของตำรวจเป็นคำแถลงฝ่ายเดียว — ใช้ช่อง `verification` ประกอบทุกครั้งก่อนสรุป

## 8) ความเป็นส่วนตัวและความปลอดภัย (PDPA)

- Vault = ข้อมูลภายใน ห้ามแชร์สาธารณะ/Publish; ถ้าใช้ Obsidian Sync ให้เปิดการเข้ารหัสแบบ end-to-end; ถ้าใช้ OneDrive/Syncthing ให้ตั้งสิทธิ์เฉพาะบัญชีของคุณ
- ไม่มีข้อมูลผู้ส่งลิงก์จาก LINE ใน vault (ไม่เก็บใน DB ตั้งแต่ต้น)
- ปลั๊กอินชุมชนเข้าถึงไฟล์ทั้งหมดใน vault — ติดตั้งเท่าที่จำเป็น ตรวจผู้พัฒนา/จำนวนผู้ใช้ และอัปเดตสม่ำเสมอ
- ขอลบข้อมูล: ลบที่ DB (ด้วยมือโดยผู้ดูแล) → `vault-build --full` → ลบไฟล์ที่ค้างใน `99_Archive` → ลบสำเนาในที่ซิงก์และ backup ที่เกี่ยวข้อง
- ก่อนเปิดให้คนอื่นเข้าถึง vault ให้ทบทวนกับเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคลขององค์กร

## 9) บำรุงรักษา

| รอบ | งาน |
| --- | --- |
| รายสัปดาห์ | อ่าน `50_Trends/<สัปดาห์>.md` + ข้อเสนอรวมชื่อจาก Task 3 → ยอมรับ/ปฏิเสธ → อัปเดต `canonical-entities.md` |
| รายเดือน | ตรวจขนาด vault และจำนวน orphan; ทบทวนรายการ MO ใหม่ที่ถูกเสนอ |
| รายไตรมาส | ทบทวนกฎการลิงก์และ filter กราฟ; ทดสอบกู้คืน vault จาก backup |

เมื่อเพิ่มหมวด/MO ใหม่: แก้ `canonical-entities.md` → รัน `node dist\jobs\vault-build.js --full`
