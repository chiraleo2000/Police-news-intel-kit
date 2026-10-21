# Scheduled tasks — ข่าวตำรวจ (มีแค่ 2 อัน)

| # | ไฟล์ใน `prompts/` | เวลา | ทำอะไร |
| --- | --- | --- | --- |
| 1 | `task-1-police-crime-news-pipeline.md` | 06:00 | กวาด**ออนไลน์** registry 55 แหล่ง |
| 2 | `task-2-LINE-Message-Extract-crime-news.md` | 06:40 | ดึงลิงก์จาก **Excel LINE** (export 05:00) |

ทั้งคู่มีการวิเคราะห์ (Second Brain + BD×งบ 2570) ในรอบเดียวกัน  
**ไม่มี task-3**

วิธีตั้ง: คัดลอกทั้งไฟล์ prompt ไปวางใน Claude Scheduled Task + อนุมัติอัตโนมัติ
