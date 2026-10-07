// ===== مركبات المناسبات =====
// الباصات والفانات: أي سائق باص/فان يرى أي طلب باص/فان (الأصغر والأكبر) ليختار الزبون من المتوفر
// سيارة الزفاف: خدمة يفعّلها السائق في حسابه، وتصلح لها أي سيارة
const EV_TYPES={
 wedding_car:{name:'سيارة زفاف', icon:'💍', seats:4, wedding:true},
 bus_large_50:{name:'باص كبير 50', icon:'🚌', seats:50},
 bus_mid_27:{name:'باص متوسط 27', icon:'🚌', seats:27},
 bus_mid_21:{name:'باص متوسط 21', icon:'🚌', seats:21},
 bus_mid_18:{name:'باص متوسط 18', icon:'🚌', seats:18},
 bus_small_14:{name:'باص صغير 14', icon:'🚐', seats:14},
 van_11:{name:'فان 11', icon:'🚐', seats:11},
 van_8:{name:'فان 8', icon:'🚐', seats:8},
}
const EVENT_KINDS={wedding:'💍 زفاف', family:'👨‍👩‍👧‍👦 رحلة عائلية', tourist:'🏖️ رحلة سياحية', other:'✨ مناسبة'}
const evName=t=> EV_TYPES[t]? EV_TYPES[t].icon+' '+EV_TYPES[t].name : '—'
const isBusVan=t=> !!EV_TYPES[t] && !EV_TYPES[t].wedding
function eventKind(o){ return o.event_type==='other' && o.event_type_other? '✨ '+o.event_type_other : EVENT_KINDS[o.event_type]||'✨ مناسبة' }
// مركبة السائق من حسابه: {type, seats, model, year, color, photo} + الخدمات {events, wedding}
function driverVehicleLabel(v, noIcon){ if(!v) return '—'; const t=EV_TYPES[v.type]; return v.type==='car'? (noIcon?'':'🚘 ')+(v.model||'سيارة') : (noIcon? t.name : evName(v.type))+(v.model? ' • '+v.model:'') }
// هل يستطيع السائق خدمة هذا البند من الطلب؟
function canServe(itemType, p){
 if(!p || !p.vehicle) return false
 if(EV_TYPES[itemType] && EV_TYPES[itemType].wedding) return !!(p.services && p.services.wedding)
 return !!(p.services && p.services.events) && isBusVan(p.vehicle.type)
}

// ===== التخزين (نسخة التجربة) =====
const K_EV_ORDERS='naql_event_orders', K_EV_OFFERS='naql_event_offers', K_EV_MINE='naql_my_event_orders'
const loadEvOrders=()=> lsGet(K_EV_ORDERS,[]), saveEvOrders=v=> lsSet(K_EV_ORDERS,v)
const loadEvOffers=()=> lsGet(K_EV_OFFERS,[]), saveEvOffers=v=> lsSet(K_EV_OFFERS,v)
// عدد المقبول والمتبقي لكل بند
function acceptedFor(orderId, itemType, offers){ return (offers||loadEvOffers()).filter(x=> x.order_id===orderId && x.item_type===itemType && x.status==='accepted').length }
function itemsLeft(o, offers){ offers=offers||loadEvOffers(); return o.vehicles.map(v=> ({...v, left: Math.max(0, v.count-acceptedFor(o.id, v.type, offers))})) }
function orderFilled(o, offers){ return itemsLeft(o, offers).every(v=> v.left===0) }
// قبول الزبون لعرض: خصم العمولة، وإغلاق البند إذا اكتمل، وإلغاء العروض المعلّقة عليه
function acceptEventOffer(offerId){
 const offers=loadEvOffers(), x=offers.find(f=>f.id===offerId); if(!x || x.status!=='pending') return {ok:false, msg:'العرض لم يعد متاحاً'}
 const orders=loadEvOrders(), o=orders.find(q=>q.id===x.order_id); if(!o || o.status!=='open') return {ok:false, msg:'الطلب لم يعد متاحاً'}
 const it=itemsLeft(o, offers).find(v=> v.type===x.item_type); if(!it || it.left<1) return {ok:false, msg:'اكتمل هذا النوع من المركبات'}
 x.status='accepted'; x.accepted_at=Date.now()
 const ch=chargeCommission(x.driver_id, o.id, x.price); x.commission=ch.commission
 // العروض الأخرى لنفس السائق على هذا الطلب تُلغى (مركبة واحدة)
 offers.forEach(f=>{ if(f.order_id===o.id && f.driver_id===x.driver_id && f.id!==x.id && f.status==='pending') f.status='cancelled' })
 if(it.left-1===0) offers.forEach(f=>{ if(f.order_id===o.id && f.item_type===x.item_type && f.status==='pending'){ f.status='rejected'; f.reason='filled' } })
 if(orderFilled(o, offers)){ o.status='filled'; offers.forEach(f=>{ if(f.order_id===o.id && f.status==='pending'){ f.status='rejected'; f.reason='filled' } }) }
 saveEvOffers(offers); saveEvOrders(orders)
 return {ok:true, offer:x, order:o, commission:ch.commission, free:ch.free}
}
function fmtDT(s){ if(!s) return ''; const d=new Date(s); if(isNaN(d)) return s; return d.toLocaleDateString('ar-SY',{weekday:'long', day:'numeric', month:'numeric'})+' • '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0') }
