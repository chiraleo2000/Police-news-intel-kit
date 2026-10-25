import requests,json,sys,re,hashlib,os,concurrent.futures as cf
from bs4 import BeautifulSoup
H={'User-Agent':'Mozilla/5.0 (compatible; PoliceNewsIntelKit/1.2)','Accept-Language':'th,en;q=0.8'}
OUT='News/Articles/_raw/2026-10-25'
SRC={
'A:royalthaipolice':['https://www.royalthaipolice.go.th/'],
'A:ccid1':['https://ccid1.ccib.go.th/'],
'A:cib':['https://www.cib.go.th/news?category=general','https://www.cib.go.th/'],
'A:csd':['https://csd.go.th/'],
'A:tourist_police':['https://www.touristpolice.go.th/tpb-news'],
'A:immigration':['https://www.immigration.go.th/'],
'A:saranitet':['https://saranitet.police.go.th/'],
'A:humantrafficking':['https://humantrafficking.police.go.th/'],
'A:metro':['https://www.metro.police.go.th/'],
'B:DSI':['https://www.dsi.go.th/th/Type/Mission-News'],
'B:ONCB':['https://www.oncb.go.th/information-news'],
'B:AMLO':['https://www.amlo.go.th/'],
'B:OAG':['https://www.ago.go.th/'],
'B:MDES':['https://www.mdes.go.th/news'],
'B:ThaiCERT':['https://www.thaicert.or.th/'],
'B:SEC':['https://www.sec.or.th/'],
'B:PACC':['https://www.pacc.go.th/home1'],
'B:OCPB':['https://www.ocpb.go.th/'],
'B:NACC':['https://www.nacc.go.th'],
'B:Corrections':['https://www.correct.go.th/'],
'B:ThaiPoliceOnline':['https://www.thaipoliceonline.go.th/'],
'C:27_thairath':['https://www.thairath.co.th/news/crime','https://www.thairath.co.th/news/crime?page=2'],
'C:28_dailynews':['https://www.dailynews.co.th/crime/','https://www.dailynews.co.th/crime/page/2/'],
'C:29_mgr':['https://mgronline.com/crime','https://mgronline.com/crime/'],
'C:30_matichon':['https://www.matichon.co.th/local/crime','https://www.matichon.co.th/local/crime/page/2'],
'C:31_khaosod':['https://www.khaosod.co.th/crime','https://www.khaosod.co.th/'],
'C:32_thaipbs':['https://www.thaipbs.or.th/news/categories/crime','https://www.thaipbs.or.th/news/categories/crime?page=2'],
'C:33_amarintv':['https://www.amarintv.com/news/crime','https://www.amarintv.com/news/crime?page=2'],
'C:34_nationtv':['https://www.nationtv.tv/crime'],
'C:35_ch7':['https://news.ch7.com/crime'],
'C:36_pptv':['https://www.pptvhd36.com/news/อาชญากรรม'],
'C:37_komchad':['https://www.komchadluek.net/crime'],
'C:38_isra':['https://www.isranews.org/'],
'C:39_naewna':['https://www.naewna.com/'],
'C:40_thaipost':['https://www.thaipost.net/'],
'C:41_bangkokbiz':['https://www.bangkokbiznews.com/'],
'C:42_thaiger_th':['https://thethaiger.com/th/news'],
'D:43_bkkpost':['https://www.bangkokpost.com/thailand/general/'],
'D:44_thaiger':['https://thethaiger.com/hot-news/crime'],
'D:45_nation':['https://www.nationthailand.com/'],
'D:46_khaosodeng':['https://www.khaosodenglish.com/'],
'D:47_thairath_en':['https://en.thairath.co.th/news/crime'],
'D:48_pattaya':['https://www.pattayamail.com/'],
'D:49_phuketnews':['https://www.thephuketnews.com/'],
'D:50_thaipbsworld':['https://www.thaipbsworld.com/'],
'D:51_aseannow':['https://aseannow.com/forum/163-thailand-crime-news/'],
'D:52_interpol':['https://www.interpol.int/en/News-and-Events/News'],
'D:53_unodc':['https://www.unodc.org/southeastasiaandpacific/'],
'D:54_occrp':['https://www.occrp.org/'],
'D:55_reuters':['https://www.reuters.com/legal/'],
}
def go(item):
    k,urls=item;res=[]
    for u in urls:
        try:
            r=requests.get(u,headers=H,timeout=25)
            s=BeautifulSoup(r.content,'lxml')
            links=[]
            for a in s.find_all('a',href=True):
                t=a.get_text(' ',strip=True)
                if len(t)>=12: links.append((requests.compat.urljoin(r.url,a['href']),t[:160]))
            text=s.get_text(' ',strip=True)[:6000]
            res.append({'url':u,'final':r.url,'status':r.status_code,'bytes':len(r.content),'links':links[:150],'text':text})
        except Exception as e:
            res.append({'url':u,'status':'ERR','err':str(e)[:150]})
    json.dump(res,open(f"{OUT}/L_{re.sub('[^A-Za-z0-9_]','_',k)}.json",'w'),ensure_ascii=False)
    return k,[(x['url'],x['status']) for x in res]
with cf.ThreadPoolExecutor(10) as ex:
    for k,r in ex.map(go,SRC.items()): print(k,r)
