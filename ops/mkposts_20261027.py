# -*- coding: utf-8 -*-
import sys,json,re,glob,os
sys.path.insert(0,'ops')
import posts_20261027_b,posts_20261027_c,posts_20261027_d
from posts_20261027_a import POSTS
TOP={'CYBER':'อาชญากรรมไซเบอร์และออนไลน์','ECON':'คดีเศรษฐกิจ การเงิน และฟอกเงิน','DRUG':'ยาเสพติด','HUMAN':'ค้ามนุษย์ แรงงานผิดกฎหมาย และคุ้มครองเด็ก','VIOLENT':'คดีชีวิต ร่างกาย และเพศ','PROPERTY':'คดีทรัพย์สิน','ORGANIZED':'คดีอุกฉกรรจ์ ผู้มีอิทธิพล และอาวุธ','GAMBLE':'พนันและบ่อนผิดกฎหมาย','CONSUMER':'คุ้มครองผู้บริโภคและสินค้าผิดกฎหมาย','TOURIST':'อาชญากรรมที่เกี่ยวข้องกับนักท่องเที่ยวและชาวต่างชาติ','ROAD':'ความปลอดภัยทางหลวงและการสกัดจับ','ENV':'สิ่งแวดล้อม ทรัพยากร และสัตว์ป่า','PUBLIC':'ความสงบเรียบร้อยและความมั่นคงภายใน','CORRUPT':'ทุจริตและประพฤติมิชอบของเจ้าหน้าที่รัฐ','POLICE':'การปฏิบัติหน้าที่ ประชาสัมพันธ์ และนโยบายตำรวจ','TRANSNAT':'อาชญากรรมข้ามชาติและความร่วมมือระหว่างประเทศ','OTHER':'อื่น ๆ'}
reg={}
for f in glob.glob('github-pages/data/*_crime.json'):
    for p in json.load(open(f,encoding='utf-8')).get('posts',[]):
        for pv,rg in zip(p.get('province',[]),p.get('region',[]) or []): reg[pv]=rg
reg.update({'มุกดาหาร':'ภาคตะวันออกเฉียงเหนือ','กาฬสินธุ์':'ภาคตะวันออกเฉียงเหนือ','ชัยภูมิ':'ภาคตะวันออกเฉียงเหนือ','สุพรรณบุรี':'ภาคกลาง','นครสวรรค์':'ภาคกลาง','ลำพูน':'ภาคเหนือ','ตาก':'ภาคตะวันตก' if False else reg.get('ตาก','ภาคกลาง')})
reg.update({'สงขลา':'ภาคใต้','ยะลา':'ภาคใต้','นครศรีธรรมราช':'ภาคใต้','ตรัง':'ภาคใต้','นนทบุรี':'กรุงเทพฯ และปริมณฑล','ปทุมธานี':'กรุงเทพฯ และปริมณฑล','สมุทรปราการ':'กรุงเทพฯ และปริมณฑล','กรุงเทพมหานคร':'กรุงเทพฯ และปริมณฑล','ชลบุรี':'ภาคตะวันออก','ขอนแก่น':'ภาคตะวันออกเฉียงเหนือ','แม่ฮ่องสอน':'ภาคเหนือ'})
reg.update({'กระบี่':'ภาคใต้','อำนาจเจริญ':'ภาคตะวันออกเฉียงเหนือ','ชุมพร':'ภาคใต้','แพร่':'ภาคเหนือ','ภูเก็ต':'ภาคใต้','ฉะเชิงเทรา':'ภาคตะวันออก','ระยอง':'ภาคตะวันออก','ชลบุรี':'ภาคตะวันออก','นครปฐม':'ภาคกลาง','สมุทรสาคร':'ภาคกลาง'})
def notes(p):
    rel=p.get('related',[])
    cn=('; '.join('%s %s (%s)'%(r,t[:60],i) for i,t,r in rel)) if rel else 'ไม่มีเส้นไปข่าวอื่น — ไม่ใช่เหตุการณ์เดียวกันหรือการติดตามผลที่ชี้ได้'
    cau='ผู้ถูกกล่าวหายังไม่ถือว่ากระทำผิดจนกว่าศาลจะพิพากษา'
    if p.get('protect'): cau+=' ไม่ระบุตัวตนผู้เสียหายและผู้เยาว์ตามหลักคุ้มครอง'
    return '\n'.join(['- เหตุการณ์: '+p['ev'],'- หน่วยและสถานะ: '+p['unitline'],'- ตัวเลขในข่าว: '+p['num'],'- ชื่อกลุ่มที่ข่าวระบุ: '+p['grp'],'- ความเชื่อมโยง: '+cn,'- ข้อควรระวัง: '+cau])
out=[];miss=set()
for p in POSTS:
    c=p['code']
    for pv in p['prov']:
        if pv not in reg: miss.add(pv)
    out.append({'id':p['id'],'slug':p['id'],'title':p['title'],'topic':TOP[c],'secondary_topics':[TOP[s] for s in p.get('sec',[]) if s in TOP],
     'agency':p['agency'],'origin':p['origin'],'priority':p['prio'],'severity':p['sev'],'verification':p['ver'],'case_stage':p['stage'],'police_role':p['role'],
     'province':p['prov'],'region':list(dict.fromkeys(reg.get(x,'') for x in p['prov'])),'alert':p['alert'],'impersonation':p['imp'],'is_clarification':False,
     'content':p['content'],'source_url':p['src'],'corroborating_sources':[{'name':n,'url':u} for n,u in p.get('corr',[])],
     'actions_public':(p.get('pa') or ['N/A'])[:2]+['N/A']*(2-len((p.get('pa') or [])[:2])),'actions_org':(p.get('ao') or ['N/A'])[:2]+['N/A']*(2-len((p.get('ao') or [])[:2])),
     'police_performance':{'operation':p.get('op','N/A'),'units_involved':p['units'],'outcome':p.get('outcome','N/A'),'note':p.get('note','N/A')},
     'stats':p['stats'],'format_version':2,'primary_bureau':p['bureau'],'area':p['area'],'status_th':p['status_th'],'gang_or_group':p['gang'],'exec_blurb':p['exec'],'analysis_notes':notes(p),'related_cases':[{'id':i,'title':t,'relation':r} for i,t,r in p.get('related',[])],'references':[{'name':'แหล่งหลัก','url':p['src']}]+[{'name':n,'url':u} for n,u in p.get('corr',[])],'tags':p['tags'],'category_label':TOP[c],'published_at':p['pub'],'crime_type_code':c,'secondary_codes':p.get('sec',[]),
     'units':p['units'],'modus_operandi':p.get('mo',[]),'scale':p.get('scale',''),'is_police_pr':p['origin']=='direct','related_laws':p.get('laws',[]),'trend_signal':'N/A','source_count':1+len(p.get('corr',[]))})
# checks
bad=[(o['id'],len(o['tags'])) for o in out if not 3<=len(o['tags'])<=5]
print('posts',len(out),'missing region',miss,'bad tags',bad)
out.sort(key=lambda o:({'high':0,'medium':1,'low':2}[o['severity']],o['published_at']))
json.dump(out,open('ops/run/posts_20261027.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
