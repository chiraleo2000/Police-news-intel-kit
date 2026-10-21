---
description: ทบทวน Second Brain รายสัปดาห์ (รวมชื่อซ้ำ ตรวจความสัมพันธ์ สรุป timeline และแนวโน้ม)
argument-hint: "[YYYY-Www]"
---

ใช้ skill `second-brain-update`

- สัปดาห์เป้าหมาย = `$ARGUMENTS` ถ้ามี ไม่เช่นนั้นสัปดาห์ ISO ที่เพิ่งจบ (Asia/Bangkok)
- ใช้เฉพาะ tool `brain_search`, `brain_timeline`, `brain_upsert` ของ `news-hub`
- ห้ามลบอะไรใน brain: การรวมชื่อซ้ำให้สร้างข้อเสนอ (`status: proposed`) เท่านั้น
- จบด้วยสรุปไม่เกิน 10 บรรทัด
