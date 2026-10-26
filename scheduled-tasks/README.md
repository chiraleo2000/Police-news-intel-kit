# Scheduled tasks — มีแค่ 2 อัน

| # | ไฟล์ | เวลา (Asia/Bangkok) | ทำอะไร |
| --- | --- | --- | --- |
| 1 | `prompts/task-1-police-crime-news-pipeline.md` | ทุกวัน 08:01 | กวาดออนไลน์ แล้ววิเคราะห์ต่อหัวข่าวในรอบเดียวกัน |
| 2 | `prompts/task-2-LINE-Message-Extract-crime-news.md` | ทุกวัน 08:30 | ดึงลิงก์ LINE ของวันนั้น แล้ววิเคราะห์ต่อหัวข่าวในรอบเดียวกัน |

ไม่มีงานรีวิว Second Brain แยก การค้น `brain_search` การโยงคดี และชั้นวิเคราะห์อยู่ใน Task 1 และ Task 2  
PDF รายวันรวมจาก HTML ตามประเภทคดี ห้ามจัดบทตาม บช.

วิธีตั้ง: คัดลอกไฟล์ prompt ทั้งไฟล์ไปวางใน Claude Scheduled Task แล้วอนุมัติอัตโนมัติ
