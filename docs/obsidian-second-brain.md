# Obsidian vault → GitHub Pages (ข้อมูลกราฟ)

## Roles

| Layer | Path | Published? |
| --- | --- | --- |
| Knowledge store (edit / graph in Obsidian) | `vault/` | No (`gitignore`) |
| Web graph for Pages | `github-pages/data/graph.json` | Yes |
| Per-story ego subgraph | `github-pages/data/graphs/{case_id}.svg` | Yes |
| News posts | `github-pages/data/*_crime*.json` | Yes |

Open Obsidian on the folder `police-news-intel-kit/vault`. Task 1 (08:01) and Task 2 (08:30) search with `GET /v1/brain/search` and `GET /v1/brain/timeline`, then write the day’s working-set notes (`generated: true`) and JSON. There is no Sunday graph-review task. GitHub Pages only shows a snapshot in `graph.json` after `node ops/rebuild-pages-feed.js`.

Edges that are kept use a Thai `label` from case frontmatter `rel_units` / `rel_people` / `rel_projects` / `rel_cases` (`สืบสวนโดย`, `จับโดย`, `สั่งการโดย`, `แจ้งโดย`, `เกิดที่`, `เป้าหมายเครือข่าย`, `เกี่ยวข้องกับบุคคล`, `ผู้ต้องหา`, `บัญชี`, and between stories only `เกี่ยวข้องกับ` or `ติดตามจาก`). Do not keep an unlabeled edge or a `mentions` edge. `bureau`, `area`, `crime_type`, and `status_th` stay properties on the case node. `gang_or_group` is set on the same note when the article names a real group. Nodes are only entities the article actually names.

## Build & publish

```bash
node ops/build-obsidian-graph.js
node ops/build-case-ego-graphs.js
# or (also rebuilds feed + downloads + ego SVGs)
node ops/rebuild-pages-feed.js
```

Scheduled `ops/git-publish-pages.ps1` already runs `rebuild-pages-feed.js`, so the **ข้อมูลกราฟ** tab and per-story SVGs update on the publish push.

## Pages UI

- Tab **ข้อมูลกราฟ** → `#/brain`
- Node deep-link → `#/brain/{nodeId}` (e.g. `20_Cases/20261022-drug-phuket-spiderweb-11`)
- Post detail → inline ego subgraph + relation list (from `graph.json` / `data/graphs/{case_id}.svg`)

## Tips for a denser graph

- Put crime type on the case field `crime_type`. Link a unit, place, person, or network only with a Thai `rel_*` row, not a bare wikilink.
- Prefer stable note titles so links resolve (avoid renaming without updating `rel_*` targets).
- Unresolved links appear in red as `unresolved:…` nodes — fix the note name or the `target` text.
