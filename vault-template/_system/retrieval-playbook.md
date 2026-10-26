# Retrieval playbook

ใช้ค้นเฉพาะจุด ไม่เปิดอ่านทั้งคลัง

## Claude / news-hub
- `GET /v1/brain/search?q=สงขลา&type=case`
- `GET /v1/brain/search?q=บช.สอท.&type=unit`
- `GET /v1/brain/timeline?since=2026-10-01&until=2026-10-31&bureau=บช.ปส.`

ถ้าไม่พบ ให้ `related_cases: []` ห้ามเดาความเชื่อมโยง

## คนใช้ Obsidian
เปิด `90_Bases/` แล้วกรอง `date` `bureau` `crime_type` `gang_or_group`
Local graph depth 1 ของโน้ตหน่วย ดูเส้นที่มีชื่อความสัมพันธ์ใน frontmatter `rel_*`

Pages แท็บ Second Brain เป็นสำเนา `graph.json` หลัง `node ops/rebuild-pages-feed.js` เท่านั้น
