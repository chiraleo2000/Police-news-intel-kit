# GitHub Pages — ข่าวตำรวจ (static)

เว็บอ่านอย่างเดียว ดึง JSON จาก `data/` ไม่มี backend  
ไปป์ไลน์ (Claude / news-hub) เป็นคน **copy ไฟล์เข้า `data/`** แล้วคนหรือ CI เป็นคน `git push` (skill ห้ามให้ Claude push เอง)

## โครง

```
github-pages/
  index.html
  css/site.css
  js/app.js
  js/format.js
  data/
    manifest.json          ← รายการวันที่ (ตอนนี้ days: [])
    sample/                ← JSON ตัวอย่างสำหรับทดสอบ UI
    {DATE}_crime.json      ← มาทีหลังจากไปป์ไลน์
    {DATE}_hotspots.json
    {DATE}_alerts.json
    {DATE}_trends.json
```

Route: `#/` · `#/YYYY-MM-DD` · `#/YYYY-MM-DD/<postId>`

## ดูบนเครื่อง

```bat
cd /d D:\ข่าวตำรวจ
npx --yes serve github-pages
```

เปิด URL ที่พิมพ์ออกมา ถ้ายังไม่มี JSON จะขึ้นหน้า “ยังไม่มีสรุปข่าวในคลัง”

## เปิด GitHub Pages

1. Push โฟลเดอร์นี้เป็น root ของ repo แยก หรือตั้ง Pages จาก `/github-pages` ของ monorepo
2. Settings → Pages → Deploy from branch → โฟลเดอร์ `/` (ถ้าแยก repo) หรือ `/github-pages`
3. หลังมีไฟล์ข่าว: อัปเดต `data/` แล้ว push

## เชื่อมกับ skill

`police-crime-news-pipeline` / Task prompts ขั้น publish คัดลอกไป:

- Task 1: `github-pages/data/{DATE}_crime.json` (+ hotspots / alerts / trends / bd_leads)
- Task 2 (LINE): `github-pages/data/{DATE}_crime_line.json` (+ `*_line` companions)
- อัปเดต `github-pages/data/manifest.json` (prepend, add-only)

เปิดดู: `{BASE}/#/{DATE}` หรือโพสต์ `{BASE}/#/{DATE}/{postId}`  
ตั้ง `GITHUB_PAGES_BASE_URL` ใน `server/.env` เพื่อให้ Completion Report พิมพ์ลิงก์เต็ม
