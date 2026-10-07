// ===== فئات المركبات: تطابق الفئة نفسها والأكبر ضمن المجموعة =====
const VGROUPS=[
 {g:'pickup', name:'بيك آب صغير', icon:'🛻'},
 {g:'medium', name:'متوسط', icon:'🚚'},
 {g:'truck',  name:'شاحنة', icon:'🚛'},
]
const VCLASS=[
 {k:'pk800', g:'pickup', r:1, short:'800 كغ'},
 {k:'pk1200',g:'pickup', r:2, short:'1200 كغ'},
 {k:'pk1500',g:'pickup', r:3, short:'1500 كغ'},
 {k:'pk2000',g:'pickup', r:4, short:'2000 كغ'},
 {k:'md3', g:'medium', r:1, short:'3 طن'},
 {k:'md4', g:'medium', r:2, short:'4 طن'},
 {k:'md5', g:'medium', r:3, short:'5 طن'},
 {k:'md6', g:'medium', r:4, short:'6 طن'},
 {k:'md7', g:'medium', r:5, short:'7 طن'},
 {k:'truck',g:'truck', r:1, short:'شاحنة'},
]
function vOf(k){ return VCLASS.find(v=>v.k===k) }
function vName(k){ const v=vOf(k); if(!v) return '—'; const g=VGROUPS.find(x=>x.g===v.g); return v.g==='truck'? g.icon+' شاحنة' : g.icon+' '+g.name+' '+v.short }
function vehicleFits(orderK, carrierK){ const o=vOf(orderK), c=vOf(carrierK); return !!(o&&c&&o.g===c.g&&c.r>=o.r) }

// ===== العمولة والمحفظة =====
// نسبة العمولة الموحّدة لكل الخدمات
const CARGO_COMMISSION=0.12
const COMMISSION_PCT=Math.round(CARGO_COMMISSION*100)+'%'
function commissionOf(price){ return Math.round(Number(price)*CARGO_COMMISSION*100)/100 }
const money=v=> (v<0?'−':'')+'$'+Math.abs(Number(v)).toFixed(2)

// ===== الجسر بين الشاشتين (نسخة التجربة) =====
const K_ORDERS='naql_cargo_orders', K_OFFERS='naql_cargo_offers', K_WALLET='naql_wallet_', K_CARRIER='naql_carrier_profile'
// تخزين محلي، مع بديل في الذاكرة إذا كان المتصفح يمنعه
const STORE=(()=>{ try{ const s=window.localStorage; s.getItem('_t'); return s }catch(e){ const m={}; return {getItem:k=> k in m? m[k]:null, setItem:(k,v)=>{ m[k]=String(v) }, removeItem:k=>{ delete m[k] }} } })()
const lsGet=(k,d)=>{ try{ const v=JSON.parse(STORE.getItem(k)); return v==null? d : v }catch(e){ return d } }
const lsSet=(k,v)=> STORE.setItem(k, JSON.stringify(v))
const loadOrders=()=> lsGet(K_ORDERS,[]), saveOrders=v=> lsSet(K_ORDERS,v)
const loadOffers=()=> lsGet(K_OFFERS,[]), saveOffers=v=> lsSet(K_OFFERS,v)
const DEMO_CARRIER={id:'carrier-1', name:'أبو خالد', phone:'0933 222 111'}
const DEMO_CUSTOMER={id:'customer-1', name:'أحمد محمد', phone:'0944 123 456'}
// الفترة المجانية: أسبوعان من تاريخ التسجيل، بدون عمولة في كل الخدمات (في التطبيق من app_settings.free_days)
const FREE_DAYS=14, DAY_MS=864e5
function loadWallet(id){
 const w=lsGet(K_WALLET+id,null); if(w && w.registered_at) return w
 // الحسابات التجريبية مسجّلة قبل 5 أيام
 const n=Object.assign({balance:0, tx:[]}, w||{}, {registered_at:Date.now()-5*DAY_MS}); saveWallet(id,n); return n
}
function saveWallet(id,w){ lsSet(K_WALLET+id, w) }
function freeDaysLeft(id){ const w=loadWallet(id); return Math.max(0, Math.ceil((w.registered_at+FREE_DAYS*DAY_MS-Date.now())/DAY_MS)) }
function inFreePeriod(id){ return freeDaysLeft(id)>0 }
function daysAr(n){ return n===1? 'يوم واحد' : n===2? 'يومان' : n<=10? n+' أيام' : n+' يوماً' }
function nextCommission(id, price){ return inFreePeriod(id)? 0 : commissionOf(price) }
// خصم العمولة: لا عمولة ضمن الفترة المجانية، وبعدها تُخصم دائماً حتى لو صار الرصيد سالباً (دين يُسدد من الشحن التالي)
function chargeCommission(carrierId, orderId, price){
 const free=inFreePeriod(carrierId), w=loadWallet(carrierId), c= free? 0 : commissionOf(price)
 w.balance=Math.round((w.balance-c)*100)/100
 w.tx.unshift({kind:'commission', amount:-c, order_id:orderId, price:Number(price), balance_after:w.balance, free, at:Date.now()})
 saveWallet(carrierId,w); return {commission:c, balance:w.balance, free}
}
function topUp(carrierId, amount){
 const w=loadWallet(carrierId); const before=w.balance
 w.balance=Math.round((w.balance+Number(amount))*100)/100
 w.tx.unshift({kind:'topup', amount:Number(amount), debt_paid: before<0? Math.min(-before, Number(amount)) : 0, balance_after:w.balance, at:Date.now()})
 saveWallet(carrierId,w); return w
}
const uid=()=> Date.now().toString(36)+Math.random().toString(36).slice(2,7)
function timeAgo(t){ const m=Math.round((Date.now()-t)/60000); return m<1? 'الآن' : m<60? 'منذ '+m+' د' : 'منذ '+Math.floor(m/60)+' س' }
function orderTiming(o){ return o.timing==='urgent'? '⚡ مستعجل' : '📅 '+(o.sched_date||'')+' '+(o.sched_time||'') }
function orderBudget(o){ return o.budget_type==='fixed'? `💰 ${money(o.budget_from)} – ${money(o.budget_to)}` : '📩 بانتظار عروض الأسعار' }
function orderExtras(o){
 const x=[]
 if(o.weight_kg) x.push('⚖️ '+o.weight_kg+' كغ')
 if(o.need_workers) x.push('👷 '+o.workers_count+' عمال')
 if(o.need_equipment) x.push('🔧 '+o.equipment_detail)
 if(o.lift_up) x.push('⬆️ رفع للطابق '+o.floor_to+(o.elevator_to? ' • '+o.elevator_to:''))
 if(o.lift_down) x.push('⬇️ تنزيل من الطابق '+o.floor_from+(o.elevator_from? ' • '+o.elevator_from:''))
 if(o.floor_note) x.push('📝 '+o.floor_note)
 return x
}
function beep(freq){ try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(),g=ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value=freq||740; g.gain.value=0.2; o.start(); setTimeout(()=>{o.stop(); ctx.close()},350) }catch(e){} }
function notify(freq){ beep(freq); if(navigator.vibrate) navigator.vibrate([200,100,200]) }
