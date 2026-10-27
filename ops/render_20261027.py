import json,collections,os,re,html,datetime,shutil,glob
D='2026-10-27'
NOW=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).replace(microsecond=0).isoformat()
P=json.load(open('ops/run/posts_20261027.json',encoding='utf-8'))
out='Document/%s_Crime'%D;os.makedirs(out+'/fonts',exist_ok=True)
for f in os.listdir('Document/2026-10-26_Crime/fonts'): shutil.copy('Document/2026-10-27_Crime/fonts/'+f,out+'/fonts/'+f)
def num(v): return v if isinstance(v,(int,float)) else 0
byc=collections.Counter(p['topic'] for p in P)
st={'total':len(P),'direct':sum(p['origin']=='direct' for p in P),'indirect':sum(p['origin']=='indirect' for p in P)}
for k in 'ABC': st['priority_'+k]=sum(p['priority']==k for p in P)
st.update(alerts=sum(p['alert'] for p in P),official_confirmed=sum(p['verification']=='official_confirmed' for p in P),by_crime_type=dict(byc.most_common()),
 total_loss_thb=sum(num(p['stats'].get('loss_thb')) for p in P),total_seized_value_thb=sum(num(p['stats'].get('seized_value_thb')) for p in P),total_arrested=sum(num(p['stats'].get('arrested')) for p in P))
