# Obsidian vault → GitHub Pages (ข้อมูลกราฟ)

## Roles

| Layer | Path | Published? |
| --- | --- | --- |
| Knowledge store (edit / graph in Obsidian) | `vault/` | No (`gitignore`) |
| Web graph for Pages | `github-pages/data/graph.json` | Yes |
| Per-story ego subgraph | `github-pages/data/graphs/{case_id}.svg` | Yes |
| News posts | `github-pages/data/*_crime*.json` | Yes |

Open Obsidian on the folder `police-news-intel-kit/vault`. Claude Task 1/2 does **not** edit notes by hand. It calls news-hub `GET /v1/brain/search` and `GET /v1/brain/timeline` (retrieval). `vault-build` writes notes. GitHub Pages only shows a snapshot in `graph.json` after `node ops/rebuild-pages-feed.js` — the site cannot query Obsidian live.

Edges carry a `label` (`arrested_by`, `related_to`, `mentions`, …). Dates, crime type, bureau, area, and status stay properties on the case node (also shown on the canvas when zoomed/selected). Nodes are cases, units, announced commanders, and named networks.

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

- Always link cases to `[[crime type]]` and unit/place entity notes.
- Prefer stable note titles so wikilinks resolve (avoid renaming without updating links).
- Unresolved links appear in red as `unresolved:…` nodes — fix the note name or link text.
