CSS = r"""
/* ===== اختيار النقاط من الخريطة ===== */
.pt{display:flex;align-items:center;gap:10px;border:1.5px solid #e2e8f0;border-radius:14px;padding:10px;background:#fff;margin-top:8px}
.ptBadge{min-width:30px;height:30px;border-radius:999px;color:#fff;font-weight:900;font-size:12px;display:grid;place-items:center;flex-shrink:0}
.ptBody{flex:1;min-width:0}
.ptTitle{font-size:12px;font-weight:900}
.ptLabel{font-size:11px;color:#334155;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ptLabel.empty{color:#94a3b8}
.ptBtn{height:36px;padding:0 12px;border-radius:10px;border:1.5px dashed #cbd5e1;background:#fff;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;color:#0f172a}
.ptBtn.has{border-style:solid;border-color:#c7d2fe;background:#eef2ff;color:#4F46E5}
.ptX{width:30px;height:30px;border-radius:999px;border:1px solid #fecaca;background:#fff;color:#991b1b;cursor:pointer;flex-shrink:0}
.addPt{margin-top:8px;height:38px;width:100%;border-radius:12px;border:1.5px dashed #c7d2fe;background:#f8faff;color:#4F46E5;font-weight:900;font-size:12px;cursor:pointer}
.pkOverlay{position:fixed;inset:0;z-index:2000;background:#fff;display:none;flex-direction:column;max-width:560px;margin:0 auto}
.pkOverlay.open{display:flex}
.pkHead{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #e2e8f0}
.pkHead b{font-size:15px}
.pkHead button{width:34px;height:34px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;font-size:14px}
.pkMapWrap{flex:1;position:relative}
#pkMap{position:absolute;inset:0}
.pkHint{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:500;background:rgba(15,23,42,.85);color:#fff;font-size:11px;font-weight:800;padding:6px 12px;border-radius:999px;white-space:nowrap;pointer-events:none}
.pkMy{position:absolute;bottom:12px;left:12px;z-index:500;height:40px;padding:0 12px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;font-weight:800;font-size:12px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.12)}
.pkBar{padding:12px 14px;border-top:1px solid #e2e8f0;background:#fff}
.pkLabel{font-size:13px;font-weight:800;min-height:20px;color:#0f172a}
.pkLabel.empty{color:#94a3b8;font-weight:700}
.pkConfirm{width:100%;height:46px;border-radius:12px;border:none;background:#4F46E5;color:#fff;font-weight:900;font-size:14px;cursor:pointer;margin-top:10px}
.pkConfirm:disabled{background:#cbd5e1;color:#64748b}
.tripMap{height:220px;border-radius:12px;border:1.5px solid #e2e8f0;overflow:hidden;margin-top:10px}
.tripInfo{margin-top:8px;display:grid;gap:6px}
.tripInfo div{background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:900;text-align:center}
.tripInfo div.ret{background:#f0fdf4;border-color:#a7f3d0;color:#065f46}
.tripInfo div.err{background:#fef2f2;border-color:#fecaca;color:#991b1b}
"""

HTML = r"""
<div class="pkOverlay" id="pkOverlay">
 <div class="pkHead"><b id="pkTitle">حدد النقطة</b><button onclick="closePicker()">✕</button></div>
 <div class="pkMapWrap"><div id="pkMap"></div><div class="pkHint">اضغط على الخريطة لتحديد الموقع</div><button class="pkMy" onclick="pickerMyLoc()">🎯 موقعي</button></div>
 <div class="pkBar"><div class="pkLabel empty" id="pkLabel">لم يتم تحديد موقع بعد</div><button class="pkConfirm" id="pkConfirm" disabled onclick="pickerConfirm()">تأكيد الموقع</button></div>
</div>
"""

