import re, sys
sys.path.insert(0,'/home/user/.tools')
from picker_parts import CSS, HTML, JS

def must(s, old, new, label):
    if old not in s: raise SystemExit('MISSING: '+label)
    return s.replace(old, new, 1)
def must_re(s, pat, new, label):
    s2, n = re.subn(pat, lambda m: new, s, count=1, flags=re.S)
    if not n: raise SystemExit('MISSING RE: '+label)
    return s2

# ================= العقود =================
p='naql-contracts.html'; s=open(p).read()
s=must(s,'</style>',CSS+'</style>','css')
s=must(s,'<div id="toast" class="toast"></div>',HTML+'<div id="toast" class="toast"></div>','html')
s=must_re(s,r'<div id="pickupList"></div>\s*<button[^>]*addPickup\(\)[^>]*>[^<]*</button>\s*<div id="mapPickup"[^>]*></div>',
 '<div id="pickupList"></div>\n<button class="addPt" onclick="addPoint(\'pickups\')">＋ إضافة مكان انطلاق</button>','pickups html')
s=must_re(s,r'<div id="destList"></div>\s*<button[^>]*addDest\(\)[^>]*>[^<]*</button>\s*<div id="mapDest"[^>]*></div>',
 '<div id="destList"></div>\n<button class="addPt" onclick="addPoint(\'dests\')">＋ إضافة وجهة</button>','dests html')
s=must_re(s,r'<div id="dropList"></div>\s*<button[^>]*addDrop\(\)[^>]*>[^<]*</button>',
 '<div id="dropList"></div>\n<button class="addPt" onclick="addPoint(\'drops\')">＋ إضافة مكان تنزيل</button>','drops html')
s=must(s,'<!-- الأيام -->','<!-- مسار الرحلة الفعلي -->\n<div class="section" id="tripBox" style="display:none">\n<h2>🛣️ مسار الرحلة</h2>\n<div id="tripMap" class="tripMap"></div>\n<div class="tripInfo" id="tripInfo"></div>\n</div>\n\n<!-- الأيام -->','tripbox')
s=must(s,"let pickups=[{name:''}], dests=[{name:'', rt:''}], drops=[{name:''}]",
 "let pickups=[{ll:null,label:''}], dests=[{ll:null,label:'',rt:''}], drops=[{ll:null,label:''}]",'vars')
s=must_re(s,r"function initMaps\(\)\{.*?\n\}\n","function initMaps(){ renderPoints('pickups'); renderPoints('dests'); renderPoints('drops'); drawTrip() }\n",'initMaps')
s=must_re(s,r"function addPickup\(\)\{.*?\nfunction toggleDrop\(\)\{",
r"""const DEFAULT_CENTER=defaultCenter
const POINTS={
 pickups:{box:'pickupList', get:()=>pickups, title:'مكان الانطلاق', letter:'A', color:'#16a34a', removable:true},
 dests:{box:'destList', get:()=>dests, title:'الوجهة', letter:'B', color:'#4F46E5', removable:true,
   extra:(i,it)=> isWork()? '' : `<div style="display:flex;align-items:center;gap:6px;margin-top:6px"><span style="font-size:10px;color:#64748b">ساعة العودة</span><input type="time" class="input" style="height:32px;max-width:110px;font-size:12px" value="${it.rt||''}" onchange="dests[${i}].rt=this.value"></div>`},
 drops:{box:'dropList', get:()=>drops, title:'مكان التنزيل', letter:'C', color:'#dc2626', removable:true},
}
function renderPickups(){ renderPoints('pickups') }
function renderDests(){ renderPoints('dests') }
function renderDrops(){ renderPoints('drops') }
function addDrop(){ addPoint('drops') }
function onPointsChanged(){ updatePublish(); drawTrip() }
function dropDifferent(){ return document.getElementById('dropSame').value==='different' }
function tripSegments(){
 const P=pickups.filter(p=>p.ll).map(p=>p.ll), D=dests.filter(d=>d.ll).map(d=>d.ll)
 if(!P.length || !D.length) return []
 const segs=[{key:'outbound', name:'الذهاب', icon:'🛣️', color:'#4F46E5', pts:[...P,...D]}]
 const R= dropDifferent()? drops.filter(d=>d.ll).map(d=>d.ll) : P.slice().reverse()
 if(R.length) segs.push({key:'return', name:'العودة', icon:'↩️', color:'#16a34a', cls:'ret', pts:[...D.slice().reverse(),...R]})
 return segs
}
function tripMarkers(){
 const m=[]
 pickups.forEach((p,i)=> p.ll && m.push({ll:p.ll, txt:'A'+(i+1), color:'#16a34a'}))
 dests.forEach((d,i)=> d.ll && m.push({ll:d.ll, txt:'B'+(i+1), color:'#4F46E5'}))
 if(dropDifferent()) drops.forEach((d,i)=> d.ll && m.push({ll:d.ll, txt:'C'+(i+1), color:'#dc2626'}))
 return m
}
function toggleDrop(){""",'render fns')
s=must(s," if(v==='different' && drops.length===0) addDrop()\n"," if(v==='different' && drops.length===0) addDrop()\n renderPoints('drops'); onPointsChanged()\n",'toggleDrop')
s=must(s," const hasPick=pickups.some(p=>p.name.trim())\n const hasDest=dests.some(d=>d.name.trim())\n if(!hasPick || !hasDest){ btn.disabled=true; btn.textContent='حدد أماكن الانطلاق والوجهات'; return }",
 " const hasPick=pickups.some(p=>p.ll)\n const hasDest=dests.some(d=>d.ll)\n if(!hasPick || !hasDest){ btn.disabled=true; btn.textContent='حدد أماكن الانطلاق والوجهات على الخريطة'; return }\n if(dropDifferent() && !drops.some(d=>d.ll)){ btn.disabled=true; btn.textContent='حدد أماكن التنزيل على الخريطة'; return }",'publish checks')
