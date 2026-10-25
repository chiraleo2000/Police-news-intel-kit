# -*- coding: utf-8 -*-
import json,os,re,shutil,collections
D='2026-10-25'
crime=json.load(open('Document/%s_Crime/%s_crime.json'%(D,D),encoding='utf-8'))
idx=json.load(open('Document/%s_Crime/_index.json'%D,encoding='utf-8'))
P=json.load(open('ops/run/posts_20261025.json',encoding='utf-8'))
byt=collections.defaultdict(list)
for p in P: byt[p['topic']].append(p)
os.makedirs('vault/40_CrimeTypes',exist_ok=True)
for t,ps in byt.items():
    fn='vault/40_CrimeTypes/%s.md'%t
    new='\n## %s (%d คดี)\n'%(D,len(ps))+''.join('- [[%s]] %s\n'%(p['id'],p['title']) for p in ps)
    if os.path.exists(fn):
        s=open(fn,encoding='utf-8').read(); i=s.find('\n## %s ('%D)
        s=(s[:i]+new) if i>=0 else s.rstrip('\n')+'\n'+new
    else: s='---\ngenerated: true\ntype: crime_type\n---\n# %s\n'%t+new
    open(fn,'w',encoding='utf-8').write(s)
os.makedirs('vault/30_Entities/Units',exist_ok=True)
byu=collections.defaultdict(list)
for p in P:
    for u in p['units']: byu[u].append(p)
for u,ps in byu.items():
    fn='vault/30_Entities/Units/%s.md'%re.sub(r'[\\/:*?"<>|]','-',u)
    new='\n## %s\n'%D+''.join('- [[%s]] %s\n'%(p['id'],p['title']) for p in ps)
    if os.path.exists(fn):
        s=open(fn,encoding='utf-8').read()
        if '\n## %s\n'%D in s: s=s[:s.index('\n## %s\n'%D)]
        s=s.rstrip('\n')+'\n'+new
    else: s='---\ngenerated: true\ntype: unit\n---\n# %s\n'%u+new
    open(fn,'w',encoding='utf-8').write(s)
os.makedirs('vault/10_Daily',exist_ok=True)
open('vault/10_Daily/%s.md'%D,'w',encoding='utf-8').write('---\ngenerated: true\ndate: %s\ntype: daily\nrun: partial\n---\n# %s\n\n'%(D,D)+''.join('- [[%s]] (%s) %s\n'%(p['id'],p['topic'],p['title']) for p in P))
m=json.load(open('Document/manifest.json',encoding='utf-8'))
m['days']=[d for d in m['days'] if d['date']!=D]
m['days'].insert(0,{'date':D,'status':'published','total':crime['stats']['total'],'path':'%s_Crime/%s_crime.json'%(D,D),'run':'partial','note':'window 24-25 ต.ค.; scraped %d บทความ → %d เหตุการณ์; official PR (Batch A) 3 (<8 → partial); ดู _index.json'%(idx['articles_scraped_pass'],crime['stats']['total'])})
m['generated_at']=crime['generated_at']
json.dump(m,open('Document/manifest.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
gd='github-pages/data';os.makedirs(gd+'/downloads',exist_ok=True)
for suf,f in {'crime':'%s_crime.json'%D,'hotspots':'_hotspots.json','alerts':'_alerts.json','trends':'_trends.json','bd_leads':'_bd_leads.json','index':'_index.json','tags':'_tags.json','by_crime_type':'_by_crime_type.json','by_agency':'_by_agency.json'}.items():
    shutil.copy('Document/%s_Crime/%s'%(D,f),'%s/%s_%s.json'%(gd,D,suf))
shutil.copy('Document/%s_Crime/_brain_daily.md'%D,'%s/%s_brain_daily.md'%(gd,D))
shutil.copy('Document/%s_Crime/%s_crime.pdf'%(D,D),'%s/downloads/%s_crime.pdf'%(gd,D))
shutil.copy('Document/%s_Crime/%s_infographic.png'%(D,D),'%s/downloads/%s_infographic.png'%(gd,D))
gm=json.load(open(gd+'/manifest.json',encoding='utf-8'))
gm['days']=[d for d in gm['days'] if d['date']!=D]
gm['days'].insert(0,{'date':D,'status':'published','total':crime['stats']['total'],'crime_file':'%s_crime.json'%D,'downloads':[{'label':'PDF สรุปข่าว '+D,'path':'downloads/%s_crime.pdf'%D,'kind':'pdf'},{'label':'Infographic '+D,'path':'downloads/%s_infographic.png'%D,'kind':'image'}]})
gm['generated_at']=crime['generated_at']
json.dump(gm,open(gd+'/manifest.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
# case notes (render already wrote); verify
print(len(P),'cases',len([f for f in os.listdir('vault/20_Cases') if f.startswith('20261025')]))
