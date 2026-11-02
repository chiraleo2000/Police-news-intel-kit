# ข่าวตำรวจ

ข่าวอาชญากรรมรายวัน

เว็บ: https://chiraleo2000.github.io/Police-news-intel-kit/

| มุมมอง | ที่อยู่ |
| --- | --- |
| ข่าวทั้งหมด | `#/r/all` |
| ข่าวย้อนหลัง | `#/r/1` `#/r/3` `#/r/7` `#/r/14` `#/r/30` `#/r/90` |
| ข่าวหนึ่งเรื่อง | `#/{วันที่}/{รหัสเรื่อง}` |
| ข้อมูลกราฟ | `#/brain` |
| ดาวน์โหลด | `#/downloads/r/all` |

---

## สองบทบาทของ repo นี้

### 1) Static GitHub Pages (หลัก)

โฟลเดอร์ `github-pages/` คือเว็บอ่านอย่างเดียว ซิงค์มาจาก workspace ผลิตข่าว **`police-news-intel-private`** (scrape, vault, Document, rebuild feed, LINE hub `:18080`)

- คน/CI ใน private เป็นคน publish เข้า repo นี้
- ไม่มี `prompts/`, `server/`, `vault/`, หรือสคริปต์ rebuild ใน public — ไปป์ไลน์อยู่ที่ private เท่านั้น

### 2) Optional local RAG (เสริม)

ถ้าต้องการแชทจากกราฟบนเครื่อง ให้รัน tunnel ของ kit นี้ผ่าน `ops/wake-tunnel.ps1` (อ่าน `ops/tunnel.config.json`):

| บริการ | พอร์ต |
| --- | --- |
| MCP | `:8787` |
| Gateway | `:8790` |
| LM Studio | `:1234` |

จากนั้นสคริปต์เขียน `github-pages/data/tunnel.json` ให้หน้า Pages เรียก chat ได้

**แยกจาก LINE / tor:** wake-tunnel จัดการเฉพาะ tunnel ของ RAG (`:8790`) — ไม่หยุด ngrok ทั้งเครื่อง, ไม่แตะพอร์ต `:18080`, ไม่แตะ `ngrok-line.log`, ไม่ใช้โดเมน `fresh-currently-elk.ngrok-free.app`, และไม่แก้ไฟล์ใน `police-news-intel-private`

ดูรายละเอียดหน้าเว็บใน [`github-pages/README.md`](github-pages/README.md)
