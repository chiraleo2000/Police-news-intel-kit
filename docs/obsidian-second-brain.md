# Obsidian Second Brain → GitHub Pages

## Roles

| Layer | Path | Published? |
| --- | --- | --- |
| Second Brain (edit / graph in Obsidian) | `vault/` | No (`gitignore`) |
| Web graph for Pages | `github-pages/data/graph.json` | Yes |
| News posts | `github-pages/data/*_crime*.json` | Yes |

Open Obsidian on the folder `police-news-intel-kit/vault`. Claude Task 1/2 does **not** edit notes by hand. It calls news-hub `GET /v1/brain/search` and `GET /v1/brain/timeline` (retrieval). `vault-build` writes notes. GitHub Pages only shows a snapshot in `graph.json` after `node ops/rebuild-pages-feed.js` — the site cannot query Obsidian live.

Edges carry a `label` (`arrested_by`, `related_to`, `mentions`, …). Dates, crime type, and area stay properties on the case. Nodes are cases, units, announced commanders, and named networks.

## Build & publish

```bash
node ops/build-obsidian-graph.js
# or (also rebuilds feed + downloads)
node ops/rebuild-pages-feed.js
```

Scheduled `ops/git-publish-pages.ps1` already runs `rebuild-pages-feed.js`, so the Brain tab updates on the 10:00 / 14:00 push.

## Pages UI

- Tab **Second Brain** → `#/brain`
- Node deep-link → `#/brain/{nodeId}` (e.g. `20_Cases/20261022-drug-phuket-spiderweb-11`)

## Tips for a denser graph

- Always link cases to `[[crime type]]` and unit/place entity notes.
- Prefer stable note titles so wikilinks resolve (avoid renaming without updating links).
- Unresolved links appear in red as `unresolved:…` nodes — fix the note name or link text.
