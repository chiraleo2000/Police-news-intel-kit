import requests,json,re,hashlib,concurrent.futures as cf
from bs4 import BeautifulSoup
H={'User-Agent':'Mozilla/5.0 (compatible; PoliceNewsIntelKit/1.2)'}
RAW='News/Articles/_raw/2026-10-27'
cands=json.load(open(f'{RAW}/_cands.json'))
# mgr bodies
def mgr(u):
    fn=f"{RAW}/A_{hashlib.md5(u.encode()).hexdigest()[:12]}.json"
    d=json.load(open(fn))
    r=requests.get(u,headers=H,timeout=25);s=BeautifulSoup(r.content,'lxml')
    for t in s(['script','style','nav','footer','header']): t.decompose()
    txt=s.get_text(' ',strip=True)
    t=d['title']; i=txt.find(t,txt.find(t)+len(t)) if txt.count(t)>1 else txt.find(t)
    body=txt[i+len(t):] if i>=0 else txt
    d['body']=body;d['len']=len(body);json.dump(d,open(fn,'w'),ensure_ascii=False);return u
with cf.ThreadPoolExecutor(10) as ex: list(ex.map(mgr,cands['C_29_mgr']))
# regional oncb, others
pages={f'oncb_or{i}':f'https://or{i}.oncb.go.th/information-news' for i in range(1,10)}
pages.update({'ht_press':'https://humantrafficking.police.go.th/press-release/','saranitet_inv':'https://saranitet.police.go.th/category/commanders-mission/investigation/','saranitet_news':'https://saranitet.police.go.th/commander-mission/','thaicert_news':'https://www.thaicert.or.th/cyber-threat-news-th/','tpb_cat':'https://www.touristpolice.go.th/tpb-news/categories/กิจกรรมของ-บช-ทท','dailynews_crime':'https://www.dailynews.co.th/crime/','pptv':'https://www.pptvhd36.com/news/อาชญากรรม','komchad':'https://www.komchadluek.net/crime','isra':'https://www.isranews.org/','cid':'https://ccid4.ccib.go.th/'})
def pg(kv):
    k,u=kv
    try:
        r=requests.get(u,headers=H,timeout=25);s=BeautifulSoup(r.content,'lxml')
        L=[(requests.compat.urljoin(r.url,a['href']),a.get_text(' ',strip=True)[:90]) for a in s.find_all('a',href=True) if len(a.get_text(strip=True))>12]
        return k,r.status_code,L,s.get_text(' ',strip=True)[:300]
    except Exception as e: return k,'ERR',[],str(e)[:80]
for k,st,L,t in cf.ThreadPoolExecutor(10).map(pg,pages.items()):
    print('==',k,st,len(L)); 
    for u,x in L[:200]:
        if re.search(r'/news/\d{5}|_2[4-6]10|/post/|news/content|/news/\d+|/\d{6,}',u): print('  ',u[:95],'|',x[:50])
