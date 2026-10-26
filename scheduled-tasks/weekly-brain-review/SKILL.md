---
name: weekly-brain-review
schedule: "CRON_TZ=Asia/Bangkok 0 20 * * 0"
source: plugin/news-intel/skills/second-brain-update/SKILL.md
---

ทำตาม `plugin/news-intel/skills/second-brain-update/SKILL.md`

- ใช้เฉพาะ `brain_search` `brain_timeline` `brain_upsert` `run_status_put`
- ห้ามลบหรือรวม entity เอง ข้อเสนอรวมชื่อใส่ `brain_upsert(kind="merge_proposal", status="proposed")`
- โน้ตรายสัปดาห์ใช้ `brain_upsert(kind="weekly_note", week="YYYY-Www", body=...)`
- จบด้วย `run_status_put(task="brain-review", run_date=<วันอาทิตย์>, status="complete")`
