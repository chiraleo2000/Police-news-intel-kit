---
name: gov-tech-law-news
description: >
  กวาดข่าวภาครัฐ โฟกัส "กฎหมาย/นโยบายเทคโนโลยี" (ดิจิทัล PDPA AI ไซเบอร์ สินทรัพย์ดิจิทัล e-service ฯลฯ)
  ฐานจาก gov-news-pipeline-combined v1.0 ในรอบเดียว (scrape + publish) เก็บ state ที่ news-hub
trigger:
  - "กวาดข่าวกฎหมายเทคโนโลยี"
  - "กวาดข่าวภาครัฐ"
  - "run gov tech law news"
---
# SKILL: gov-news-pipeline-combined v1.0

Merges **gov-news-master-pipeline v11.0** (scrape) and **gov-news-publisher v8** (publish)
into a single run so article files don't need a second invocation to be read back.

## Run params
`RUN_DATE` / `TARGET_DATE` = today, Asia/Bangkok. Window = 24h before RUN_DATE.

## Global rules (apply everywhere)
- ⛔ Never run `git add` / `git commit` / `git push`, and never write a deploy/push script. Copying finished files into a local `github-pages/data/` folder is allowed (it's just a file copy); actually publishing that repo is a separate task, not run here.
- Fetch order: **official** `.go.th`/`.or.th` URL (read the full article in `rendered` mode before any summary or analysis; do not process a `truncated` lead or the first 300 words) → Tier-1 aggregator (list below) → social media is **reference only, never fetched** (store the Facebook/social URL if known, don't visit it). Caps: ≤2 `web_search`, ≤12 `web_fetch` per batch. Never re-fetch a URL already used; skip an agency with nothing new and report `no_news_today`.
- Keep only items published inside the 24h window; if no date is visible, keep only if it's top-3 on a "latest" listing page, else skip.
- `summary_1`: 80–150 Thai words, single paragraph, no bullets/headers. `source.url` must be the article permalink, never a homepage/listing page. A "pass" = HTTP 200 + title + the full article (at least 300 characters). The 300-character floor does not mean the opening is enough to process.
- `bd_insights` on every article: if the news has real economic/policy/innovation significance → `opportunity`, `actions_sme` (2), `actions_si` (2), `urgency`; otherwise `opportunity: "N/A"`, `urgency: "low"`.
- Same-day rerun: dedupe by `source.url` and by title similarity ≥90%. **Add-only** — never delete/overwrite existing articles or manifest entries. Before reporting "completed," re-scan the target-date folder and remove any duplicate you just created (keep the older one).
- PDF generation is mandatory — never report it as skipped. Try in order: weasyprint → playwright → wkhtmltopdf → headless chrome/edge `--print-to-pdf`. PDF must embed the THSarabun font (Regular/Bold/Italic/Bold-Italic) so Thai text doesn't render as boxes.

## Pipeline — one run, 8 steps

**Scrape**
1. Batch A — highest-priority agencies (30, see registry) → `News/Articles/{Parent}/{Agency}/{DATE}/{Slug}/`
2. Batch B — mid-priority agencies + state/private media + parties (50)
3. Batch C — supplementary agencies, open data, procurement, remaining media/parties (29)

   Every article gets both `article.json` (schema below) and `article.md`.

**Publish (same run, immediately after)**

4. Glob `News/Articles/**/{TARGET_DATE}/**/article.json`, keep `fetch.status == "pass"`.
5. Build `Document/{DATE}_News/{DATE}_news.json` (GitHub-Pages-ready `posts` array, schema below), `_index.json` (manifest + stats), `_by_agency.json` (grouped), `_bd_summary.json` (BD opportunities rollup).
6. Copy THSarabun `.ttf` files into `Document/{DATE}_News/fonts/`; build `{DATE}_news.html` (Gov Briefing style, `@font-face` → `./fonts/`); render `{DATE}_news.pdf` from it.
7. Update `Document/manifest.json` (prepend, add-only); mark each article's `meta.status = "published"`. Optionally copy `{DATE}_news.json` + `manifest.json` into `github-pages/data/` (file copy only).
8. Verify all 8 outputs exist and are non-empty (json parses, html >10KB, pdf >0 bytes), then print the Completion Report. **Stop — no git push.**

## article.json (per-article, from scrape)
```json
{
  "article_id": "", "agency": {"parent": "", "name": "", "registry_key": "", "official_url": ""},
  "source": {"url": "", "type": "official|aggregator", "fetch_priority_used": "1_official|2_aggregator"},
  "fetch": {"status": "pass|fail", "http_status": 200, "fetched_at": "", "fetch_mode": "rendered"},
  "meta": {"published_at": "", "target_date": "", "within_24h": true, "status": "scraped|published", "batch": "A|B|C", "category_label": "", "news_type": "", "tags": []},
  "content": {"title": "", "slug": "", "summary_1": "", "language": "th"},
  "bd_insights": {"opportunity": "", "actions_sme": ["", ""], "actions_si": ["", ""], "urgency": "high|medium|low", "related_sectors": [], "tender_potential": false},
  "social_media": {"agency_facebook": ""}
}
```

## {DATE}_news.json (publish artifact, GitHub-Pages schema)
```json
{
  "date": "", "generated_at": "",
  "stats": {"total": 0, "direct": 0, "indirect": 0, "priority_A": 0, "priority_B": 0, "priority_C": 0},
  "posts": [{"id": "", "slug": "", "title": "", "topic": "ชื่อหมวดหมู่ภาษาไทยเต็ม", "agency": "Parent > Name", "origin": "direct|indirect", "priority": "A|B|C", "urgency": "", "content": "≥350 คำ ภาษาไทย เนื้อหาเต็ม (ห้ามมี field summary แยก)", "source_url": "", "bd_opportunity": "", "tags": [], "category_label": "", "published_at": ""}]
}
```
Field mapping `post ← article`: `id←article_id`, `slug/title←content.*`, `topic/category_label←meta.category_label` (Thai name only, never an English code), `agency←agency.parent + " > " + agency.name`, `origin←source.origin`, `priority←meta.priority`, `urgency/bd_opportunity←bd_insights.*`, `content←content.summary_1` expanded to ≥350 words, `source_url←source.url`, `tags←meta.tags`, `published_at←meta.published_at`.

## Document output tree
```
Document/{DATE}_News/
  {DATE}_news.{json,html,pdf}
  _index.json, _by_agency.json, _bd_summary.json
  fonts/THSarabun{,.Bold,.Italic,.BoldItalic}.ttf
Document/manifest.json                    (prepend, add-only)
github-pages/data/{DATE}_news.json, manifest.json   (copy and update for push)
```

## Completion Report
```json
{
  "run_date": "", "target_date": "", "pipeline": "gov-news-combined-1.0",
  "batches": {"A": {"attempted": 30, "created": 0}, "B": {"attempted": 50, "created": 0}, "C": {"attempted": 29, "created": 0}},
  "articles_total": 0, "articles_skipped_duplicate": 0, "skipped_older_than_24h": 0,
  "official_fetch_success": 0, "aggregator_fallback_used": 0,
  "files_created": ["{DATE}_news.json", "{DATE}_news.html", "{DATE}_news.pdf", "_index.json", "_by_agency.json", "_bd_summary.json", "fonts/", "Document/manifest.json"],
  "github_pages_copied": false,
  "git_push": "NOT PERFORMED — no git task run",
  "status": "complete"
}
```

## Tier-1 aggregators (fallback only)
Nation Thailand — nationthailand.com | Bangkok Post — bangkokpost.com | Thai Rath English — en.thairath.co.th | Thailand Business News — thailand-business-news.com | OpenGov Asia — opengovasia.com | Kaohoon International — kaohooninternational.com | ryt9.com — ryt9.com/en (read the full article) | Pattaya Mail — pattayamail.com

---

## Source registry (109) — `Agency | official_url | search keyword`
*(Facebook reference links omitted here for brevity — they're never fetched anyway; add per-agency if you need them in `social_media.agency_facebook`.)*

### Batch A — highest priority (30)

**สำนักนายกฯ & รัฐบาล (6)**
สำนักโฆษก | https://spm.thaigov.go.th/th/news | Thailand cabinet PM policy
GovChannel | https://www.thaigov.go.th/th/news | Thai government announcement
ราชกิจจานุเบกษา | https://ratchakitcha.soc.go.th | Royal Gazette Thailand law decree
สำนักงาน ก.พ. | https://www.ocsc.go.th/news/all-news/ | Thailand civil service OCSC
สำนักงบประมาณ | https://www.bb.go.th | Thailand budget allocation fiscal
NESDC (สภาพัฒน์) | https://www.nesdc.go.th/c/allnews/ | Thailand GDP NESDC economic growth

**การคลัง (4)**
กระทรวงการคลัง | https://www.mof.go.th/document-type/press-conference/ | Thailand finance ministry fiscal policy
กรมสรรพากร | https://www.rd.go.th/27208.html | Thailand revenue tax RD
ธนาคารแห่งประเทศไทย | https://www.bot.or.th/th/news-and-media.html | BOT Thailand monetary policy rate inflation
ตลาดหลักทรัพย์ฯ | https://www.set.or.th/th/home | SET Index Thailand stock market bourse

**สาธารณสุข (2)**
กระทรวงสาธารณสุข | https://www.moph.go.th | Thailand MOPH health policy hospital
กรมควบคุมโรค | https://www.ddc.moph.go.th | Thailand DDC disease control epidemic

**ดิจิทัลฯ (3)**
กระทรวงดิจิทัลฯ | https://www.mdes.go.th/home | Thailand MDES digital cyber platform
DGA (สพร.) | https://www.dga.or.th | Thailand DGA digital government e-service
ETDA | https://www.etda.or.th/th/ | Thailand ETDA AI governance digital literacy

**คมนาคม/พลังงาน/พาณิชย์/อุตสาหกรรม (4)**
กระทรวงคมนาคม | https://www.mot.go.th/intro | Thailand transport MRT BTS rail fare infrastructure
กระทรวงพลังงาน | https://www.energy.go.th/th | Thailand energy oil gas ERC EGAT
กระทรวงพาณิชย์ | https://www.moc.go.th/th/page/item/index/id/1 | Thailand commerce trade export import
กระทรวงอุตสาหกรรม | https://www.industry.go.th/th | Thailand industry manufacturing BOI EEC

**ศึกษาฯ/อว./มหาดไทย/ยุติธรรม/แรงงาน/เกษตร (6)**
กระทรวงศึกษาธิการ | https://www.moe.go.th | Thailand MOE education school reform
กระทรวง อว. | https://www.mhesi.go.th | Thailand MHESI university research innovation
กระทรวงมหาดไทย | https://moi.go.th/moi/ | Thailand interior province governor MOI
กระทรวงยุติธรรม | https://www.moj.go.th | Thailand justice court prison DSI
กระทรวงแรงงาน | https://www.mol.go.th | Thailand labor employment worker wage
กระทรวงเกษตรฯ | https://www.moac.go.th/news-minister | Thailand agriculture farmer crop rice subsidy

**กลาโหม/ต่างประเทศ/องค์กรอิสระ (5)**
กระทรวงกลาโหม | https://www.mod.go.th | Thailand defense military army MOD
กระทรวงการต่างประเทศ | https://www.mfa.go.th/th/index | Thailand foreign affairs MFA diplomacy
สำนักงาน ป.ป.ช. | https://www.nacc.go.th | Thailand NACC corruption anti-graft
กสทช. | https://www.nbtc.go.th | Thailand NBTC telecom broadcasting spectrum
คณะกรรมการการเลือกตั้ง | https://www.ect.go.th/ect_th/th/main | Thailand ECT election commission

### Batch B — mid priority (50)

**การคลัง (3)**
กรมสรรพสามิต | https://www.excise.go.th | Thailand excise tax alcohol tobacco
กรมศุลกากร | https://www.customs.go.th | Thailand customs import duty tariff
สำนักงานเศรษฐกิจการคลัง | https://www.fpo.go.th | Thailand FPO fiscal policy outlook

**เกษตร (5)**
กรมวิชาการเกษตร | https://www.doa.go.th | Thailand DOA agriculture research
กรมปศุสัตว์ | https://www.dld.go.th | Thailand DLD livestock animal
กรมชลประทาน | https://www2.rid.go.th | Thailand RID irrigation water dam
กรมส่งเสริมการเกษตร | https://www.doae.go.th | Thailand DOAE farmer extension
กรมประมง | https://www4.fisheries.go.th | Thailand fisheries aquaculture

**คมนาคม + พลังงาน (7)**
กรมทางหลวง | https://www.doh.go.th | Thailand highway road DOH
กรมทางหลวงชนบท | https://www.drr.go.th | Thailand rural road DRR
กรมการขนส่งทางบก | https://www.dlt.go.th | Thailand DLT transport license vehicle
การรถไฟฯ | https://www.railway.co.th | Thailand SRT railway train
การทางพิเศษฯ | https://www.exat.co.th | Thailand EXAT expressway toll
สำนักงาน กกพ. | https://www.erc.or.th/th/news-release | Thailand ERC energy regulatory tariff
ปตท. | https://www.pttplc.com/th/media/news | PTT Thailand oil gas LNG

**สาธารณสุข + ศึกษา (6)**
กรมการแพทย์ | https://www.dms.go.th | Thailand DMS medical hospital
กรมอนามัย | https://anamai.moph.go.th | Thailand health promotion anamai
อย. (FDA) | https://www.fda.moph.go.th | Thailand FDA food drug cosmetic
สปสช. | https://www.nhso.go.th | Thailand NHSO universal healthcare UHC
สพฐ. | https://iso.obec.moe/ | Thailand OBEC school basic education
วช. | https://www.nrct.go.th | Thailand NRCT research grant

**มหาดไทย/ยุติธรรม/แรงงาน/พม./พาณิชย์/กลาโหม/ตปท. (12)**
DSI | https://www.dsi.go.th | Thailand DSI special investigation
ป.ป.ส. | https://www.oncb.go.th | Thailand ONCB narcotics drug
กรมการปกครอง | https://www.dopa.go.th | Thailand DOPA administration district
กรม ปภ. | https://www.disaster.go.th | Thailand DDPM disaster flood storm
กรมการจัดหางาน | https://www.doe.go.th | Thailand DOE employment job foreign worker
สำนักงานประกันสังคม | https://www.sso.go.th | Thailand SSO social security
กระทรวง พม. | https://www.m-society.go.th | Thailand MSDHS social welfare
กรมการค้าต่างประเทศ | https://www.dft.go.th | Thailand DFT trade negotiation FTA
DITP | https://www.ditp.go.th | Thailand DITP export promotion
กรมการค้าภายใน | https://www.dit.go.th | Thailand DIT domestic trade price
กองทัพบก | https://www.rta.mi.th | Thailand army RTA military
กรมสารนิเทศ | https://info.mfa.go.th/ | Thailand MFA spokesperson

**สื่อของรัฐ (4)**
NBT | https://www.nbt.go.th | NBT Thailand news broadcast
Thai PBS | https://www.thaipbs.or.th | Thai PBS news report
สำนักข่าวไทย (TNA) | https://www.tna.mcot.net | TNA Thailand news agency
MCOT | https://www.mcot.net | MCOT Thailand media

**สื่อเอกชนหลัก (9)**
ไทยรัฐ | https://www.thairath.co.th | Thairath news
มติชน | https://www.matichon.co.th | Matichon news
ข่าวสด | https://www.khaosod.co.th | Khaosod news
Bangkok Post | https://www.bangkokpost.com | Bangkok Post Thailand
The Nation | https://www.nationthailand.com | Nation Thailand news
ประชาชาติธุรกิจ | https://www.prachachat.net | Prachachat business
ฐานเศรษฐกิจ | https://www.thansettakij.com | Thansettakij economy
กรุงเทพธุรกิจ | https://www.bangkokbiznews.com | Bangkokbiznews
ไทยโพสต์ | https://www.thaipost.net | Thaipost news

**พรรคการเมือง (4)**
เพื่อไทย | https://www.ptp.or.th | Pheu Thai party policy
ภูมิใจไทย | https://www.bhumjaithai.com | Bhumjaithai party Anutin
ประชาชน | https://peoplesparty.or.th/ | People's Party opposition Thailand
ไทยสร้างไทย | https://thaisangthai.org/news/ | Thai Sang Thai party

### Batch C — supplementary (29)
กนอ. | https://www.ieat.go.th | Thailand IEAT industrial estate
สศอ. | https://www.oie.go.th | Thailand OIE industrial economics
NECTEC | https://www.nectec.or.th | Thailand NECTEC electronics technology
ไปรษณีย์ไทย | https://www.thailandpost.co.th | Thailand Post logistics delivery
ททท. | https://www.tourismthailand.org | TAT Thailand tourism promotion
กระทรวงการท่องเที่ยวฯ | https://www.mots.go.th | Thailand MOTS sports tourism
กรมควบคุมมลพิษ | https://www.pcd.go.th | Thailand PCD pollution PM2.5 air quality
กรมอุทยานฯ | https://portal.dnp.go.th | Thailand national park wildlife DNP
กรมอุตุนิยมวิทยา | https://www.tmd.go.th | Thailand TMD weather forecast storm
กระทรวงวัฒนธรรม | https://www.m-culture.go.th | Thailand culture heritage arts
กรมกิจการเด็กฯ | https://www.dcy.go.th | Thailand DCY children youth
กรมกิจการผู้สูงอายุ | https://www.dop.go.th | Thailand DOP elderly aging
สตง. | https://www.audit.go.th | Thailand SAO audit government spending
ผู้ตรวจการแผ่นดิน | https://www.ombudsman.go.th | Thailand ombudsman complaint
กองทัพเรือ | https://www.navy.mi.th | Thailand navy RTN maritime
สยามรัฐ | https://www.siamrath.co.th | Siamrath news
The Standard | https://thestandard.co | The Standard Thailand
Prachatai | https://prachatai.com | Prachatai human rights
The Momentum | https://www.themomentum.co | The Momentum Thailand
Beartai | https://www.beartai.com | Beartai technology Thailand
data.go.th | https://data.go.th | Thailand open data government
สำนักงานสถิติแห่งชาติ | https://www.nso.go.th | Thailand NSO statistics census
GISTDA | https://www.gistda.or.th | Thailand GISTDA satellite geo
e-GP กรมบัญชีกลาง | https://www.gprocurement.go.th | Thailand e-GP procurement tender
สำนักงานคณะกรรมการกฤษฎีกา | https://www.krisdika.go.th | Thailand law legislation draft
ระบบกฎหมายไทย | https://law.go.th | Thailand legal system regulation
พลังประชารัฐ | https://www.palangpracharath.org | PPRP party Thailand
รวมไทยสร้างชาติ | (no official site listed) | UTNC party Thailand
ประชาธิปัตย์ | https://www.democrat.or.th | Democrat Party Thailand
---

## v1.1 Integration addendum (news-intel plugin) — ถ้าขัดกับข้อความด้านบน ให้ยึดส่วนนี้

### โฟกัสหัวข้อ (topic_focus = "tech-law")
คงโครง registry 109 แหล่งเดิม แต่ **เรียงลำดับและกรองเนื้อหา** ด้วยคำสำคัญต่อไปนี้ (ไทย/อังกฤษ):
พ.ร.บ./พ.ร.ก./ประกาศ/ร่างกฎหมาย ที่เกี่ยวกับ ดิจิทัล, คุ้มครองข้อมูลส่วนบุคคล (PDPA), ปัญญาประดิษฐ์ (AI), ไซเบอร์,
ธุรกรรมอิเล็กทรอนิกส์, สินทรัพย์ดิจิทัล, แพลตฟอร์มดิจิทัล, โทรคมนาคม/กสทช., ข้อมูลเปิด (Open Data), e-GP/จัดซื้อภาครัฐดิจิทัล,
Cloud/Data center, Digital ID, อาชญากรรมทางเทคโนโลยี (ระบุว่าส่วนอาชญากรรมให้ skill `police-crime-news-pipeline` เป็นเจ้าของ)
- ข่าวที่ไม่เกี่ยวกับหัวข้อ ไม่ต้องสร้าง article (นับเป็น `skipped_off_topic`)
- เพิ่มฟิลด์ `meta.topic_focus = "tech-law"` และ `meta.legal_stage`: ร่าง | รับฟังความเห็น | ครม.อนุมัติ | ประกาศราชกิจจาฯ | มีผลบังคับใช้ | แก้ไข/ยกเลิก
- `bd_insights` ยังใช้เหมือนเดิม และเพิ่ม `compliance_note` (ผลกระทบด้านการปฏิบัติตามกฎหมายต่อ SME/SI ไม่เกิน 2 ประโยค หรือ "N/A")
- Priority: ราชกิจจานุเบกษา, กระทรวงดีอี, DGA, ETDA, กสทช., สคก. (กฤษฎีกา), ครม./สำนักโฆษก, ก.ล.ต., ธปท. ก่อน แล้วค่อยหน่วยงานอื่น

### State backend (MCP `news-hub`)
- เริ่มด้วย `manifest_get(days=7)` และ `registry_get(name="gov")`; ส่งผลด้วย `news_put_article` / `news_put_report`
- ถ้า `news-hub` เรียกไม่ได้ ให้หยุดและรายงาน ห้ามเดาข้อมูลย้อนหลัง
- ส่ง `news_put_entities` (cases = ข่าวสำคัญ, entities = หน่วยงาน/กฎหมาย, relations = หน่วยงาน→กฎหมาย) ตาม skill `news-enrich`
- ห้ามเขียนไฟล์ vault เอง; ห้าม git; Facebook/โซเชียลเป็น reference only