s=must(s,"   pickup_points: pickups.filter(p=>p.name.trim()).map(p=>({name:p.name})),","   pickup_points: pickups.filter(p=>p.ll).map(p=>({label:p.label, lat:p.ll[0], lng:p.ll[1]})),",'pl pick')
s=must(s,"   destinations: dests.filter(d=>d.name.trim()).map(d=>({name:d.name, rt:d.rt||null})),","   destinations: dests.filter(d=>d.ll).map(d=>({label:d.label, lat:d.ll[0], lng:d.ll[1], rt:d.rt||null})),",'pl dest')
s=must(s,"   drop_points: document.getElementById('dropSame')?.value==='same'? null : drops.filter(d=>d.name.trim()).map(d=>({name:d.name})),",
 "   drop_points: dropDifferent()? drops.filter(d=>d.ll).map(d=>({label:d.label, lat:d.ll[0], lng:d.ll[1]})) : null,\n   route_info: window.lastTrip||null, // مسافة ومدة الطريق الفعلي — معلومة فقط، لا تدخل في السعر",'pl drop')
s=must(s,"showToast((budgetType==='quote'?'📩 طلب عروض\\n':'📢 نشر عقد\\n')+JSON.stringify(payload,null,2))","showToast(budgetType==='quote'? 'تم إرسال طلب عروض الأسعار' : 'تم نشر العقد')",'toast')
s=must(s,"renderVehicles(); updateDurationInfo(); setShift('morning')\n</script>", JS+"\nrenderVehicles(); updateDurationInfo(); setShift('morning')\n</script>",'js')
open(p,'w').write(s); print('contracts OK')

# ================= المناسبات =================
p='naql-events.html'; s=open(p).read()
s=must(s,'</style>',CSS+'</style>','css')
s=must(s,'<div id="toast" class="toast"></div>',HTML+'<div id="toast" class="toast"></div>','html')
s=must(s,'حدد نقطة التجمع والوجهات بدقة على الخريطة — اسحب الدبوس','حدد نقطة التجمع والوجهات من الخريطة','hint')
s=must_re(s,r'<div style="margin-bottom:8px">\s*<label[^>]*>نقطة التجمع</label>.*?<div id="mapGather" class="leaflet-map"></div>\s*<p[^>]*>[^<]*</p>',
 '<div id="gatherBox"></div>','gather html')
s=must_re(s,r'<div id="destList"></div>\s*<button[^>]*addDest\(\)[^>]*>[^<]*</button>',
 '<div id="destList"></div>\n<button class="addPt" onclick="addDest()">＋ إضافة وجهة</button>','dest html')
