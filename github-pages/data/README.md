# `data/` — ไฟล์ที่ไปป์ไลน์คัดลอกเข้ามา

## ที่หน้า production อ่าน

| ไฟล์ | จำเป็น |
| --- | --- |
| `manifest.json` | ใช่ — รายการวันที่ที่มีสรุป |
| `{DATE}_crime.json` | ใช่ — ข่าว + KPI |
| `{DATE}_hotspots.json` หรือ `_hotspots.json` | ไม่บังคับ |
| `{DATE}_alerts.json` หรือ `_alerts.json` | ไม่บังคับ |
| `{DATE}_trends.json` หรือ `_trends.json` | ไม่บังคับ |

รูปแบบ `manifest.json`:

```json
{
  "generated_at": "2026-10-21T08:00:00+07:00",
  "days": [
    { "date": "2026-10-21", "articles_total": 12, "alerts": 3 }
  ]
}
```

`days` เรียงใหม่→เก่าก็ได้ หน้าเว็บจะ sort เอง

## ทดสอบ UI ด้วยตัวอย่าง

```bat
copy data\sample\2026-10-21_*.json data\
```

แล้วแก้ `manifest.json`:

```json
{
  "generated_at": "2026-10-21T12:00:00+07:00",
  "days": [{ "date": "2026-10-21", "articles_total": 2, "alerts": 1 }]
}
```

เปิดด้วย static server (อย่า double-click `index.html` เพราะ `fetch` โดน CORS):

```bat
npx --yes serve github-pages
```
