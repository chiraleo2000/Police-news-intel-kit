---
name: news-enrich
description: ใช้หลังรวม (merge) บทความรายวันแล้ว เพื่อจัดกลุ่มย่อย สร้าง hashtag วิเคราะห์ผลกระทบ/นโยบายที่อาจเกิดขึ้น และสร้าง payload cases/entities/relations สำหรับ news_put_entities (Obsidian vault)
---

# news-enrich

ทำหลัง merge และก่อน publish รายงาน ใช้ได้ทั้งข่าวอาชญากรรมและข่าวกฎหมายเทคโนโลยี

## 0) บังคับค้นก่อนโยง (API ภายในชื่อ brain, แท็บที่ผู้ใช้เห็นชื่อ ข้อมูลกราฟ)
เรียก `brain_search` / `GET /v1/brain/search` ก่อนใส่ `related_cases`  
งาน Task 1/2 ใช้เช็คลิสต์ใน `prompts/` ไม่ใช้ป้าย `related_to` `follow_up_of` หรือ `mentions`  
โยงข่าวอื่นได้เมื่อเป็นเหตุการณ์เดียวกันหรือการติดตามผลจริง ป้าย `เกี่ยวข้องกับ` หรือ `ติดตามจาก` ถ้าไม่พบหรือไม่แน่ให้ลิสต์ว่าง ห้ามโยงแค่เพราะประเภทกับจังหวัดตรงกัน

## 1) จัดกลุ่มย่อย (sub-groups)
- ภายในแต่ละ `category_label` ให้แบ่งกลุ่มย่อย 1–4 กลุ่มตามรูปแบบที่ซ้ำกัน (เช่น ไซเบอร์ → "แอบอ้างเจ้าหน้าที่รัฐ", "หลอกลงทุนคริปโต")
  ข่าวหนึ่งเรื่องอยู่ได้ **1 กลุ่มย่อยหลัก**; กลุ่มย่อยที่มีข่าวเดียวให้รวมเข้า "อื่น ๆ ในหมวด"
- ใส่ `single_group` = ชื่อกลุ่มย่อยหลักของข่าวนั้น (ใช้เป็นแกนของ infographic และของ Bases)

## 2) Hashtag
- 3–8 แท็กต่อข่าว รูปแบบ `#ภาษาไทยไม่มีเว้นวรรค` เช่น `#คอลเซ็นเตอร์ #บัญชีม้า #อายัดบัญชี`
- ใช้คำจาก Canonical MO / ชื่อหน่วยงาน / ประเภทคดี ก่อนสร้างคำใหม่ (ถ้าสร้างใหม่ให้ใส่ใน `new_tag_candidates`)
- ห้ามใช้ชื่อบุคคลเป็นแท็ก

## 3) วิเคราะห์ผลกระทบ/นโยบายที่อาจเกิดขึ้น (`implications`)
- ใช้กับข่าวที่ `severity >= medium` หรือข่าวกฎหมาย/นโยบาย เท่านั้น ที่เหลือใส่ `[]`
- แต่ละข้อ: `{"statement": "...", "basis": "ข้อเท็จจริงในข่าวที่รองรับ (article_id)", "confidence": "low|medium|high", "horizon": "สัปดาห์|เดือน|ไตรมาส"}`
- ต้องเป็น **การวิเคราะห์** ไม่ใช่ข้อเท็จจริง: ใช้ถ้อยคำ "อาจ/มีแนวโน้ม" และห้ามทำนายตัวบุคคลหรือคดีรายบุคคล
- ถ้าไม่มี basis ในข่าวอย่างน้อย 1 ข้อ ห้ามเขียนข้อนั้น

## 4) สร้าง payload `news_put_entities`
```json
{
  "date": "YYYY-MM-DD",
  "source_task": "crime-news | gov-tech-law",
  "cases": [{
    "case_id": "YYYY-MM-DD-<code>-NNN",
    "title": "", "summary": "ไม่เกิน 80 คำ สำนวนตัวเอง",
    "crime_type": "ชื่อไทยเต็ม", "secondary": [],
    "single_group": "", "hashtags": [],
    "severity": "high|medium|low", "stage": "", "verification": "",
    "provinces": [], "units": [], "agencies": [], "mo": [], "laws": [],
    "article_ids": [], "source_url": "", "stats": {}, "implications": []
  }],
  "entities": [{"type": "unit|agency|law|mo|province|crime_type|region|org", "name": "", "aliases": [], "parent": null}],
  "relations": [{"from": "case:<case_id>", "rel": "handled_by|about|uses_mo|occurred_in|cites_law|issued_by|follow_up_of", "to": "entity:<type>:<name>|case:<case_id>", "evidence": "<article_id>"}]
}
```

## กฎชื่อ (canonical)
- ก่อนสร้าง entity ใหม่ เรียก `brain_search(query, type)` ถ้ามีชื่อ/alias ตรงกัน ให้ใช้ชื่อเดิม **ห้ามสร้างซ้ำ**
- ชื่อ entity ต้องเป็นชื่อมาตรฐานที่ไม่มีอักขระต้องห้ามของชื่อไฟล์ (`/ \ : * ? " < > |`) เช่น "บก.ปคม." แทน "บก.ปคม./ATPD"; ชื่อเต็มอื่นใส่ใน `aliases`
- จังหวัด: ชื่อเต็มทางการ ตรวจกับรายการ 77 จังหวัดของ server; ไม่ทราบจังหวัด → ไม่สร้าง relation `occurred_in`
- รอบ Task 1/2 สร้างโหนดบุคคลตามเช็คลิสต์ใน `prompts/` (ผู้ต้องหาได้เมื่อแหล่งทางการแถลงชื่อ และไม่ใช่คดีเพศ/ค้ามนุษย์/เด็ก/ความรุนแรงในครอบครัว) ห้ามเลขบัญชีและตัวตนผู้เสียหาย
- ใช้กฎจริยธรรมของ `police-crime-news-pipeline` กับ `summary`, `implications` และทุกฟิลด์ข้อความ (ไม่ตัดสินผู้ต้องหา ไม่ระบุตัวตนเด็ก/ผู้เสียหายคดีเพศ-ค้ามนุษย์)

## ความจำกัดจำนวน (กันกราฟรก)
- ต่อ 1 case: `units` ≤3, `mo` ≤3, `laws` ≤3, `provinces` ≤3
- ห้ามสร้าง relation ระหว่าง case ที่ไม่มีหลักฐานเชื่อมกัน รอบ Task 1/2 ใช้ป้าย `ติดตามจาก` เมื่อข่าวชี้ว่าเป็นความคืบหน้าของคดีเดิม และ `brain_search` พบ case เดิม ห้ามโยงแค่ประเภทกับจังหวัดตรงกัน
