# GitHub Pages — ข่าวตำรวจ (static)

## ลิงก์ใช้งาน (live)

| หน้า | URL |
| --- | --- |
| หน้าแรก | https://chiraleo2000.github.io/Police-news-intel-kit/ |
| ข่าวรายวัน | https://chiraleo2000.github.io/Police-news-intel-kit/#/YYYY-MM-DD |
| ตัวอย่าง (22 ต.ค. 69) | https://chiraleo2000.github.io/Police-news-intel-kit/#/2026-10-22 |
| ดาวน์โหลด PDF | https://chiraleo2000.github.io/Police-news-intel-kit/#/downloads/2026-10-22 |
| โพสต์หนึ่งข่าว | `…/#/2026-10-22/<postId>` |

Repo: https://github.com/chiraleo2000/Police-news-intel-kit (public)  
Deploy: GitHub Actions → workflow `Deploy GitHub Pages` (โฟลเดอร์ `github-pages/`)

ตั้ง `GITHUB_PAGES_BASE_URL=https://chiraleo2000.github.io/Police-news-intel-kit` ใน `server/.env`  
ให้ Completion Report ของ Task 1/2 พิมพ์ลิงก์เต็มอัตโนมัติ

---

เว็บอ่านอย่างเดียว ดึง JSON จาก `data/` ไม่มี backend  
ไปป์ไลน์ (Claude / news-hub) **copy ไฟล์เข้า `data/`** แล้วคนหรือ CI เป็นคน `git push` (skill ห้ามให้ Claude push เอง)

## โครง

```
github-pages/
  index.html
  css/site.css
  js/app.js
  js/format.js
  data/
    manifest.json
    sample/
    downloads/             ← PDF / PNG รายวัน
    {DATE}_crime.json
    {DATE}_hotspots.json
    {DATE}_alerts.json
    {DATE}_trends.json
```

Route: `#/` · `#/YYYY-MM-DD` · `#/YYYY-MM-DD/<postId>` · `#/downloads` · `#/downloads/YYYY-MM-DD`

## ดูบนเครื่อง

```bat
cd /d path\to\police-news-intel-kit
npx --yes serve github-pages
```

## เชื่อมกับ skill

- Task 1: `github-pages/data/{DATE}_crime.json` (+ hotspots / alerts / trends / bd_leads) + PDF ใน `data/downloads/`
- Task 2 (LINE): `github-pages/data/{DATE}_crime_line.json` (+ `*_line`) + PDF line
- อัปเดต `github-pages/data/manifest.json` (prepend, add-only) รวม `downloads[]`
