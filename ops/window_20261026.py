import json,glob,re,os
from datetime import datetime,timezone,timedelta
RAW='News/Articles/_raw/2026-10-26'
TZ=timezone(timedelta(hours=7)); W0=datetime(2026,10,25,0,0,tzinfo=TZ)
cands=json.load(open(f'{RAW}/_cands.json')); u2k={u:k for k,v in cands.items() for u in v}
import hashlib
def pdate(d):
    u=d['url']; s=d.get('date')
    if s:
        s=s.strip()
        try:
            x=datetime.fromisoformat(s.replace('Z','+00:00'))
            if x.tzinfo is None: x=x.replace(tzinfo=TZ)
            return x
        except: pass
    m=re.search(r'post/\w+?(20\d{2})(\d{2})(\d{2})\d{2}$',u)
    if m: return datetime(int(m[1]),int(m[2]),int(m[3]),12,tzinfo=TZ)
    m=re.search(r'_(\d{2})(\d{2})(20\d{2})_',u)
    if m: return datetime(int(m[3]),int(m[2]),int(m[1]),12,tzinfo=TZ)
    m=re.search(r'ago\.go\.th/(\d{2})(\d{2})(\d{2})-',u)
    if m: return datetime(int(m[3])+2500-543,int(m[2]),int(m[1]),12,tzinfo=TZ)
    m=re.search(r'/(2026)/(\d{2})/(\d{2})/',u)
    if m: return datetime(int(m[1]),int(m[2]),int(m[3]),12,tzinfo=TZ)
    return None
out=[]
for f in glob.glob(f'{RAW}/A_*.json'):
    d=json.load(open(f))
    if d.get('status')!=200: continue
    k=u2k.get(d['url']); 
    if not k: continue
    dt=pdate(d)
    out.append((k,dt,d))
inw=[(k,dt,d) for k,dt,d in out if dt and dt>=W0]
nod=[(k,d) for k,dt,d in out if not dt]
print('total ok',len(out),'in-window',len(inw),'nodate',len(nod))
from collections import Counter
print(Counter(k for k,_,_ in inw)); print('nodate',Counter(k for k,_ in nod))
json.dump([{'src':k,'dt':dt.isoformat(),'url':d['url'],'title':d['title'],'len':d['len']} for k,dt,d in sorted(inw,key=lambda x:x[1])],open(f'{RAW}/_inwindow.json','w'),ensure_ascii=False,indent=0)
for k,dt,d in sorted(inw,key=lambda x:x[0]): print(k[:10],dt.strftime('%d %H:%M'),d['len'],d['title'][:70])
