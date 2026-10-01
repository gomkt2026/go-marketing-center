# Injects i18n/<lang>.json into index.html between the I18N_DATA markers.
import json,re
SKIP_PREFIX='Homigo社宅包租代管中心Washgo'
d={}
for l in ['en','ja','vi','id']:
    j=json.load(open(f'i18n/{l}.json',encoding='utf8'))
    d[l]={k:v for k,v in j.items() if not k.startswith(SKIP_PREFIX)}
blob=json.dumps(d,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
s=open('index.html',encoding='utf8').read()
s,n=re.subn(r'/\*I18N_DATA_START\*/.*?/\*I18N_DATA_END\*/',lambda m:'/*I18N_DATA_START*/'+blob+'/*I18N_DATA_END*/',s,flags=re.S)
assert n==1
open('index.html','w',encoding='utf8').write(s)
print('injected',{l:len(v) for l,v in d.items()},'bytes',len(blob.encode()))
