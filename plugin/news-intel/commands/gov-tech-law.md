---
description: รันไปป์ไลน์ข่าวกฎหมาย/นโยบายเทคโนโลยีภาครัฐของวันนี้ด้วยมือ
argument-hint: "[YYYY-MM-DD] [force]"
---

ใช้ skill `gov-tech-law-news` (รวม addendum) กับ skill `news-enrich`

- `RUN_DATE` = วันที่ใน `$ARGUMENTS` ถ้ามี ไม่เช่นนั้นเรียก `current_time` แล้วใช้วันนี้ (Asia/Bangkok)
- `force` = รันแม้รอบของวันนั้นเสร็จแล้ว (add-only เสมอ)
- ส่งผลด้วย `news_put_article`, `news_put_report`, `news_put_entities`; ห้ามเขียนไฟล์ vault เอง; ห้าม git
- จบด้วยสรุปไม่เกิน 10 บรรทัด: จำนวนข่าว, ข่าวที่เปลี่ยนสถานะทางกฎหมาย (`legal_stage`), ปัญหาของแหล่งข่าว
