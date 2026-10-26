---
name: task-1-online
schedule: "CRON_TZ=Asia/Bangkok 1 8 * * *"
source: prompts/task-1-police-crime-news-pipeline.md
---

ใช้ไฟล์ `prompts/task-1-police-crime-news-pipeline.md` ทั้งไฟล์ (08:01)

การวิเคราะห์ข้อมูลกราฟอยู่ในรอบนี้ ไม่สร้าง task แยก และไม่มีรีวิววันอาทิตย์  
ทำเช็คลิสต์ในไฟล์ prompt ตามลำดับ: ทุกหัวข่าวในชุด, ดึงเอนทิตีที่ข่าวเอ่ยชื่อ, ป้ายไทย, `related_cases` ว่างเมื่อไม่แน่, rebuild กราฟ, ห้าม git push, ห้ามเขียนทับวันอื่น
