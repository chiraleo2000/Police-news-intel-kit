# Scheduled tasks — ข่าวตำรวจ

| # | ไฟล์ใน `prompts/` | เวลา (Asia/Bangkok) | ทำอะไร |
| --- | --- | --- | --- |
| 1 | `task-1-police-crime-news-pipeline.md` | ทุกวัน 06:00 | กวาดออนไลน์ registry แล้วเขียนโพสต์ v2 |
| 2 | `task-2-LINE-Message-Extract-crime-news.md` | ทุกวัน 06:40 | ดึงลิงก์จาก LINE continuous export ของวันนั้น |
| 3 | `plugin/news-intel/skills/second-brain-update/SKILL.md` | อาทิตย์ 20:00 | รีวิว Second Brain ด้วย `brain_search` / `brain_timeline` / `brain_upsert` |

ทั้ง Task 1 และ 2 ต้องค้น `brain_search` ก่อนใส่ `related_cases`  
โพสต์ยังแยกตามหัวข่าว สรุปเดิมอยู่บน แล้วตามด้วยมุมผู้บริหาร วิเคราะห์ และการ์ดข้อเท็จจริง  
PDF รายวันรวมจาก HTML ตามประเภทคดี ห้ามจัดบทตาม บช.

วิธีตั้ง: คัดลอกไฟล์ในโฟลเดอร์นี้ไปสร้าง Claude Scheduled Task แล้วอนุมัติอัตโนมัติ  
แก้ที่ `prompts/` แล้วให้ไฟล์ในโฟลเดอร์นี้ชี้ไฟล์เดียวกัน
