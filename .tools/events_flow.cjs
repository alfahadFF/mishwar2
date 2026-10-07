// اختبار التدفق: زبون ينشر ← سائق باص وسائق زفاف يقدّمان عروضاً ← الزبون يقبل ← اختفاء البنود المكتملة
const {JSDOM,VirtualConsole}=require('/tmp/node_modules/jsdom');const fs=require('fs')
const mem={}; const shared={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]}}
function open(file, q){
 const errs=[]; const vc=new VirtualConsole(); vc.on('jsdomError',e=>{ if(!/Not implemented|Could not load/.test(e.message)) errs.push(e.message.slice(0,300)) })
 const w=new JSDOM(fs.readFileSync('/home/user/'+file,'utf8'),{runScripts:'dangerously',virtualConsole:vc,url:'https://x.test/'+(q||''),beforeParse(w){
  Object.defineProperty(w,'localStorage',{get(){return shared}}); w.fetch=()=>Promise.reject(new Error('offline')); w.HTMLElement.prototype.scrollIntoView=function(){}; w.scrollTo=()=>{} }}).window
 w.errs=errs; return w
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const txt=(w,id)=>w.document.getElementById(id).textContent.replace(/\s+/g,' ').trim()
;(async()=>{
 // سائق باص أولاً (يولّد البيانات التجريبية)
 const bus=open('naql-events-driver.html'); await sleep(500)
 console.log('BUS vehBar:', txt(bus,'vehBar'))
 console.log('BUS feed:', [...bus.document.querySelectorAll('#feedList .card .cHead b')].map(b=>b.textContent).join(' | '))
 const wed=open('naql-events-driver.html','?as=wedding'); await sleep(500)
 console.log('WED vehBar:', txt(wed,'vehBar'))
 console.log('WED feed:', [...wed.document.querySelectorAll('#feedList .card .cHead b')].map(b=>b.textContent).join(' | '))
 // الزبون ينشر زفافاً: سيارة زفاف + باص 21 ×2
 const cu=open('naql-events.html'); await sleep(300)
 cu.eval(`setType('wedding'); gather[0].ll=[33.515,36.285]; gather[0].label='الشعلان، دمشق'; dests[0].ll=[33.50,36.24]; dests[0].label='صالة الأفراح، المزة'; vehicles.wedding_car.count=1; vehicles.bus_mid_21.count=2; people=46; renderVehicles(); updatePublish()`)
 await sleep(200)
 console.log('CU publish btn:', txt(cu,'publishBtn'), '| budget section gone:', !cu.document.getElementById('budgetFrom'))
 cu.eval('publish()'); await sleep(200)
 console.log('CU view:', cu.document.getElementById('mineView').style.display, '|', txt(cu,'mineList').slice(0,160))
 await sleep(2300) // poll
 console.log('BUS new popup:', bus.document.getElementById('newModal').classList.contains('open'), '|', txt(bus,'nmBody').slice(0,120))
 console.log('WED new popup:', wed.document.getElementById('newModal').classList.contains('open'))
 const oid=cu.eval('myOrders()[0].id')
 // سائق الباص 27 يعرض على بند باص 21 (بديل)
 bus.eval(`dismissNew(); openDetail('${oid}')`); await sleep(200)
 console.log('BUS items:', txt(bus,'dItems'), '| actions:', txt(bus,'dActions').slice(0,60))
 bus.eval(`document.getElementById('ofPrice').value='120'; document.getElementById('ofMsg').value='باص مكيّف'; askOffer()`); await sleep(100)
 console.log('BUS confirm:', txt(bus,'cmRows'))
 bus.eval('confirmOffer()'); await sleep(100)
 wed.eval(`dismissNew(); openDetail('${oid}')`); await sleep(200)
 console.log('WED items:', txt(wed,'dItems'))
 wed.eval(`document.getElementById('ofPrice').value='80'; askOffer(); confirmOffer()`); await sleep(2300)
 console.log('CU offers:', txt(cu,'mineList').slice(0,500))
 // الزبون يقبل عرض الباص
 const busOffer=cu.eval(`loadEvOffers().find(x=>x.driver_id==='driver-ev-1').id`)
 cu.eval(`openAccept('${busOffer}')`); console.log('CU accept modal:', txt(cu,'amInfo')); cu.eval('confirmAccept()'); await sleep(2300)
 console.log('CU after accept:', txt(cu,'mineList').slice(0,400))
 console.log('BUS jobs tab:', txt(bus,'jobsList').slice(0,260))
 console.log('BUS wallet:', txt(bus,'walletPill'))
 // باص 21 بقي منه 1: سائق باص آخر يجب أن يرى الطلب، وسائق الباص الأول لا يراه في الطلبات
 console.log('BUS feed has order:', bus.eval(`feed().some(o=>o.id==='${oid}')`))
 // قبول سيارة الزفاف
 const wo=cu.eval(`loadEvOffers().find(x=>x.driver_id==='driver-ev-2').id`); cu.eval(`openAccept('${wo}'); confirmAccept()`); await sleep(2300)
 console.log('WED feed has order:', wed.eval(`feed().some(o=>o.id==='${oid}')`), '| WED jobs:', txt(wed,'cntJobs'))
 // سائق باص ثالث يعرض على آخر باص، ثم يُقبل ← يكتمل الطلب
 mem['naql_event_driver_profile']=JSON.stringify({id:'driver-ev-3', name:'أبو علي', phone:'0944 555 666', services:{events:true,wedding:false}, vehicle:{type:'bus_mid_21', seats:21, model:'كيا', year:2015, color:'أزرق'}})
 const b3=open('naql-events-driver.html'); await sleep(400)
 console.log('B3 sees order:', b3.eval(`feed().some(o=>o.id==='${oid}')`))
 b3.eval(`dismissNew(); openDetail('${oid}'); document.getElementById('ofPrice').value='100'; askOffer(); confirmOffer()`)
 const o3=cu.eval(`loadEvOffers().find(x=>x.driver_id==='driver-ev-3').id`); cu.eval(`openAccept('${o3}'); confirmAccept()`); await sleep(300)
 console.log('ORDER status:', cu.eval(`loadEvOrders().find(o=>o.id==='${oid}').status`), '| B3 wallet:', b3.eval(`JSON.stringify(wallet().tx.map(t=>t.amount))`), '| BUS wallet tx:', bus.eval(`JSON.stringify(wallet().tx.map(t=>t.amount))`))
 console.log('errors:', bus.errs, wed.errs, cu.errs, b3.errs)
 process.exit(0)
})()
