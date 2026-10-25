import json,hashlib,re,sys
RAW='News/Articles/_raw/2026-10-25'
rv={o[0]:o for o in json.load(open(f'{RAW}/_review.json'))}
for spec in sys.argv[1:]:
    i,s,e=map(int,spec.split(':'))
    u=rv[i][3]; d=json.load(open(f"{RAW}/A_{hashlib.md5(u.encode()).hexdigest()[:12]}.json"))
    b=re.sub(r'\s+',' ',d['body'])
    print('[%d] %s\n%s\n'%(i,rv[i][4][:60],b[s:e]))
