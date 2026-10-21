# news-hub server (skeleton)

สถานะ: **โครงเปล่า + สเปก** — ยังไม่ใช่โค้ดที่รันได้  
สัญญา API / DB / MCP / LINE webhook อยู่ที่ [`docs/02-news-hub-spec.md`](../docs/02-news-hub-spec.md)

## บทบาท

```
LINE webhook ──▶ HTTP server ──▶ SQLite (แหล่งความจริง)
                      │
                      ├─ REST /api/*  ◀── mcp-stdio.js (MCP news-hub)
                      ├─ jobs/export-links (05:00) → exports/*.xlsx + .json
                      ├─ jobs/vault-build → Obsidian vault
                      ├─ jobs/healthcheck (08:15)
                      └─ jobs/backup (23:30)
```

Claude **ไม่ถือ state** — อ่าน/เขียนผ่าน MCP tools เท่านั้น

## โครงสร้างที่จะเติมโค้ด

```
server/
  package.json
  tsconfig.json
  .env.example
  src/
    index.ts          # Fastify/Express: /line/webhook + /api/* + /health
    mcp-stdio.ts      # MCP shim → REST
    db/               # SQLite schema + migrations
    line/             # signature verify, URL canonicalize, SSRF guard
    api/              # route handlers
    vault/            # vault-build writers
    jobs/
      export-links.ts
      vault-build.ts
      healthcheck.ts
      backup.ts
  config/
    registry/crime.json   # 55 แหล่ง (แปลงจาก skill)
    registry/gov.json     # 109 แหล่ง
    provinces.json
```

## MCP tools ที่ต้องมี

| Tool | หน้าที่ |
| --- | --- |
| `registry_get` | registry crime/gov |
| `line_links_get` / `line_links_mark` | ลิงก์ LINE |
| `manifest_get` | baseline 7 วัน |
| `news_put_article` / `news_put_report` / `news_put_entities` | รับผลจาก Claude |
| `run_status_get` / `run_status_put` | สถานะรอบ |
| `brain_search` / `brain_timeline` / `brain_upsert` | Second Brain |

## ขั้นถัดไป

1. Implement ตาม docs/02 (TypeScript + Node ≥22)
2. `npm run build` → `dist/index.js` + `dist/mcp-stdio.js`
3. คัดลอกไป `%NEWSINTEL_HOME%\server` แล้วรัน `ops\setup-windows.bat`
