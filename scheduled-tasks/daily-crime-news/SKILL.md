---
name: task-2-line
schedule: "CRON_TZ=Asia/Bangkok 40 6 * * *"
source: prompts/task-2-LINE-Message-Extract-crime-news.md
---

ทำตาม `prompts/task-2-LINE-Message-Extract-crime-news.md` ทั้งไฟล์

บังคับเพิ่ม:
- อ่านลิงก์จาก LINE continuous export ของ `RUN_DATE` เท่านั้น ไม่กวาด registry
- ก่อน `related_cases` เรียก MCP `brain_search` หาไม่เจอให้ `[]` ห้ามเดา
- โครงโพสต์ v2 เหมือน Task 1 และห้ามจัด PDF ตาม บช.