JS = r"""
// ===== توجيه حقيقي على الطرق (OSRM) =====
const ROUTE_CACHE={}
async function getRoute(points){
 const key=points.map(p=>p[0].toFixed(5)+','+p[1].toFixed(5)).join(';')
 if(ROUTE_CACHE[key]) return ROUTE_CACHE[key]
 const coords=points.map(p=>p[1]+','+p[0]).join(';')
 const ctrl=new AbortController(); const tm=setTimeout(()=>ctrl.abort(),12000)
 try{
   const r=await fetch('https://router.project-osrm.org/route/v1/driving/'+coords+'?overview=full&geometries=geojson',{signal:ctrl.signal})
   const j=await r.json()
   if(j.code!=='Ok'||!j.routes||!j.routes.length) throw new Error('no route')
   const rt=j.routes[0]
   const res={ok:true, km:rt.distance/1000, min:rt.duration/60, latlngs:rt.geometry.coordinates.map(c=>[c[1],c[0]])}
   ROUTE_CACHE[key]=res; return res
 }catch(e){ return {ok:false} } finally{ clearTimeout(tm) }
}
function fmtMin(m){ m=Math.round(m); return m<60? m+' د' : Math.floor(m/60)+' س '+(m%60)+' د' }

// ===== اسم المكان من الخريطة (بدون كتابة) =====
const GEO_CACHE={}
async function placeName(ll){
 const key=ll[0].toFixed(5)+','+ll[1].toFixed(5)
 if(GEO_CACHE[key]) return GEO_CACHE[key]
 try{
   const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=ar&lat='+ll[0]+'&lon='+ll[1])
   const j=await r.json(); const a=j.address||{}
   const parts=[a.road||a.pedestrian||a.amenity||a.building, a.neighbourhood||a.suburb||a.quarter||a.city_district, a.city||a.town||a.village||a.state]
     .filter(Boolean).filter((v,i,arr)=> arr.indexOf(v)===i)
   const name=parts.length? parts.join('، ') : 'موقع محدد على الخريطة'
   GEO_CACHE[key]=name; return name
 }catch(e){ return 'موقع محدد على الخريطة' }
}

// ===== نافذة اختيار نقطة =====
const PK={map:null, marker:null, ll:null, label:'', cb:null, color:'#4F46E5', req:0}
function pkIcon(c){ return L.divIcon({html:`<div style="background:${c};width:26px;height:26px;border-radius:999px 999px 999px 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35)"></div>`, iconSize:[26,26], iconAnchor:[13,26]}) }
function openPicker(title,color,current,cb){
 PK.cb=cb; PK.color=color; PK.ll=null; PK.label=''
 document.getElementById('pkTitle').textContent=title
 document.getElementById('pkOverlay').classList.add('open')
 document.body.style.overflow='hidden'
 setTimeout(()=>{
   if(!PK.map){
     PK.map=L.map('pkMap',{zoomControl:false}).setView(DEFAULT_CENTER,13)
     L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',{maxZoom:19}).addTo(PK.map)
     PK.map.on('click', e=> pickerSet([e.latlng.lat,e.latlng.lng]))
   }
   PK.map.invalidateSize()
   if(PK.marker){ PK.map.removeLayer(PK.marker); PK.marker=null }
   if(current){ pickerSet(current); PK.map.setView(current,15) } else { setPkLabel(null) }
 },60)
}
function setPkLabel(t, loading){
 const el=document.getElementById('pkLabel'), btn=document.getElementById('pkConfirm')
 if(!t){ el.textContent='لم يتم تحديد موقع بعد'; el.className='pkLabel empty'; btn.disabled=true; return }
 el.textContent=(loading?'⏳ ':'📍 ')+t; el.className='pkLabel'; btn.disabled=!!loading
}
async function pickerSet(ll){
 PK.ll=ll
 if(PK.marker) PK.marker.setLatLng(ll); else PK.marker=L.marker(ll,{icon:pkIcon(PK.color)}).addTo(PK.map)
 const my=++PK.req
 setPkLabel('جاري تحديد اسم المكان...', true)
 const name=await placeName(ll)
 if(my!==PK.req) return
 PK.label=name; setPkLabel(name)
}
function pickerMyLoc(){
 if(!navigator.geolocation) return showToast('تعذر تحديد موقعك')
 navigator.geolocation.getCurrentPosition(p=>{ const ll=[p.coords.latitude,p.coords.longitude]; PK.map.setView(ll,16); pickerSet(ll) }, ()=> showToast('لم يتم السماح بالوصول للموقع'))
}
function closePicker(){ document.getElementById('pkOverlay').classList.remove('open'); document.body.style.overflow='' }
function pickerConfirm(){
 if(!PK.ll) return
 const ll=PK.ll, label=PK.label||'موقع محدد على الخريطة', cb=PK.cb
 closePicker(); if(cb) cb(ll,label)
}

// ===== بطاقات النقاط =====
function pointRowHtml(kind,i,item,cfg){
 const n=cfg.single? '' : (i+1)
 return `<div class="pt"><div class="ptBadge" style="background:${cfg.color}">${cfg.letter}${n}</div>
  <div class="ptBody"><div class="ptTitle">${cfg.title}${cfg.single?'':' '+n}</div><div class="ptLabel ${item.ll?'':'empty'}">${item.ll? item.label : (cfg.optional? 'اختياري — لم تُحدد' : 'لم تُحدد بعد')}</div>${cfg.extra? cfg.extra(i,item):''}</div>
  <button class="ptBtn ${item.ll?'has':''}" onclick="pickPoint('${kind}',${i})">${item.ll?'✏️ تغيير':'📍 حدد على الخريطة'}</button>
  ${(cfg.removable && i>0) || (cfg.optional && item.ll)? `<button class="ptX" onclick="removePoint('${kind}',${i})">✕</button>`:''}</div>`
}
function renderPoints(kind){
 const cfg=POINTS[kind], box=document.getElementById(cfg.box); if(!box) return
 box.innerHTML=cfg.get().map((it,i)=> pointRowHtml(kind,i,it,cfg)).join('')
}
function pickPoint(kind,i){
 const cfg=POINTS[kind], item=cfg.get()[i]
 openPicker(cfg.title+(cfg.single?'':' '+(i+1)), cfg.color, item.ll, (ll,label)=>{ item.ll=ll; item.label=label; renderPoints(kind); onPointsChanged() })
}
function removePoint(kind,i){
 const cfg=POINTS[kind], arr=cfg.get()
 if(cfg.optional && arr.length===1){ arr[0].ll=null; arr[0].label='' } else arr.splice(i,1)
 renderPoints(kind); onPointsChanged()
}
function addPoint(kind){ POINTS[kind].get().push({ll:null,label:''}); renderPoints(kind) }

// ===== خريطة ملخص الرحلة: المسار الفعلي (معلومة فقط) =====
let tripMap=null, tripLayer=null, tripReq=0
function numIcon(txt,c){ return L.divIcon({html:`<div style="background:${c};color:#fff;min-width:24px;height:24px;padding:0 5px;border-radius:999px;display:grid;place-items:center;font-size:10px;font-weight:900;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${txt}</div>`, iconSize:[24,24], iconAnchor:[12,12]}) }
async function drawTrip(){
 const box=document.getElementById('tripBox'); if(!box) return
 const segs=tripSegments()
 const info=document.getElementById('tripInfo')
 const markers=tripMarkers()
 if(!segs.length || segs[0].pts.length<2){ box.style.display='none'; return }
 box.style.display='block'
 if(!tripMap){
   tripMap=L.map('tripMap',{zoomControl:false,attributionControl:false}).setView(DEFAULT_CENTER,12)
   L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',{maxZoom:19}).addTo(tripMap)
   tripLayer=L.featureGroup().addTo(tripMap)
 }
 setTimeout(()=> tripMap.invalidateSize(),100)
 tripLayer.clearLayers()
 markers.forEach(m=> L.marker(m.ll,{icon:numIcon(m.txt,m.color)}).addTo(tripLayer))
 info.innerHTML=segs.map(s=> `<div class="${s.cls||''}">⏳ ${s.name}: جاري حساب المسار...</div>`).join('')
 tripMap.fitBounds(tripLayer.getBounds(),{padding:[24,24]})
 const my=++tripReq
 const res=await Promise.all(segs.map(s=> getRoute(s.pts)))
 if(my!==tripReq) return
 info.innerHTML=''
 res.forEach((r,i)=>{
   const s=segs[i]
   if(r.ok){
     L.polyline(r.latlngs,{color:s.color, weight:s.cls==='ret'?4:5, opacity:.9, dashArray:s.cls==='ret'?'8 6':null}).addTo(tripLayer)
     info.innerHTML+=`<div class="${s.cls||''}">${s.icon} ${s.name}: ${r.km.toFixed(1)} كم على الطريق • ${fmtMin(r.min)}</div>`
     s.result={km:Number(r.km.toFixed(2)), min:Math.round(r.min)}
   } else info.innerHTML+=`<div class="err">⚠️ ${s.name}: تعذر حساب المسار</div>`
 })
 window.lastTrip=segs.map(s=>({name:s.key, ...(s.result||{})}))
 tripMap.fitBounds(tripLayer.getBounds(),{padding:[24,24]})
}
"""
