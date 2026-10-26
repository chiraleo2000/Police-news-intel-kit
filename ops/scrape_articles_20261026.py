import requests,json,re,glob,os,hashlib,concurrent.futures as cf
from bs4 import BeautifulSoup
H={'User-Agent':'Mozilla/5.0 (compatible; PoliceNewsIntelKit/1.2)','Accept-Language':'th,en;q=0.8'}
RAW='News/Articles/_raw/2026-10-26'
PAT={
'A_saranitet':r'saranitet\.police\.go\.th/commanders?-mission/\w+_\d+_\d+',
'A_tourist_police':r'touristpolice\.go\.th/post/',
'A_humantrafficking':r'humantrafficking\.police\.go\.th/(?!category|partners|about|press|learning)[^/]+/?$',
'B_DSI':r'dsi\.go\.th/th/Detail/[0-9a-f]{20}',
'B_OAG':r'ago\.go\.th/\d{6}-\d+/',
'B_ONCB':r'oncb\.go\.th/news/\d+',
'B_PACC':r'pacc\.go\.th/home/view_content/\d+/\d{4,}',
'C_27_thairath':r'thairath\.co\.th/news/crime/\d+',
'C_28_dailynews':r'dailynews\.co\.th/news/\d+',
'C_29_mgr':r'mgronline\.com/crime/detail/\d+',
'C_30_matichon':r'matichon\.co\.th/local/(crime/)?news_\d+',
'C_31_khaosod':r'khaosod\.co\.th/(crime|around-thailand)/news_\d+',
'C_32_thaipbs':r'thaipbs\.or\.th/news/content/\d+',
'C_33_amarintv':r'amarintv\.com/news/crime/\d+',
'C_36_pptv':r'pptvhd36\.com/news/อาชญากรรม/\d+',
'C_39_naewna':r'naewna\.com/n/crime/\d+',
'C_40_thaipost':r'thaipost\.net/(criminality-news|general-news|local-news|hot-news)/\d+',
'C_42_thaiger_th':r'thethaiger\.com/th/news/\d+',
'D_43_bkkpost':r'bangkokpost\.com/thailand/(general|crime)/\d+',
'D_44_thaiger':r'thethaiger\.com/news/[^/]+/[a-z0-9-]+',
'D_45_nation':r'nationthailand\.com/news/(?!tourism)[a-z-]+/\d+',
'D_46_khaosodeng':r'khaosodenglish\.com/news/(?!international)(\w+/)?2026/10/2[4-6]/',
'D_47_thairath_en':r'en\.thairath\.co\.th/news/crime/\d+',
'D_48_pattaya':r'pattayamail\.com/(latestnews/)?news/',
'D_49_phuketnews':r'thephuketnews\.com/.+-\d+\.php',
'D_50_thaipbsworld':r'thaipbsworld\.com/(around-thailand|politics|economy)/\d+',
'D_54_occrp':r'occrp\.org/en/news/',
}
KW=re.compile(r'จับ|ตำรวจ|คดี|ผู้ต้องหา|แก๊ง|ยาเสพติด|ยาบ้า|ไอซ์|ฉ้อโกง|หลอก|ฟอกเงิน|บัญชีม้า|ค้ามนุษย์|ปล้น|ชิงทรัพย์|ฆ่า|ยิง|ทำร้าย|บ่อน|พนัน|ตม\.|DSI|ดีเอสไอ|ปปง|ปปส|วิสามัญ|หมายจับ|ลักลอบ|สแกม|คอลเซ็นเตอร์|ไซเบอร์|ศาล|อัยการ|ทุจริต|police|arrest|scam|drug|murder|fraud|crime|smuggl|trafficking|gambling|suspect|seiz|detain|laundering|shoot|stab|raid|jail|prison|court|corrupt|cyber|call.?cent|killed|death|theft|robber|fugitive',re.I)
def getd(s):
    for sel in [('meta',{'property':'article:published_time'}),('meta',{'name':'pubdate'}),('meta',{'itemprop':'datePublished'}),('meta',{'property':'og:updated_time'}),('meta',{'name':'publish-date'}),('meta',{'name':'date'})]:
        m=s.find(*sel)
        if m and m.get('content'): return m['content']
    for sc in s.find_all('script',type='application/ld+json'):
        mm=re.search(r'"datePublished"\s*:\s*"([^"]+)"',sc.string or '')
        if mm: return mm.group(1)
    t=s.find('time')
    if t: return t.get('datetime') or t.get_text(strip=True)
    return None
def fetch(u):
    fn=f"{RAW}/A_{hashlib.md5(u.encode()).hexdigest()[:12]}.json"
    if os.path.exists(fn): return json.load(open(fn))
    try:
        r=requests.get(u,headers=H,timeout=25); s=BeautifulSoup(r.content,'lxml')
        title=(s.find('meta',{'property':'og:title'}) or {}).get('content') or (s.title.string if s.title else '')
        date=getd(s)
        for t in s(['script','style','nav','footer','header','aside','form']): t.decompose()
        art=s.find('article') or s.find('main') or s.body
        ps=[p.get_text(' ',strip=True) for p in (art.find_all('p') if art else [])]
        body='\n'.join(p for p in ps if len(p)>20) or (art.get_text(' ',strip=True) if art else '')
        d={'url':u,'final':r.url,'status':r.status_code,'title':(title or '').strip(),'date':date,'body':body[:9000],'len':len(body)}
    except Exception as e:
        d={'url':u,'status':'ERR','err':str(e)[:120]}
    json.dump(d,open(fn,'w'),ensure_ascii=False); return d
cands={}
for f in glob.glob(f'{RAW}/L_*.json'):
    k=os.path.basename(f)[2:-5]
    if k not in PAT: continue
    seen={}
    for x in json.load(open(f)):
        for u,t in x.get('links',[]):
            if re.search(PAT[k],u) and u not in seen: seen[u]=t
    items=list(seen.items())
    if not k.startswith(('A_','B_')) and k not in('C_27_thairath','C_29_mgr','C_32_thaipbs','C_28_dailynews','C_33_amarintv','C_30_matichon'):
        items=[(u,t) for u,t in items if KW.search(t)]
    cands[k]=items[:60]
json.dump({k:[u for u,_ in v] for k,v in cands.items()},open(f'{RAW}/_cands.json','w'))
allu=[(k,u) for k,v in cands.items() for u,_ in v]
print('candidates',len(allu),{k:len(v) for k,v in cands.items()})
with cf.ThreadPoolExecutor(12) as ex: res=list(ex.map(lambda x:(x[0],fetch(x[1])),allu))
ok=sum(1 for k,d in res if d.get('status')==200); print('fetched ok',ok,'of',len(res))
