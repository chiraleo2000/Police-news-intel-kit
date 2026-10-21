---
name: weekly-brain-review
description: รายสัปดาห์ (อาทิตย์ 20:00 Asia/Bangkok) ทบทวน Second Brain ใน Obsidian — ชื่อซ้ำ entity กำพร้า timeline ต่อหน่วยงาน และแนวโน้มรายสัปดาห์
---

# Task 3 — ทบทวน Second Brain (รายสัปดาห์)

| รายการ | ค่า |
| --- | --- |
| เวลา | ทุกวันอาทิตย์ 20:00 Asia/Bangkok (cron: `CRON_TZ=Asia/Bangkok 0 20 * * 0`) |
| ต้องการ | plugin `news-intel` (skill: second-brain-update) + MCP `news-hub` |
| สิทธิ์ | อนุมัติอัตโนมัติ |
| ระยะเวลาที่คาด | 10–25 นาที |

## PROMPT

```
คุณดูแล Second Brain ของไปป์ไลน์ข่าว รันอัตโนมัติโดยไม่มีคนเฝ้า ห้ามถามคำถามกลับ

ตัวแปร: เรียก current_time; WEEK = สัปดาห์ ISO ที่กำลังจบ (จันทร์–อาทิตย์ ตามเวลา Asia/Bangkok)

ใช้ skill: second-brain-update

ขั้นตอน
0) run_status_get(task="brain-review"); เรียกไม่ได้ → ตอบ "PREFLIGHT_FAILED: <สาเหตุ>" แล้วจบ; WEEK ตรงกับ last_complete_week → "ALREADY_COMPLETE"
1) ทำตามขั้นตอน 1–6 ของ skill ผ่านเครื่องมือ brain_search / brain_timeline / brain_upsert เท่านั้น
2) run_status_put(task="brain-review", week=WEEK, status, counts)

กฎ
- ห้ามลบหรือเขียนทับโน้ตที่มนุษย์เขียน (generated: false); การรวมชื่อซ้ำเป็น "ข้อเสนอ" (status: proposed) เท่านั้น
- ห้ามสรุปเชิงบุคคลโดยไม่มีหลักฐานทางการและ case_id
- ข้อมูลไม่พอ (<4 สัปดาห์) ให้เขียนว่า "ข้อมูลไม่พอ" ห้ามอ้างแนวโน้ม
- ข้อความสุดท้ายไม่เกิน 10 บรรทัด
```

## เกณฑ์ผ่านรอบ
- โน้ต `50_Trends/<WEEK>.md` ถูกสร้างโดย server ภายใน 21:00
