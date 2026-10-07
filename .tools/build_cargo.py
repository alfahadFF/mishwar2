import sys, re, subprocess
sys.path.insert(0,'/home/user/.tools')
from picker_parts import CSS, HTML, JS
common=open('/home/user/.tools/cargo_common.js').read()
route_js=JS[:JS.index('// ===== اسم المكان')]
def build(tpl,out,parts):
    s=open(tpl).read()
    for k,v in parts.items():
        assert k in s, k
        s=s.replace(k, lambda_safe(v))
    open(out,'w').write(s)
def lambda_safe(v): return v
build('/home/user/.tools/transport_tpl.html','/home/user/naql-transport-final.html',
      {'/*@@PICKER_CSS@@*/':CSS,'<!--@@PICKER_HTML@@-->':HTML,'/*@@CARGO_JS@@*/':common,'/*@@PICKER_JS@@*/':JS})
build('/home/user/.tools/carrier_tpl.html','/home/user/naql-carrier.html',
      {'/*@@CARGO_JS@@*/':common,'/*@@ROUTE_JS@@*/':route_js})
events=open('/home/user/.tools/events_common.js').read()
build('/home/user/.tools/events_tpl.html','/home/user/naql-events.html',
      {'/*@@CARGO_JS@@*/':common,'/*@@EVENTS_JS@@*/':events})
build('/home/user/.tools/events_driver_tpl.html','/home/user/naql-events-driver.html',
      {'/*@@CARGO_JS@@*/':common,'/*@@EVENTS_JS@@*/':events,'/*@@ROUTE_JS@@*/':route_js})
for f in ['naql-transport-final.html','naql-carrier.html','naql-events.html','naql-events-driver.html']:
    s=open('/home/user/'+f).read()
    open('/tmp/x.js','w').write('\n;\n'.join(re.findall(r'<script>(.*?)</script>',s,re.S)))
    r=subprocess.run(['node','--check','/tmp/x.js'],capture_output=True,text=True); print(f,'OK' if r.returncode==0 else r.stderr[:600])
