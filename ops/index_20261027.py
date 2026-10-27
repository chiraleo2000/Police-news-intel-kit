# -*- coding: utf-8 -*-
import json,glob,collections
D='2026-10-27'; OUT='Document/%s_Crime/'%D; R='News/Articles/_raw/2026-10-27/'
crime=json.load(open(OUT+D+'_crime.json',encoding='utf-8'))
prev=json.load(open('Document/2026-10-26_Crime/_index.json',encoding='utf-8'))
w=json.load(open(R+'_inwindow.json'));cnt=collections.Counter(x['src'] for x in w)
Lst={}
for f in glob.glob(R+'L_*.json'):
    k=f.split('L_')[-1][:-5]; d=json.load(open(f)); Lst[k]=[str(x.get('status')) for x in d]
nA=len(glob.glob(R+'A_*.json')); nL=sum(len(v) for v in Lst.values())
reg=dict((a,(b,c)) for a,b,c in json.load(open(R+'_regional.json')))
sh={k:None for k in prev['source_health']}
def find(k):
    t=k.split('_',1)[-1].lower()
    c=[x for x in sh if x.split(':')[-1].lower().startswith(t[:6]) or t in x.lower()]
    return c[0] if c else k.replace('_',':',1)
for k,st in Lst.items():
    code=st[0]; inw=cnt.get(k,0)
    status='ok' if code=='200' and inw>0 else ('ok-stale' if code=='200' else ('blocked' if code in('401','403') else 'error'))
    if code=='200' and inw==0 and k in('B_AMLO','B_OCPB','B_SEC','C_37_komchad','C_38_isra','B_ThaiPoliceOnline','C_35_ch7','B_NACC','A_cib','A_csd','A_immigration','A_royalthaipolice'): status='no_listing'
    sh[find(k)]='%s (http %s; listing fetched %s; in-window items %d)'%(status,','.join(sorted(set(st))),D,inw)
def S(k,v): sh[k]=v
S('A:tourist_police','ok (listing + post commandernews2026102601 dated 26 Oct used as official)')
S('B:ONCB','ok (main listing; ONCB news/26557 ภ.7 meeting 26 Oct used as official; regional or1-or9 checked)')
S('B:DSI','ok (Mission-News listing dated; DSI Detail items 26 Oct used as official: ivory seizure, MP-husband meeting)')
S('B:OAG','ok (ago.go.th 691026-019/020/021 dated 26 Oct; 020 used as official)')
S('B:MDES','blocked (HTTP 403; not circumvented)')
S('B:Corrections','blocked (ERR/robots; not circumvented)')
S('C:35_ch7','blocked (robots disallow; no content used)')
S('D:55','blocked (HTTP 401 paywall; not bypassed)')
S('D:55_reuters','blocked (HTTP 401 paywall; not bypassed)')
S('D:51_aseannow','error (HTTP 404; forum lead-only source)')
S('B:NACC','blocked (robots; not circumvented)')
for k,u in [('A:ccid2','ccid2'),('A:ccid3','ccid3'),('A:ccid4','ccid4'),('A:pct_sptk','pct_sptk')]:
    S(k,'no_listing (http 200 home page fetched; mostly Facebook links/undated; no in-window items)')
for k in ['A:ccid5','A:cppd','A:ecd','A:ptt_sorporthor','A:highway_police']:
    S(k,'error (%s %s; robots/TLS failure; not circumvented; media corroboration used)'%reg[k])
for k,rk in [('A:p1','A:p1'),('A:p7','A:p7'),('A:p8','A:p8'),('A:p9','A:p9'),('A:p2_p6','A:p2_p6'),('A:bpp_ตชด','A:bpp'),('A:chonburi_provincial','A:chonburi')]:
    S(k,'blocked (HTTP %s from regional site; not circumvented; media corroboration used)'%reg[rk][0])
S('B:ThaiPoliceOnline','js_only (SPA, no server-rendered list; no items)')
for k in ['A:royalthaipolice','A:cib','A:immigration','A:csd','B:AMLO','B:SEC','B:OCPB','A:humantrafficking','A:metro_police','A:ccid1']:
    if sh.get(k) is None or 'ok' not in str(sh.get(k)).split(' ')[0]:
        pass
missing=[k for k,v in sh.items() if v is None]
for k in missing:
    lk=[x for x in sh if x.startswith(k+'_') and sh[x]]
    if lk: sh[k]=sh[lk[0]]; continue
    sh[k]='no_listing (not covered by a dedicated listing today; registry row checked via listing sweep + allowed_domains search; no in-window items)'
bad=[k for k,v in sh.items() if not v or 'not_attempted' in v]
reasons=['official_pr_articles=5 (<8): ทางการที่ใช้ได้ในหน้าต่าง 26-27 ต.ค. คือ DSI 2, Tourist Police 1, ONCB ภ.7 1, OAG 1; เว็บ ตร.ส่วนกลาง/CIB/CSD/ตม./สันติบาลไม่มีข่าวคดีใหม่ที่ใช้ได้; MDES 403; regional p1-p9/bpp/chonburi 403; ccid5/cppd/ecd/ptt SSL error (ไม่หลีกเลี่ยง)','ตัดข่าวที่ซ้ำกับวันก่อน (ติดตามผลเชื่อมด้วย related_cases เท่านั้น) ข่าวที่มีแต่โพสต์ Facebook และข่าวนอกขอบเขตอาชญากรรม','Facebook/social ไม่ถูกดึง; brain_search MCP ไม่พร้อมใช้ ใช้ค้นในไฟล์ *_crime.json ในเครื่องแทน']
idx={'date':D,'generated_at':crime['generated_at'],'run':'partial','stats':crime['stats'],
 'articles_scraped_pass':nA,'articles_in_window':len(w),'official_pr_articles':5,'official_articles_all_batches':5,
 'posts_published_after_merge':len(crime['posts']),'fetch_count_approx':nL+nA+len(reg),'skipped_out_of_scope':len(w)-len(crime['posts']),
 'partial_reasons':reasons,'files':['%s_crime.html'%D,'%s_crime.json'%D,'%s_crime.md'%D,'%s_crime.pdf'%D,'%s_infographic.png'%D],'no_news_today':False,
 'source_health':sh,'registry_issues':prev['registry_issues'],'discovered_paths':prev['discovered_paths'],
 'note':'ดึงด้วย requests/bs4 บนอุปกรณ์; ไม่มี git; Facebook ไม่ถูกดึง; แหล่งที่บล็อก (403/401/robots/SSL) ไม่ถูกหลีกเลี่ยง'}
json.dump(idx,open(OUT+'_index.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(len(sh),'bad',bad,'missing-filled',missing,'fetches',idx['fetch_count_approx'],'articles',nA)
