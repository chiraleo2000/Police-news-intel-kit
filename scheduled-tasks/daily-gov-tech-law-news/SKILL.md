---
name: task-1-online
schedule: "CRON_TZ=Asia/Bangkok 0 6 * * *"
source: prompts/task-1-police-crime-news-pipeline.md
---

ทำตาม `prompts/task-1-police-crime-news-pipeline.md` ทั้งไฟล์

บังคับเพิ่ม:
- ก่อน `related_cases` เรียก MCP `brain_search` และ `brain_timeline` หาไม่เจอให้ `[]` ห้ามเดา
- แต่ละโพสต์คง `content` เดิม แล้วเติม `exec_blurb` `analysis_notes` `primary_bureau` `area` `status_th` `gang_or_group` `references` `format_version: 2`
- ห้ามจัด PDF/HTML เป็นบทตาม บช. PDF รวมจาก HTML ตามประเภทคดี
