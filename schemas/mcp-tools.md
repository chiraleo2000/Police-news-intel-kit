# MCP `news-hub` — สรุป tools สำหรับ Claude schedules

อ้างอิงเต็ม: `docs/02-news-hub-spec.md`  
ใน Claude ชื่อ tool จะขึ้นเป็น `mcp__news-hub__<ชื่อ>` — ใน skill/prompt อ้างแบบ `news-hub.<ชื่อ>` หรือชื่อสั้น

| Tool | ใช้โดย | หน้าที่ |
| --- | --- | --- |
| `registry_get(name)` | Task 1, 2 | `crime` = 55 แหล่ง · `gov` = 109 แหล่ง |
| `line_links_get(date, status)` | Task 2 + line-link-intake | อ่านลิงก์ใหม่จาก LINE |
| `line_links_mark(ids, status, article_id?, reason?)` | Task 2 | ปิดงาน used/skipped |
| `manifest_get(days)` | Task 1, 2 | baseline trend + dedupe ข้ามวัน |
| `news_put_article(...)` | Task 1, 2 | รับ article JSON |
| `news_put_report(...)` | Task 1, 2 | รับ html/pdf/png/json |
| `news_put_entities(payload)` | Task 1, 2 | cases/entities/relations → vault-build |
| `run_status_get(task)` | ทุก task | preflight / ALREADY_COMPLETE |
| `run_status_put(...)` | ทุก task | complete / partial / failed |
| `brain_search` / `brain_timeline` / `brain_upsert` | Task 3 | Second Brain |

## Auth

- Bearer token ระดับ `claude` (อ่าน+เขียน) ผ่าน env `NEWSHUB_TOKEN`
- ห้ามเปิด `/api/*` สาธารณะ — เฉพาะ `/line/webhook` + `/health`