s=must_re(s,r'<div id="mapRoute" class="leaflet-map"[^>]*></div>\s*<p[^>]*>[^<]*</p>','','maproute html')
s=must_re(s,r'<div style="margin-top:10px">\s*<label[^>]*>نقطة التجمع النهائية / الوصول الأخيرة</label>\s*<input id="finalPoint"[^>]*>\s*</div>',
 '<div id="finalBox"></div>\n<div id="tripBox" style="display:none;margin-top:10px">\n<label style="font-size:12px;font-weight:800">🛣️ مسار الرحلة</label>\n<div id="tripMap" class="tripMap"></div>\n<div class="tripInfo" id="tripInfo"></div>\n</div>','final html')
s=must(s,"let dests=[]","let dests=[], gather=[{ll:null,label:''}], finalPt=[{ll:null,label:''}]",'vars')
s=must_re(s,r"function initMaps\(\)\{.*?\nfunction setType",
r"""const DEFAULT_CENTER=[33.5138, 36.2765]
const POINTS={
 gather:{box:'gatherBox', get:()=>gather, title:'نقطة التجمع', letter:'📍', color:'#16a34a', single:true},
 dests:{box:'destList', get:()=>dests, title:'الوجهة', letter:'', color:'#4F46E5', removable:true},
 finalPt:{box:'finalBox', get:()=>finalPt, title:'نقطة الوصول الأخيرة', letter:'🏁', color:'#dc2626', single:true, optional:true},
}
function initMaps(){ renderPoints('gather'); renderPoints('dests'); renderPoints('finalPt'); drawTrip() }
function updateRoute(){ drawTrip() }
function onPointsChanged(){ updatePublish(); drawTrip() }
function tripSegments(){
 const G=gather[0].ll, D=dests.filter(d=>d.ll).map(d=>d.ll)
 if(!G || !D.length) return []
 const segs=[{key:'outbound', name:'الذهاب', icon:'🛣️', color:'#4F46E5', pts:[G,...D]}]
 segs.push({key:'return', name:'العودة', icon:'↩️', color:'#16a34a', cls:'ret', pts:[D[D.length-1], finalPt[0].ll || G]})
 return segs
}
function tripMarkers(){
 const m=[]
 if(gather[0].ll) m.push({ll:gather[0].ll, txt:'تجمع', color:'#16a34a'})
 dests.forEach((d,i)=> d.ll && m.push({ll:d.ll, txt:String(i+1), color:'#4F46E5'}))
 if(finalPt[0].ll) m.push({ll:finalPt[0].ll, txt:'🏁', color:'#dc2626'})
 return m
}
function setType""",'initMaps block')
s=must_re(s,r"function addDest\(\)\{.*?\nfunction renderDests\(\)\{.*?\n\}\n",
 "function addDest(){ addPoint('dests') }\nfunction renderDests(){ renderPoints('dests') }\n",'dests fns')
s=must(s," const hasGather=document.getElementById('gatherPoint').value.trim()\n const hasDest=dests.some(d=>d.name.trim())",
 " const hasGather=!!gather[0].ll\n const hasDest=dests.some(d=>d.ll)",'checks')
s=must(s,"   gathering_point: document.getElementById('gatherPoint').value.trim(),\n   gathering_latlng: gatherLatLng,",
 "   gathering_point: gather[0].label,\n   gathering_latlng: gather[0].ll,",'pl gather')
s=must(s,"   destinations: dests.filter(d=>d.name.trim()).map(d=>({name:d.name})),","   destinations: dests.filter(d=>d.ll).map(d=>({label:d.label, lat:d.ll[0], lng:d.ll[1]})),",'pl dests')
s=must(s,"   final_point: document.getElementById('finalPoint').value.trim()||null,",
 "   final_point: finalPt[0].ll? {label:finalPt[0].label, lat:finalPt[0].ll[0], lng:finalPt[0].ll[1]} : null,\n   route_info: window.lastTrip||null, // مسافة ومدة الطريق الفعلي — معلومة فقط، لا تدخل في السعر",'pl final')
s=must(s,"showToast((budgetType==='quote' ? '📩 طلب عروض أسعار\\n' : '📢 نشر الطلب\\n')+ JSON.stringify(payload,null,2))","showToast(budgetType==='quote'? 'تم إرسال طلب عروض الأسعار' : 'تم نشر الطلب')",'toast')
idx=s.rfind('renderVehicles()\n</script>')
if idx<0: raise SystemExit('MISSING end')
s=s[:idx]+JS+"\n"+s[idx:]
open(p,'w').write(s); print('events OK')
