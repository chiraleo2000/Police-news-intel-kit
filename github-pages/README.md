# GitHub Pages — ข่าวตำรวจ (static)

## ลิงก์ใช้งาน (live)

| หน้า | URL |
| --- | --- |
| หน้าแรก (ช่วง 7 วัน) | https://chiraleo2000.github.io/Police-news-intel-kit/ |
| วันนี้ | https://chiraleo2000.github.io/Police-news-intel-kit/#/r/1 |
| 3 / 7 / 14 / 30 / 90 วัน | `…/#/r/3` · `…/#/r/7` · `…/#/r/14` · `…/#/r/30` · `…/#/r/90` |
| ทั้งหมด | https://chiraleo2000.github.io/Police-news-intel-kit/#/r/all |
| ดาวน์โหลด (ช่วงวัน) | https://chiraleo2000.github.io/Police-news-intel-kit/#/downloads/r/7 |
| โพสต์หนึ่งข่าว | `…/#/2026-10-22/<postId>` |

Repo: https://github.com/chiraleo2000/Police-news-intel-kit (public)  
Deploy: GitHub Actions → workflow `Deploy GitHub Pages` (โฟลเดอร์ `github-pages/`)

---

เว็บอ่านอย่างเดียว ดึง JSON จาก `data/` ไม่มี backend ใน repo นี้

**ต้นทางข้อมูล / rebuild:** workspace **`police-news-intel-private`** เป็นคน scrape, สร้าง `Document/`, อ่าน `vault/`, รัน `ops/rebuild-pages-feed.js` แล้ว sync/push เข้า `github-pages/` ที่นี่  
ตั้ง `GITHUB_PAGES_BASE_URL` ใน **private** `server/.env` (ไม่มี path นั้นใน public)

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

Route: `#/r/{1\|3\|7\|14\|30\|90\|all}` · `#/YYYY-MM-DD/<postId>` · `#/downloads/r/{range}`

## ดูบนเครื่อง

```bat
cd /d path\to\police-news-intel-kit
npx --yes serve github-pages
```

## ไฟล์ที่ private ซิงค์มา

- Task 1: `data/{DATE}_crime.json` (+ hotspots / alerts / trends / bd_leads) + PDF ใน `data/downloads/`
- Task 2 (LINE): `data/{DATE}_crime_line.json` (+ `*_line`) + PDF line
- `data/manifest.json` (prepend, add-only) รวม `downloads[]`
- `data/graph.json` / `data/graphs/*` สร้างใน private จาก vault แล้ว sync มา

## Optional RAG บนเครื่อง

แชทกราฟใช้ MCP/gateway/LM ผ่าน `ops/wake-tunnel.ps1` ที่ราก repo — ดู README ราก · ไม่เกี่ยวกับ LINE hub `:18080`
