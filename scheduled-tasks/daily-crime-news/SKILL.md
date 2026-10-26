---
name: task-2-line
schedule: "CRON_TZ=Asia/Bangkok 30 8 * * *"
source: prompts/task-2-LINE-Message-Extract-crime-news.md
---

ใช้ไฟล์ `prompts/task-2-LINE-Message-Extract-crime-news.md` ทั้งไฟล์ (08:30)

การวิเคราะห์ข้อมูลกราฟอยู่ในรอบนี้ ไม่สร้าง task แยก และไม่มีรีวิววันอาทิตย์  
ทำเช็คลิสต์ในไฟล์ prompt ตามลำดับกับชุด NEW และ DUP_EVENT ที่แตะ: ดึงเอนทิตี, ป้ายไทย, `related_cases` ว่างเมื่อไม่แน่, rebuild กราฟ, ห้าม git push, ห้ามเขียนทับวันอื่น
