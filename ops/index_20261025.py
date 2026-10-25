# -*- coding: utf-8 -*-
import json,glob,collections,datetime
D='2026-10-25'; OUT='Document/%s_Crime/'%D; R='News/Articles/_raw/2026-10-25/'
crime=json.load(open(OUT+D+'_crime.json',encoding='utf-8'))
prev=json.load(open('Document/2026-10-24_Crime/_index.json',encoding='utf-8'))
w=json.load(open(R+'_inwindow.json'));cnt=collections.Counter(x['src'] for x in w)
rev=collections.Counter(x[1] for x in json.load(open(R+'_review.json')))
Lst={}
for f in glob.glob(R+'L_*.json'):
    k=f.split('L_')[-1][:-5]; d=json.load(open(f)); Lst[k]=[str(x.get('status')) for x in d]
nA=len(glob.glob(R+'A_*.json')); nL=sum(len(v) for v in Lst.values())
sh={}
for k,v in prev['source_health'].items():
    sh[k]=v
# today's overrides keyed by registry keys (prefix match on listing name)
def ov(key,txt): sh[key]=txt
for k,st in Lst.items():
    reg=k.split('_',1)[0]+':'+k.split('_',1)[1]
    inw=cnt.get(k,0); rv=rev.get(k,0)
    code=st[0]
    base='http %s; listing fetched 2026-10-25; in-window items %d; crime-relevant used %d'%(','.join(sorted(set(st))),inw,rv)
    status='ok' if code=='200' and inw>0 else ('ok-stale' if code=='200' else ('blocked' if code in ('401','403') else 'error'))
    if code=='200' and inw==0 and k in ('B_AMLO','B_OCPB','B_SEC','C_37_komchad','C_38_isra','B_ThaiPoliceOnline','C_35_ch7','B_NACC'): status='no_listing'
    # find matching existing key in sh
    cand=[x for x in sh if x.split(':')[-1].lower().startswith(reg.split(':')[-1].lower()) or reg.split(':')[-1].lower() in x.lower()]
    key=cand[0] if cand else reg
    sh[key]='%s (%s)'%(status,base)
ov('A:tourist_police','ok (listing + 3 in-window official posts used; 24 Oct commandernews/tpbnews)')
ov('B:MDES','blocked (HTTP 403 Cloudflare; not circumvented)') if 'B:MDES' in sh else None
sh['B:Corrections']='blocked (robots/ERR; not circumvented, per v1.2 fix table)'
sh['C:35_ch7']='blocked (robots disallow; no content used)'
sh['D:55_reuters']='blocked (HTTP 401 paywall; not bypassed)'
sh['B:NACC']='blocked (robots; not circumvented)'
sh['A:ccid5']='blocked (robots; not circumvented)'
sh['A:cppd']='blocked (robots; not circumvented)'
sh['B:ThaiPoliceOnline']='js_only (SPA, no server-rendered list; no items)'
bad=[k for k,v in sh.items() if not v or 'not_attempted' in v]
reasons=['official_pr_articles=3 < 8: only Tourist Police (บช.ทท.) posts in window; DSI/ONCB newest items 22 Oct, saranitet/humantrafficking/PACC/OAG stale or ceremonial, MDES 403, robots-blocked rows not circumvented','รันเวลา 08:00 ICT: เว็บหน่วยงานตำรวจส่วนใหญ่ยังไม่ลงข่าวของวันนี้','ตัดข่าวที่เกี่ยวกับการฆ่าตัวตายตามกฎจริยธรรม; Facebook/social ไม่ถูกดึง']
idx={'date':D,'generated_at':crime['generated_at'],'run':'partial','stats':crime['stats'],
 'articles_scraped_pass':len(w) if False else sum(rev.values()),'official_pr_articles':3,'official_articles_all_batches':3,
 'posts_published_after_merge':len(crime['posts']),'fetch_count_approx':nL+nA,'skipped_out_of_scope':len(w)-sum(rev.values()),
 'partial_reasons':reasons,'files':['%s_crime.html'%D,'%s_crime.json'%D,'%s_crime.md'%D,'%s_crime.pdf'%D,'%s_infographic.png'%D],'no_news_today':False,
 'source_health':sh,'registry_issues':prev['registry_issues'],'discovered_paths':prev['discovered_paths'],
 'note':'ดึงด้วย requests/bs4 บนอุปกรณ์ (เนื้อหาเต็ม); ไม่มี git; Facebook ไม่ถูกดึง; ตัดรายการเกี่ยวกับการฆ่าตัวตาย; ch7/correct/ccid5/cppd/NACC บล็อกตาม robots ไม่ได้หลีกเลี่ยง'}
json.dump(idx,open(OUT+'_index.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(len(sh),'bad',bad,'fetches',nL+nA,'pass',idx['articles_scraped_pass'])
print([ (k,v[:60]) for k,v in sh.items() if k.startswith(('B:','C:2','C:3'))][:12])
