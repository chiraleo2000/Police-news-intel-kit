# `data/` — โครงสร้างที่หน้าเว็บอ่านจริง

หน้า GitHub Pages โหลดตามลำดับนี้:

1. **`feed.json`** (แนะนำ) — รวมทุกโพสต์พร้อม `_date` → แสดงข่าวทันที  
2. **`manifest.json`** — รายการวัน + ชื่อไฟล์รายวัน + downloads  
3. **`{DATE}_crime.json`** — fallback ถ้ารายวันยังไม่มีใน feed  

## ไฟล์บังคับให้เว็บมีข่าว

| ไฟล์ | บทบาท |
| --- | --- |
| `feed.json` | รายการข่าวรวม (UX หลัก) |
| `manifest.json` | ช่วงวัน / ดาวน์โหลด / ไฟล์ประกอบ |
| `{DATE}_crime.json` | แหล่งความจริงรายวัน + KPI |
| `graph.json` | ข้อมูลกราฟ (แท็บ ข้อมูลกราฟ) — สร้างใน private จาก vault แล้ว sync มา |
| `graphs/{case_id}.svg` | Ego subgraph ต่อหัวข่าว (แสดงในหน้ารายโพสต์ + ฝัง PDF/MD) |
| `graphs/{case_id}.json` | สรุป relations ของคดีนั้น |

ทางเลือก: `{DATE}_hotspots.json`, `{DATE}_alerts.json`

`graph.json` + `graphs/*` + feed/downloads ถูกสร้างและอัปเดตใน workspace **`police-news-intel-private`** (`ops/rebuild-pages-feed.js`, build graph จาก vault) แล้ว sync เข้าโฟลเดอร์นี้ — **ไม่มี** `ops/rebuild-pages-feed.js`, `vault/`, หรือ `Document/` ใน public kit

## ดาวน์โหลด (แท็บ PDF)

วางไฟล์สรุปรายวันที่นี่ (ไม่ใช่ JSON) — โดยปกติ private เป็นคน copy มาให้:

| ไฟล์ | ใช้ทำอะไร |
| --- | --- |
| `downloads/{DATE}_crime.pdf` | **PDF สรุปข่าวของวันนั้น** (หลัก) |
| `downloads/{DATE}_infographic.png` | Infographic |
| `downloads/{DATE}_crime_line.pdf` | PDF จาก Task 2 (LINE) |

หลังไปป์ไลน์สร้างไฟล์ใน private `Document/{DATE}_Crime/` ให้รันที่ **private**:

```bat
node ops/rebuild-pages-feed.js
```

จากนั้น sync/publish เข้า public `github-pages/data/`

## `manifest.json`

```json
{
  "generated_at": "2026-10-22T08:40:00+07:00",
  "schema_version": 1,
  "default_range": "all",
  "days": [
    {
      "date": "2026-10-22",
      "status": "published",
      "total": 7,
      "crime_file": "2026-10-22_crime.json",
      "downloads": [
        { "label": "JSON ข่าวรายวัน", "path": "2026-10-22_crime.json", "kind": "json" }
      ]
    }
  ]
}
```

## `feed.json`

```json
{
  "generated_at": "2026-10-22T08:40:00+07:00",
  "schema_version": 1,
  "days": [{ "date": "2026-10-22", "total": 7, "crime_file": "2026-10-22_crime.json" }],
  "posts": [
    {
      "id": "…",
      "title": "…",
      "topic": "ชื่อประเภทภาษาไทย",
      "agency": "…",
      "content": "…",
      "source_url": "https://…",
      "corroborating_sources": [{ "name": "…", "url": "https://…" }],
      "tags": ["…"],
      "_date": "2026-10-22"
    }
  ]
}
```

**ทุกโพสต์ต้องมี `_date` (YYYY-MM-DD)** ไม่งั้นช่วงวันจะกรองไม่เจอ

## อัปเดต feed / graph (บนเครื่อง)

รัน rebuild ใน **`police-news-intel-private`** แล้ว publish มาที่นี่ — ไม่รันสคริปต์ rebuild จาก public kit