crime={'date':D,'generated_at':NOW,'stats':st,'posts':[{k:v for k,v in p.items() if k not in('crime_type_code','secondary_codes','units','modus_operandi','scale','is_police_pr','related_laws','trend_signal','source_count')} for p in P]}
def w(n,o): json.dump(o,open(out+'/'+n,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
w(D+'_crime.json',crime)
w('_by_crime_type.json',{t:{'count':c,'post_ids':[p['id'] for p in P if p['topic']==t],'top_tags':[t2 for t2,_ in collections.Counter(x for p in P if p['topic']==t for x in p['tags']).most_common(5)],'total_loss_thb':sum(num(p['stats'].get('loss_thb')) for p in P if p['topic']==t)} for t,c in byc.most_common()})
ag=collections.defaultdict(list)
for p in P: ag[p['agency']].append(p['id'])
w('_by_agency.json',{a:{'count':len(v),'post_ids':v} for a,v in sorted(ag.items(),key=lambda x:-len(x[1]))})
hs=collections.defaultdict(lambda:{'region':'','ids':[],'types':collections.Counter()})
for p in P:
    for i,pv in enumerate(p['province'][:1]):
        h=hs[pv];h['region']=(p['region'] or [''])[0];h['ids'].append(p['id']);h['types'][p['topic']]+=1
hot=[{'province':k,'region':v['region'],'count':len(v['ids']),'top_crime_types':[t for t,_ in v['types'].most_common(3)],'post_ids':v['ids']} for k,v in hs.items()]
hot.sort(key=lambda x:-x['count']);w('_hotspots.json',hot)
tg=collections.Counter(t for p in P for t in p['tags']);mo=collections.Counter(m for p in P for m in p['modus_operandi'])
w('_tags.json',{'tags':[{'tag':t,'count':c} for t,c in tg.most_common(40)],'modus_operandi':[{'mo':m,'count':c} for m,c in mo.most_common()],'new_mo_candidates':[]})
al=[p for p in P if p['alert']]
w('_alerts.json',{'alerts':[{'id':p['id'],'title':p['title'],'topic':p['topic'],'actions_public':p['actions_public'],'impersonation':p['impersonation']} for p in al],'impersonation':[p['id'] for p in al if p['impersonation']]})
prev=[]
for f in sorted(glob.glob('github-pages/data/2026-10-2[0-6]_crime.json')):
    try: prev.append(json.load(open(f,encoding='utf-8'))['posts'])
    except Exception: pass
nprev=len(prev)
def avg(cnt): return sum(cnt)/nprev if nprev else None
def delta(t,a): return None if not a else round((t-a)/a*100,1)
pt=collections.Counter(); pm=collections.Counter(); pp=collections.Counter()
btype=[collections.Counter(x['topic'] for x in d) for d in prev]
bmo=[collections.Counter(m for x in d for m in x.get('modus_operandi',[])) for d in prev]
bpv=[collections.Counter(pv for x in d for pv in x.get('province',[])) for d in prev]
ok=nprev>=3
TR_NOTE='baseline %d วันย้อนหลัง (<7 วัน: แนวโน้มเป็นข้อมูลบ่งชี้เท่านั้น) surge = วันนี้ >=3 เรื่อง และสูงกว่าค่าเฉลี่ย >=50 เปอร์เซ็นต์'%nprev if ok else 'มีข้อมูลย้อนหลังเพียง %d วัน (<3 วัน) จึงไม่อ้างแนวโน้ม/surge'%nprev
def row(label,key,today,bs):
    a=avg([b.get(label,0) for b in bs]) if nprev else None
    return a
bt=[]
for t,c in byc.most_common():
    a=avg([b.get(t,0) for b in btype]); d=delta(c,a)
    bt.append({'type':t,'today':c,'avg_prev_7d':None if a is None else round(a,2),'delta_pct':d,'surge':bool(ok and a and c>=3 and d is not None and d>=50)})
bm=[]
for m,c in mo.most_common():
    a=avg([b.get(m,0) for b in bmo]); d=delta(c,a)
    bm.append({'mo':m,'today':c,'avg_prev_7d':None if a is None else round(a,2),'surge':bool(ok and c>=3 and (a is None or a==0 or (d or 0)>=50))})
pvc=collections.Counter(pv for p in P for pv in p['province'])
bp=[]
for pv,c in pvc.most_common():
    a=avg([b.get(pv,0) for b in bpv]); bp.append({'province':pv,'today':c,'avg_prev_7d':None if a is None else round(a,2)})
w('_trends.json',{'baseline':'limited' if ok else 'insufficient','window_days':7,'days_available':nprev,'note':TR_NOTE,'by_crime_type':bt,'by_mo':bm,'by_province':bp})
# BD leads
B=json.load(open('reference/budget-fy2570-police-related.json',encoding='utf-8'))
proj=B['rtp']['projects']
MAP={'CYBER':['Cybersecurity','Big Data/Analytics','AI'],'ECON':['Big Data/Analytics','Software/ระบบ'],'DRUG':['Drone/UAV','CCTV/Surveillance'],'ORGANIZED':['CCTV/Surveillance','Drone/UAV'],'TOURIST':['CCTV/Surveillance','IoT/Smart/Automation'],'TRANSNAT':['Big Data/Analytics','Network/Telecom'],'GAMBLE':['Cybersecurity','Big Data/Analytics'],'HUMAN':['Big Data/Analytics','CCTV/Surveillance'],'ROAD':['CCTV/Surveillance','IoT/Smart/Automation'],'ENV':['Drone/UAV','CCTV/Surveillance'],'VIOLENT':['CCTV/Surveillance','AI'],'PROPERTY':['CCTV/Surveillance','AI']}
leads=collections.OrderedDict()
for p in P:
    for t in MAP.get(p['crime_type_code'],[])[:1]+MAP.get(p['crime_type_code'],[])[1:2]:
        c=[x for x in proj if x['tech']==t]
        c.sort(key=lambda x:-x['budget_thb'])
        for x in c[:2]:
            e=leads.setdefault(x['name'],{'project':x['name'],'agency':x['agency'],'budget_thb':x['budget_thb'],'tech':x['tech'],'relevance':x.get('relevance'),'news_ids':[],'rationale':''})
            if p['id'] not in e['news_ids']: e['news_ids'].append(p['id'])
for e in leads.values():
    e['rationale']='ข่าววันนี้ %d เรื่องในกลุ่มที่เกี่ยวข้องกับเทคโนโลยี %s (จับคู่ตามหมวดเทคโนโลยี/หน่วยงานเท่านั้น ไม่ใช่การยืนยันความต้องการของหน่วยงาน)'%(len(e['news_ids']),e['tech'])
bd=sorted(leads.values(),key=lambda e:-len(e['news_ids']))[:12]
w('_bd_leads.json',{'date':D,'source':'reference/budget-fy2570-police-related.json','note':'จับคู่ตามหมวดเทคโนโลยี/หน่วยงานเท่านั้น ไม่ใช่การยืนยันความต้องการของหน่วยงาน','leads':bd})
# brain
units=collections.Counter(u for p in P for u in p['units']);laws=collections.Counter(l for p in P for l in p['related_laws'])
prov=collections.Counter(pv for p in P for pv in p['province'])
tl=collections.defaultdict(list)
for p in P:
    for u in (p['units'][:1] or [p['agency'].split(' > ')[-1]]): tl[u].append(p['title'][:70])
with open(out+'/_brain_daily.md','w',encoding='utf-8') as f:
    f.write('---\ngenerated: true\ndate: %s\n---\n# Second Brain รายวัน %s\n\n## entities\n- หน่วยงาน: %s\n- MO เด่น: %s\n- จังหวัด: %s\n- กฎหมายที่แหล่งระบุ: %s\n\n## timeline ต่อหน่วยงาน\n'%(D,D,', '.join('%s(%d)'%x for x in units.most_common(40)),', '.join('%s(%d)'%x for x in mo.most_common(12)),', '.join('%s(%d)'%x for x in prov.most_common(25)),', '.join(laws) or 'ไม่มี'))
    for u,t in tl.items(): f.write('- %s: %s\n'%(u,'; '.join(t)))
    f.write('\n## merge_proposal\n- status: proposed\n- ชื่อหน่วยที่อาจซ้ำ: บช.สอท. / ตำรวจไซเบอร์ / CCIB; ตม. / สตม.; ปส. / ป.ป.ส. (รอผู้ใช้ยืนยัน ห้ามรวมเอง)\n')
# md
with open(out+'/%s_crime.md'%D,'w',encoding='utf-8') as f:
    f.write('# สรุปข่าวอาชญากรรมและการปฏิบัติหน้าที่ตำรวจ %s\n\nรวม %d เหตุการณ์ (ช่วง 26–27 ต.ค. 2569)\n'%(D,len(P)))
    for t,c in byc.most_common():
        f.write('\n## %s (%d)\n'%(t,c))
        for p in P:
            if p['topic']==t: f.write('\n### %s\n- ระดับ: %s · ยืนยัน: %s · จังหวัด: %s\n- แหล่งหลัก: %s\n%s\n\n%s\n'%(p['title'],p['severity'],p['verification'],', '.join(p['province']) or '-',p['source_url'],''.join('- แหล่งอื่น: %s %s\n'%(s['name'],s['url']) for s in p['corroborating_sources']),p['content'][:1500]))
# vault
os.makedirs('vault/20_Cases',exist_ok=True)
import sys;sys.path.insert(0,'ops')
import posts_20261027_a,posts_20261027_b,posts_20261027_c,posts_20261027_d
RAW={p['id']:p for p in posts_20261027_a.POSTS}
def sn(x): return re.sub(r'[\\/:*?"<>|]','-',x)
for p in P:
    r=RAW[p['id']];e=r['ents']
    ru=[{'target':'30_Entities/Units/'+sn(n),'rel':l} for n,l in e['units']]+[{'target':'30_Entities/Places/'+sn(n),'rel':'เกิดที่'} for n in e['places']]
    rp=[{'target':'30_Entities/People/'+sn(n),'rel':l} for n,l in e['people']]+[{'target':'30_Entities/People/'+sn(n),'rel':'ผู้ต้องหา'} for n in e['suspects']]
    rpj=[{'target':'30_Entities/Projects/'+sn(n),'rel':l} for n,l in e['projects']]
    rc=[{'target':'20_Cases/'+i,'rel':l} for i,t,l in r.get('related',[])]
    J=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'))
    fm='---\ntype: case\ngenerated: true\nformat_version: 2\ncase_id: "%s"\ndate: %s\ncrime_type: "%s"\nbureau: "%s"\narea: "%s"\nstatus_th: "%s"\ngang_or_group: "%s"\nseverity: %s\nprovinces: %s\nrel_units: %s\nrel_people: %s\nrel_projects: %s\nrel_cases: %s\n---\n'%(p['id'],p['published_at'][:10],p['topic'],p['primary_bureau'],p['area'],p['status_th'],p['gang_or_group'],p['severity'],J(p['province']),J(ru),J(rp),J(rpj),J(rc))
    rel=''.join('- %s [[%s|%s]]\n'%(x['rel'],x['target'],x['target'].split('/')[-1]) for x in ru+rp+rpj+rc)
    body='\n# %s\n\n- ประเภท: [[%s]]\n%s\n%s\n\n## ข้อแนะนำประชาชน\n%s\n\n_ผู้ต้องหายังถือเป็นผู้บริสุทธิ์จนกว่าศาลจะมีคำพิพากษา_\n\n## สำหรับผู้บริหาร\n%s\n\n## วิเคราะห์\n%s\n\n## ข้อมูลกราฟของข่าวนี้\n![[graphs/%s.svg]]\n\n## แหล่งที่มา\n%s\n\n## ความสัมพันธ์\n%s'%(p['title'],p['topic'],''.join('- หน่วย: %s\n'%u for u in p['units']),p['content'],'\n'.join('- '+a for a in p['actions_public']),p['exec_blurb'],p['analysis_notes'],p['id'],'\n'.join('- [%s](%s)'%(x['name'],x['url']) for x in p['references']),rel or '- (ไม่มีเส้นไปข่าวอื่น)')
    open('vault/20_Cases/%s.md'%p['id'],'w',encoding='utf-8').write(fm+body+'\n')
os.makedirs('vault/40_CrimeTypes',exist_ok=True)
for t,c in byc.items():
    fn='vault/40_CrimeTypes/%s.md'%t
    new='\n## %s (%d คดี)\n'%(D,c)+''.join('- [[%s]] %s\n'%(p['id'],p['title']) for p in P if p['topic']==t)
    if os.path.exists(fn):
        s=open(fn,encoding='utf-8').read()
        if '## %s ('%D in s: s=s[:s.index('\n## %s ('%D)]+new if s.index('\n## %s ('%D)>=0 else s
        else: s=s.rstrip('\n')+'\n'+new
    else: s='---\ngenerated: true\ntype: crime_type\n---\n# %s\n'%t+new
    open(fn,'w',encoding='utf-8').write(s)
# html
E=html.escape
COL=['#e63946','#f4a261','#2a9d8f','#8ab4f8','#c77dff','#ffd166','#06d6a0','#ef476f','#118ab2','#b5838d','#90be6d','#ff9f1c','#4cc9f0','#f72585','#9d8189','#adb5bd']
css='@font-face{font-family:TH;src:url(fonts/THSarabun.ttf)}@font-face{font-family:TH;font-weight:bold;src:url(fonts/THSarabun.Bold.ttf)}@font-face{font-family:TH;font-style:italic;src:url(fonts/THSarabun.Italic.ttf)}@font-face{font-family:TH;font-weight:bold;font-style:italic;src:url(fonts/THSarabun.BoldItalic.ttf)}body{font-family:TH,sans-serif;font-size:15pt;line-height:1.25}'
def thai(d): return '27 ตุลาคม 2569'
rep='<html><head><meta charset=utf-8><style>%s@page{size:A4;margin:16mm}h1{font-size:28pt}h2{font-size:21pt;border-bottom:2px solid #444;margin-top:18pt}h3{font-size:16pt;margin:10pt 0 2pt}.m{color:#555;font-size:12pt}p{margin:3pt 0;white-space:pre-wrap}</style></head><body><h1>สรุปข่าวอาชญากรรมและการปฏิบัติหน้าที่ตำรวจ</h1><p>วันที่ %s · สร้างเมื่อ %s · %d เหตุการณ์ (หน้าต่างข่าว 26 ต.ค. 00:00 – 27 ต.ค. เวลารัน)</p>'%(css,thai(D),NOW[11:16],len(P))
top=byc.most_common(3)
rep+='<p><b>ภาพรวม:</b> พบ %d เหตุการณ์ จากแหล่งทางการ %d เรื่อง กลุ่มที่พบมากสุดคือ %s. มีข่าวเตือนภัย %d เรื่อง. แนวโน้ม: @@TRN@@. ผู้ต้องหายังถือเป็นผู้บริสุทธิ์จนกว่าศาลจะมีคำพิพากษา</p>'%(len(P),st['official_confirmed'],', '.join('%s (%d)'%x for x in top),st['alerts'])
for t,c in byc.most_common():
    rep+='<h2>%s (%d)</h2>'%(E(t),c)
    for p in sorted([p for p in P if p['topic']==t],key=lambda p:-{'high':2,'medium':1,'low':0}[p['severity']]):
        rep+='<h3>%s</h3><div class=m>ระดับ: %s · ยืนยัน: %s · %s · แหล่ง: %d</div><p>%s</p>'%(E(p['title']),p['severity'],p['verification'],E(', '.join(p['province'])),p['source_count'],E(p['content'][:1100]+('…' if len(p['content'])>1100 else '')))
rep+='<h2>ภาคผนวก: Hotspot</h2>'+''.join('<p>%s (%s): %d</p>'%(E(h['province']),E(h['region']),h['count']) for h in hot[:15])
rep+='<h2>บทวิเคราะห์ Second Brain</h2><p>หน่วยที่ปรากฏ: %s</p><h2>ข้อเสนอธุรกิจ × งบ 2570</h2>'%E(', '.join('%s(%d)'%x for x in units.most_common(15)))+''.join('<p>%s — %s ล้านบาท (%s) · ข่าวที่เกี่ยวข้อง %d</p>'%(E(e['project'][:110]),'{:,.1f}'.format(e['budget_thb']/1e6),e['tech'],len(e['news_ids'])) for e in bd)+'<p class=m>จับคู่ตามหมวดเทคโนโลยีเท่านั้น ไม่ใช่การยืนยันความต้องการของหน่วยงาน</p></body></html>'
TRI=(('surge: '+', '.join(x['type'] for x in bt if x['surge'])) if any(x['surge'] for x in bt) else 'ไม่พบ surge')+' (baseline %d วัน)'%nprev
rep=rep.replace('@@TRN@@',E(TR_NOTE))
open(out+'/%s_crime.html'%D,'w',encoding='utf-8').write(rep)
# infographic
mx=max(byc.values());bars=''
for i,(t,c) in enumerate(byc.most_common()):
    bars+='<div class=r><span class=l>%s</span><div class=b style="width:%d%%;background:%s"></div><span class=n>%d</span></div>'%(E(t),c/mx*60,COL[i%16],c)
hb=''.join('<div class=r><span class=l>%s</span><div class=b style="width:%d%%;background:#4cc9f0"></div><span class=n>%d</span></div>'%(E(h['province']),h['count']/hot[0]['count']*60,h['count']) for h in hot[:5])
chips=''.join('<span class=c>%s · %d</span>'%(E(t),c) for t,c in tg.most_common(10))
feat=''.join('<div class=cd><b>%s</b><br><span class=m>%s · %s · %s</span></div>'%(E(p['title']),E(p['topic']),p['severity'],'ทางการ' if p['verification']=='official_confirmed' else 'สื่อ') for p in [p for p in P if p['severity']=='high'][:5])
adv=''.join('<li>%s</li>'%E(a) for a in dict.fromkeys(x for p in al for x in p['actions_public'] if x!='N/A'))
adv='<ul>'+''.join(list(dict.fromkeys(re.findall(r'<li>.*?</li>',adv)))[:5])+'</ul>'
roles=collections.Counter(p['police_role'] for p in P if p['police_role'])
kp=lambda v:('—' if not v else '{:,}'.format(int(v)))
inf='<html><head><meta charset=utf-8><style>%sbody{width:1080px;margin:0;background:#101826;color:#eef;padding:30px;box-sizing:border-box;font-size:22px}h1{font-size:44px;margin:0}h2{font-size:30px;color:#ffd166;margin:26px 0 8px}.k{display:flex;gap:12px}.k div{flex:1;background:#1b2740;border-radius:12px;padding:12px;text-align:center}.k b{display:block;font-size:40px;color:#06d6a0}.r{display:flex;align-items:center;gap:8px;margin:4px 0}.l{width:42%%;font-size:20px}.b{height:20px;border-radius:4px}.n{font-weight:bold}.c{display:inline-block;background:#26385c;border-radius:16px;padding:2px 12px;margin:3px}.cd{background:#1b2740;border-radius:10px;padding:10px;margin:6px 0}.m{color:#9ab;font-size:18px}li{margin:4px 0}.ft{font-size:17px;color:#9ab;margin-top:24px}</style></head><body><h1>สรุปข่าวอาชญากรรมและการปฏิบัติหน้าที่ตำรวจ</h1><div class=m>27 ตุลาคม 2569 · สร้างเมื่อ %s</div><h2>ตัวเลขสำคัญ</h2><div class=k><div><b>%d</b>ข่าว</div><div><b>%s</b>ผู้ต้องหาถูกจับ</div><div><b>%s</b>ความเสียหาย (บาท)</div><div><b>%s</b>ของกลางที่ยึด (บาท)</div><div><b>%d</b>เตือนภัย</div></div><h2>สัดส่วนตามประเภท</h2>%s<div class=m>แนวโน้ม: @@TRI@@</div><h2>Top 5 จังหวัด</h2>%s<h2>Top Tags</h2>%s<h2>ข่าวเด่น</h2>%s<h2>บทบาทตำรวจ</h2>%s<h2>เตือนภัยประชาชน</h2>%s<div class=ft>แหล่ง: เว็บทางการ ตร./ดีอี/ThaiCERT/DSI และสื่อไทย-อังกฤษ · ข้อมูลรวบรวมจากแหล่งข่าวสาธารณะ ผู้ต้องหายังถือเป็นผู้บริสุทธิ์จนกว่าศาลจะมีคำพิพากษา</div></body></html>'%(css,NOW[11:16],len(P),kp(st['total_arrested']),kp(st['total_loss_thb']),kp(st['total_seized_value_thb']),st['alerts'],bars,hb,chips,feat,''.join('<span class=c>%s · %d</span>'%(E(r),c) for r,c in roles.most_common()),adv)
inf=inf.replace('@@TRI@@',E(TRI))
open(out+'/%s_infographic.html'%D,'w',encoding='utf-8').write(inf)
print(st['total'],len(bd),len(hot),st['total_arrested'])
