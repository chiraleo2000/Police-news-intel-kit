# -*- coding: utf-8 -*-
import json,glob,collections,datetime
D='2026-10-26'; OUT='Document/%s_Crime/'%D; R='News/Articles/_raw/2026-10-26/'
crime=json.load(open(OUT+D+'_crime.json',encoding='utf-8'))
prev=json.load(open('Document/2026-10-25_Crime/_index.json',encoding='utf-8'))
w=json.load(open(R+'_inwindow.json'));cnt=collections.Counter(x['src'] for x in w)
rev=cnt
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
    base='http %s; listing fetched 2026-10-26; in-window items %d; crime-relevant used %d'%(','.join(sorted(set(st))),inw,rv)
    status='ok' if code=='200' and inw>0 else ('ok-stale' if code=='200' else ('blocked' if code in ('401','403') else 'error'))
    if code=='200' and inw==0 and k in ('B_AMLO','B_OCPB','B_SEC','C_37_komchad','C_38_isra','B_ThaiPoliceOnline','C_35_ch7','B_NACC'): status='no_listing'
    # find matching existing key in sh
    cand=[x for x in sh if x.split(':')[-1].lower().startswith(reg.split(':')[-1].lower()) or reg.split(':')[-1].lower() in x.lower()]
    key=cand[0] if cand else reg
    sh[key]='%s (%s)'%(status,base)
ov('A:tourist_police','ok-stale (listing + posts fetched; newest post 24 Oct 2026, none in window 25-26 Oct)')
sh['B:ONCB']='ok (main listing newest 22 Oct; regional or1-or9 checked; or9.oncb.go.th/news/26558 dated 26 Oct used as official)'
sh['B:DSI']='ok-stale (listing has dates; newest item 22 Oct 2026 17:00, none in window)'
sh['B:MDES']='blocked (HTTP 403; not circumvented)'
sh['B:Corrections']='blocked (robots/ERR; not circumvented, per v1.2 fix table)'
sh['C:35_ch7']='blocked (robots disallow; no content used)'
sh['D:55_reuters']='blocked (HTTP 401 paywall; not bypassed)'
sh['D:51_aseannow']='error (HTTP 404; forum lead-only source)'
sh['B:NACC']='blocked (robots; not circumvented)'
sh['A:ccid5']='blocked (robots; not circumvented)'
sh['A:cppd']='blocked (robots; not circumvented)'
sh['B:ThaiPoliceOnline']='js_only (SPA, no server-rendered list; no items)'
for k in ['A:royalthaipolice','A:cib','A:immigration','A:csd','B:AMLO','B:SEC','B:OCPB']:
    sh[k]='search_only/no_listing (listing http200 without dated items; allowed_domains web_search returned no in-window permalinks)'
bad=[k for k,v in sh.items() if not v or 'not_attempted' in v]
reasons=['official_pr_articles=0 (Batch A) <8, official overall 1 (ONCB ภ.9, 26 Oct): Mon 26 Oct 08:00 run after a weekend; Tourist Police/DSI/ONCB main/saranitet/OAG/PACC newest items 22-24 Oct (before window); MDES 403; robots-blocked rows not circumvented','รันวันจันทร์ 08:00 ICT หลังสุดสัปดาห์: เว็บหน่วยงานทางการยังไม่ลงข่าวใหม่ในหน้าต่าง 25-26 ต.ค.; ข่าวที่ตรงกับเหตุการณ์ใน 10-25 (ตัวประกัน/ชาวต่างชาติ/บัญชีม้า/ศุลกากร/ศอกตำรวจ ฯลฯ) ไม่ถูกสร้างซ้ำ (add-only ข้ามวัน) ตัดข่าวคอลัมน์/นโยบายกระทรวงยุติธรรม/ข่าวโพสต์โซเชียลแหล่งเดียวที่ไม่ยืนยัน','ตัดข่าวที่เกี่ยวกับการฆ่าตัวตายตามกฎจริยธรรม; Facebook/social ไม่ถูกดึง']
idx={'date':D,'generated_at':crime['generated_at'],'run':'partial','stats':crime['stats'],
 'articles_scraped_pass':len(w),'official_pr_articles':0,'official_articles_all_batches':1,
 'posts_published_after_merge':len(crime['posts']),'fetch_count_approx':nL+nA,'skipped_out_of_scope':len(w)-len(crime['posts']),
 'partial_reasons':reasons,'files':['%s_crime.html'%D,'%s_crime.json'%D,'%s_crime.md'%D,'%s_crime.pdf'%D,'%s_infographic.png'%D],'no_news_today':False,
 'source_health':sh,'registry_issues':prev['registry_issues'],'discovered_paths':prev['discovered_paths'],
 'note':'ดึงด้วย requests/bs4 บนอุปกรณ์ (เนื้อหาเต็ม); ไม่มี git; Facebook ไม่ถูกดึง; ตัดรายการเกี่ยวกับการฆ่าตัวตาย; ch7/correct/ccid5/cppd/NACC บล็อกตาม robots ไม่ได้หลีกเลี่ยง'}
json.dump(idx,open(OUT+'_index.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(len(sh),'bad',bad,'fetches',nL+nA,'pass',idx['articles_scraped_pass'])
print([ (k,v[:60]) for k,v in sh.items() if k.startswith(('B:','C:2','C:3'))][:12])
