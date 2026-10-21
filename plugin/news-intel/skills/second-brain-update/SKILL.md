---
name: second-brain-update
description: ใช้ในงานทบทวนรายสัปดาห์ของ Second Brain (Obsidian vault ที่ news-hub สร้าง) — ตรวจชื่อซ้ำ entity กำพร้า สร้าง timeline ต่อหน่วยงาน และสรุปแนวโน้มรายสัปดาห์ผ่าน brain_* tools
---

# second-brain-update

Claude **ไม่แก้ไฟล์ vault โดยตรง** ทุกการเปลี่ยนแปลงทำผ่าน `news-hub` (`brain_search`, `brain_timeline`, `brain_upsert`) แล้ว server เป็นผู้เขียนโน้ต

## ขั้นตอนรายสัปดาห์ (สัปดาห์ ISO ที่เพิ่งจบ, Asia/Bangkok)
1. **รวบรวม**: `brain_timeline(since=<วันจันทร์>, until=<วันอาทิตย์>)` ได้ cases/entities/relations ของสัปดาห์
2. **ตรวจชื่อซ้ำ**: ค้นหา entity ที่ชื่อคล้ายกัน (ตัวสะกด, ตัวย่อ/ชื่อเต็ม, ไทย/อังกฤษ) ด้วย `brain_search`
   → สร้างข้อเสนอด้วย `brain_upsert(kind="merge_proposal", status="proposed", keep=..., merge=[...], reason=...)` **ห้ามรวมเอง ห้ามลบ**
3. **ตรวจ entity กำพร้า**: entity ที่ไม่มี relation เลยเกิน 30 วัน → รายงานในโน้ตสัปดาห์ (ไม่ต้องลบ)
4. **Timeline ต่อหน่วยงาน**: สำหรับ unit/agency ที่มี ≥3 case ในสัปดาห์ → `brain_upsert(kind="entity_timeline", entity=..., entries=[{date, case_id, one_line}])`
   one_line ต้องมาจากข้อเท็จจริงใน case (ไม่ใส่การคาดเดา)
5. **สรุปแนวโน้ม**: `brain_upsert(kind="weekly_note", week="YYYY-Www", body=...)` ประกอบด้วย
   - ประเภทคดี/MO/จังหวัดที่เพิ่มขึ้นหรือลดลงเทียบ 4 สัปดาห์ก่อนหน้า (ถ้าข้อมูล <4 สัปดาห์ ให้ระบุ "ข้อมูลไม่พอ" ห้ามอ้างแนวโน้ม)
   - 5 เรื่องที่มีความเชื่อมโยงหลายคดี (relation ≥2 เส้นเข้า entity เดียวกัน) พร้อมหลักฐาน case_id
   - ข้อเสนอแนะการปรับ registry/ชื่อมาตรฐาน (ถ้ามี)
6. จบด้วย `run_status_put(task="brain-review", week=..., status="complete", counts={...})`

## ข้อห้าม
- ไม่ลบ/ไม่เขียนทับโน้ตที่ `generated: false` (โน้ตที่มนุษย์เขียน)
- ไม่สร้างข้อสรุปเชิงบุคคล (ใครเป็นผู้บงการ/เชื่อมโยงบุคคลกับกลุ่ม) ยกเว้นข้อเท็จจริงที่แหล่งข่าวทางการระบุ และต้องมี case_id อ้างอิง
- ใช้กฎจริยธรรมของ `police-crime-news-pipeline` กับข้อความทั้งหมด
