---
description: รันไปป์ไลน์ข่าวอาชญากรรม/ตำรวจของวันนี้ (หรือวันที่ระบุ) ด้วยมือ
argument-hint: "[YYYY-MM-DD] [force]"
---

ใช้ skill `police-crime-news-pipeline` (รวม v1.2 addendum) กับ skill `line-link-intake` และ `news-enrich`

- `RUN_DATE` = วันที่ใน `$ARGUMENTS` ถ้ามี ไม่เช่นนั้นให้เรียก `current_time` แล้วใช้วันนี้ (Asia/Bangkok)
- ถ้า `$ARGUMENTS` มีคำว่า `force` ให้รันแม้ `run_status_get` จะบอกว่ารอบของวันนั้นเสร็จแล้ว (โหมด add-only ยังคงอยู่ ห้ามลบหรือเขียนทับของเดิม)
- ทำตามลำดับ preflight → Batch L, A, B, C, D → merge → enrich → publish → verify
- ถ้า `news-hub` เรียกไม่ได้ ให้หยุดและรายงาน ห้ามเดาข้อมูลย้อนหลัง
- จบด้วยสรุปไม่เกิน 10 บรรทัด: จำนวนข่าวตามประเภทคดี, ข่าวเตือนภัย, ปัญหาที่พบใน registry
