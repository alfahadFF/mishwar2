import Stars from '../components/Stars';
import { fetchRatings, Rating } from '../utils/rating';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { supabase } from '../utils/supabase';
import { getMyLocation } from '../utils/location';
import { guestBlocked } from '../utils/guest';
import { getRoute, fmtMin, etaToPoint } from '../utils/route';
import { useRouter, useFocusEffect } from 'expo-router';
import { errMsg } from '../utils/errors';
import { TAXI_CATEGORY_META, TaxiPriceQuotes, TaxiQuote, formatLocalFare, formatWalletUsd } from '../utils/taxi-pricing';
import ShareTripBtn from '../components/ShareTripBtn';
import ProviderPhotos from '../components/ProviderPhotos';
import { MapView, UrlTile, Marker, Polyline } from '../components/OpenMapView';
const RATES= TAXI_CATEGORY_META;
export default function TaxiScreen(){
  const router=useRouter();
  const [pickup,setPickup]=useState<number[]|null>(null);
  const [dropoff,setDropoff]=useState<number[]|null>(null);
  const [mode,setMode]=useState<'pick'|'drop'>('pick');
  const mapRef=useRef<any>(null);
  const [locationLoading,setLocationLoading]=useState(true);
  const [locationError,setLocationError]=useState(false);
  const [selected,setSelected]=useState('ordinary');
  const [radius,setRadius]=useState(5);
  const [toast,setToast]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  // الطلب الحالي: بانتظار سائق ← مقبول ← وصل ← جارية ← انتهت (ثم الدفع)
  const [active,setActive]=useState<any>(null);
  const [drvRating,setDrvRating]=useState<Rating|undefined>(undefined);
  const [hidden,setHidden]=useState<string|null>(null);
  const loadActive=useCallback(async()=>{
    const { data }=await supabase.rpc('my_taxi_active');
    setActive(data||null);
    if((data as any)?.id && (data as any)?.driver_name){ const m=await fetchRatings('taxi_order',[(data as any).id]); setDrvRating(m[(data as any).id]); }
    return data;
  },[]);
  useFocusEffect(useCallback(()=>{ loadActive().then((a:any)=>{ if(a){ setPickup(a.pickup); setDropoff(a.dropoff); } }); },[loadActive]));
  useEffect(()=>{
    if(!active || active.status==='completed') return;
    const iv=setInterval(async()=>{
      const prev=active.status; const a=await loadActive();
      if(a && a.status!==prev){
        if(a.status==='accepted') showToast('تم قبول طلبك، السائق في الطريق');
        if(a.status==='arrived') showToast('وصل السائق');
        if(a.status==='completed') showToast('انتهت الرحلة');
      }
    },5000);
    return ()=> clearInterval(iv);
  },[active?.id, active?.status]);
  const cancelActive=async()=>{
    if(!active) return;
    const { error }=await supabase.rpc('customer_cancel_taxi',{p_order:active.id});
    if(error){ showToast(errMsg(error)); loadActive(); return; }
    setActive(null); showToast('تم إلغاء الطلب');
  };
  const payActive=()=>{ if(active) router.push(`/wallet?pay=taxi:${active.id}` as any); };
  useEffect(()=>{
    let alive=true;
    getMyLocation().then(({ll,real})=>{
      if(!alive) return;
      if(real && ll){ setPickup(ll); setLocationError(false); }
      else setLocationError(true);
      setLocationLoading(false);
    }).catch(()=>{ if(alive){ setLocationError(true); setLocationLoading(false); } });
    return ()=>{ alive=false; };
  },[]);
  const useMyLocation=async()=>{
    setLocationLoading(true);
    const {ll,real}=await getMyLocation();
    setLocationLoading(false);
    if(!real || !ll){ setLocationError(true); showToast('تعذر تحديد موقعك؛ اسمح بإذن الموقع ثم أعد المحاولة'); return; }
    setLocationError(false); setPickup(ll); setMode('drop');
    mapRef.current?.animateToRegion?.({latitude:ll[0],longitude:ll[1],latitudeDelta:0.02,longitudeDelta:0.02});
  };
  const [route,setRoute]=useState<{km:number,min:number,path:any[]}|null>(null);
  const [routeState,setRouteState]=useState<'idle'|'loading'|'error'|'ok'>('idle');
  const [quotes,setQuotes]=useState<Record<string,TaxiQuote>>({});
  const [quoteCurrency,setQuoteCurrency]=useState('SYP');
  const [quoteError,setQuoteError]=useState<string|null>(null);
  const [quoteLoading,setQuoteLoading]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!pickup || !dropoff){ setRoute(null); setRouteState('idle'); return; }
    let alive=true; setRouteState('loading');
    getRoute([pickup,dropoff]).then(r=>{
      if(!alive) return;
      if(r.ok){ setRoute({km:r.km,min:r.min,path:r.path}); setRouteState('ok'); }
      else { setRoute(null); setRouteState('error'); showToast('تعذر حساب المسار على الطرق، حاول مرة أخرى'); }
    });
    return ()=>{ alive=false; };
  },[pickup?.[0],pickup?.[1],dropoff?.[0],dropoff?.[1],retry]);
  useEffect(()=>{
    if(routeState!=='ok' || !route){ setQuotes({}); setQuoteError(null); setQuoteLoading(false); return; }
    let alive=true; setQuotes({}); setQuoteError(null); setQuoteLoading(true);
    supabase.rpc('taxi_price_quotes',{p_distance_km:Number(route.km.toFixed(2)),p_duration_minutes:Math.round(route.min)})
      .then(({data,error})=>{
        if(!alive) return;
        setQuoteLoading(false);
        if(error || !(data as any)?.quotes){ setQuoteError(errMsg(error||'TAXI_PRICING_UNAVAILABLE')); return; }
        const result=data as TaxiPriceQuotes;
        setQuotes(result.quotes||{}); setQuoteCurrency(result.currency||'SYP');
      });
    return ()=>{ alive=false; };
  },[route?.km,route?.min,routeState]);
  const distance = route ? route.km : 0;
  // ===== السيارات القريبة: رموز بلا تفاصيل + مدة وصول أقرب سيارة لكل فئة =====
  const [cars,setCars]=useState<any[]>([]);
  const [eta,setEta]=useState<Record<string,number|null>>({});
  const [carsLoaded,setCarsLoaded]=useState(false);
  const picked=React.useRef(false);
  const etaAt=React.useRef(0);
  const km=(a:number[],b:number[])=>{ const k=Math.cos(a[0]*Math.PI/180); return Math.hypot((b[1]-a[1])*111.32*k,(b[0]-a[0])*110.574); };
  const loadCars=useCallback(async(rad:number)=>{
    if(!pickup) return [];
    const { data }=await supabase.rpc('nearby_taxis',{p_lat:pickup[0], p_lng:pickup[1], p_radius:rad});
    const list=((data||[]) as any[]); setCars(list); setCarsLoaded(true); return list;
  },[pickup?.[0],pickup?.[1]]);
  useEffect(()=>{
    if(!pickup || (active && active.id!==hidden)) return;
    loadCars(radius); const iv=setInterval(()=> loadCars(radius),10000);
    return ()=> clearInterval(iv);
  },[loadCars, radius, active?.id, hidden]);
  const hasCat=(c:string)=> cars.some(x=> x.cat===c);
  // مدة الوصول: الأولوية للسائق الفاضي، وإذا كل سائقين الفئة مشغولين: وقت إنهاء رحلته + الطريق للراكب
  useEffect(()=>{
    if(!pickup || !cars.length){ setEta({}); return; }
    if(Date.now()-etaAt.current<30000 && Object.keys(eta).length) return;
    etaAt.current=Date.now();
    (async()=>{
      const out:Record<string,number|null>={};
      const cats=Object.keys(RATES).filter(hasCat);
      const free:any[]=[];
      cats.forEach(c=>{ cars.filter(x=> x.cat===c && !x.busy).sort((a,b)=> km([a.lat,a.lng],pickup)-km([b.lat,b.lng],pickup)).slice(0,5).forEach(x=> free.push(x)); });
      const mins=await etaToPoint(free.map(x=> [x.lat,x.lng]), pickup);
      free.forEach((x,i)=>{ const m=mins[i]; if(m!=null && (out[x.cat]==null || m<out[x.cat]!)) out[x.cat]=m; });
      await Promise.all(cats.filter(c=> !cars.some(x=> x.cat===c && !x.busy)).map(async c=>{
        const b=cars.filter(x=> x.cat===c).sort((a,b)=> km([a.lat,a.lng],pickup)-km([b.lat,b.lng],pickup))[0];
        const rt=await getRoute([[b.lat,b.lng], ...((b.via||[]) as number[][]), pickup]);
        out[c]=rt.ok? rt.min : null;
      }));
      cats.forEach(c=>{ if(!(c in out)) out[c]=null; });
      setEta(out);
      // اختيار الفئة الأقرب تلقائياً (ما لم يختر الراكب بنفسه)
      if(!picked.current){ const best=cats.filter(c=> out[c]!=null).sort((a,b)=> out[a]!-out[b]!)[0] || cats[0]; if(best) setSelected(best); }
    })();
  },[cars]);
  const pickCat=async(k:string)=>{
    if(hasCat(k)){ picked.current=true; setSelected(k); return; }
    if(radius===5){
      setRadius(10); etaAt.current=0; showToast('جاري البحث ضمن 10 كم...');
      const list=await loadCars(10);
      if(list.some((x:any)=> x.cat===k)){ picked.current=true; setSelected(k); showToast(`تم التوسيع إلى 10 كم — توجد ${RATES[k].name}`); }
      else showToast(`لا توجد ${RATES[k].name} قريبة حالياً`);
    } else showToast(`لا توجد ${RATES[k].name} قريبة حالياً`);
  };
  const quote=(cat:string)=>quotes[cat];
  const fareLabel=(cat:string)=>quotes[cat]?formatLocalFare(quotes[cat].fare_local,quoteCurrency):'—';
  const onMapPress=(e:any)=>{
    if(showActive) return;
    const c=e.nativeEvent.coordinate;
    const ll=[c.latitude, c.longitude];
    if(mode==='pick'){ setPickup(ll); setMode('drop'); }
    else { setDropoff(ll); }
  };
  const publish=async()=>{
    if(!pickup || !dropoff) return;
    if(routeState==='error'){ setRetry(x=>x+1); return; }
    if(routeState!=='ok') return;
    if(!hasCat(selected)){ showToast('اختر فئة متوفرة'); return; }
    const selectedQuote=quotes[selected];
    if(!selectedQuote){ showToast(quoteError||'تعذر حساب الأجرة'); return; }
    setLoading(true);
    try{
      const { data:{user} }=await supabase.auth.getUser(); if(!user){ guestBlocked(); return; }
      const payload:any={
        user_id:user.id,
        pickup_lat: pickup[0], pickup_lng: pickup[1], pickup_text: 'نقطة مختارة على الخريطة',
        dropoff_lat: dropoff[0], dropoff_lng: dropoff[1], dropoff_text: 'نقطة مختارة على الخريطة',
        distance_km: Number(distance.toFixed(2)),
        duration_min: Math.round(route!.min),
        route_source: 'osrm_road',
        vehicle_category: selected,
        estimated_fare: Number(selectedQuote.fare_usd),
        currency: 'USD',
        search_radius_km: radius,
      };
      const { error }=await supabase.from('taxi_orders').insert(payload);
      if(error) throw error;
      showToast('تم نشر طلب التكسي');
      await loadActive();
    }catch(e:any){ showToast(errMsg(e,'تعذر نشر الطلب'))} finally{ setLoading(false)}
  };
  const showToast=(msg:string)=>{ setToast(msg); setTimeout(()=> setToast(null),2500); };
  const showActive=!!active && active.id!==hidden;
  // تتبّع سيارة السائق بعد القبول: مدة وصوله قبل الانطلاق، والمدة الباقية للوجهة بعد «بدء الرحلة»
  const moving=showActive && ['accepted','arrived','in_progress'].includes(active.status);
  const carPos:number[]|null=moving && active.driver_pos? [Number(active.driver_pos.lat), Number(active.driver_pos.lng)] : null;
  const [trackEta,setTrackEta]=useState<number|null>(null);
  const etaRef=React.useRef({at:0, key:''});
  useEffect(()=>{
    if(!carPos || active.status==='arrived'){ setTrackEta(null); return; }
    const target=active.status==='in_progress'? active.dropoff : active.pickup;
    const key=active.status+carPos.join(',');
    if(etaRef.current.key===key || Date.now()-etaRef.current.at<30000 && etaRef.current.key.startsWith(active.status)) return;
    etaRef.current={at:Date.now(), key};
    getRoute([carPos, target]).then(rt=>{ if(rt.ok) setTrackEta(rt.min); });
  },[carPos?.[0], carPos?.[1], active?.status]);
  const pct=Number(active?.discount_pct||0), aFareUsd=Number(active?.fare||0), aFareLocal=Number(active?.fare_local||0);
  const aDiscUsd=Math.round(aFareUsd*pct)/100, aPayUsd=Math.round((aFareUsd-aDiscUsd)*100)/100;
  const aLocalCurrency=active?.local_currency||quoteCurrency;
  const aFareLabel=aFareLocal>0?formatLocalFare(aFareLocal,aLocalCurrency):formatWalletUsd(aFareUsd);
  const ST:Record<string,{icon:string,t:string,sub:string}>={
    pending:{icon:'⏳', t:'بانتظار قبول سائق', sub:'سيصلك إشعار عند قبول طلبك'},
    searching:{icon:'⏳', t:'بانتظار قبول سائق', sub:'سيصلك إشعار عند قبول طلبك'},
    accepted:{icon:'🚕', t:'السائق في الطريق إليك', sub:'سيتواصل معك السائق عند الحاجة'},
    arrived:{icon:'📍', t:'وصل السائق', sub:'السائق بانتظارك عند نقطة الانطلاق'},
    in_progress:{icon:'🛣️', t:'الرحلة جارية', sub:'الدفع بعد الوصول'},
    completed:{icon:'✅', t:'انتهت الرحلة', sub:pct>0? `ادفع نقداً أو من التطبيق ووفّر ${pct}%` : 'ادفع نقداً أو من التطبيق'},
  };
  const st=active? (ST[active.status]||ST.pending) : null;
  return (
    <View style={s.page}>
      <View style={s.header}>
        <Text style={s.h1}>🚕 طلب تكسي</Text>
        <Text style={s.sub}>اضغط على الخريطة لتحديد الانطلاق والوصول</Text>
      </View>
      <Pressable onPress={()=> router.push('/taxi-shared' as any)} style={{margin:8, height:42, borderRadius:12, borderWidth:1.5, borderColor:'#4F46E5', backgroundColor:'#eef2ff', alignItems:'center', justifyContent:'center'}}><Text style={{color:'#4F46E5', fontWeight:'900'}}>👥 رحلات راكب مشتركة — تصفح على طول المسار</Text></Pressable>
      <View style={s.modeBar}>
        <Pressable onPress={()=> setMode('pick')} style={[s.modeBtn, mode==='pick' && s.modeActive]}><Text style={[s.modeT, mode==='pick' && s.modeTActive]}>📍 الانطلاق</Text></Pressable>
        <Pressable onPress={()=> setMode('drop')} style={[s.modeBtn, mode==='drop' && s.modeActive]}><Text style={[s.modeT, mode==='drop' && s.modeTActive]}>🏁 الوصول</Text></Pressable>
        <Pressable onPress={useMyLocation} style={[s.modeBtn,{backgroundColor:'#f1f5f9'}]}><Text style={s.modeT}>📍 موقعي</Text></Pressable>
      </View>
      <View style={{flex:1, marginHorizontal:10, borderRadius:14, overflow:'hidden', borderWidth:1, borderColor:'#e2e8f0'}}>
        {pickup ? (
          <>
            <MapView ref={mapRef} style={{flex:1}} initialRegion={{latitude:pickup[0], longitude:pickup[1], latitudeDelta:0.02, longitudeDelta:0.02}} onPress={onMapPress}>
              <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
              <Marker coordinate={{latitude:pickup[0], longitude:pickup[1]}} pinColor="green"/>
              {dropoff && <Marker coordinate={{latitude:dropoff[0], longitude:dropoff[1]}} pinColor="red"/>}
              {route && <Polyline coordinates={route.path} strokeColor="#4F46E5" strokeWidth={5}/>}
              {carPos && <Marker coordinate={{latitude:carPos[0], longitude:carPos[1]}} anchor={{x:.5,y:.5}}><Text style={{fontSize:26}}>🚕</Text></Marker>}
              {!showActive && cars.map((c,i)=> <Marker key={'car'+i} coordinate={{latitude:c.lat, longitude:c.lng}} anchor={{x:.5,y:.5}} tracksViewChanges={false}><Text style={{fontSize:20}}>🚕</Text></Marker>)}
            </MapView>
            <View style={s.hint}><Text style={s.hintT}>{routeState==='loading'? '⏳ جاري حساب المسار...' : routeState==='error'? '⚠️ تعذر حساب المسار' : route? `🛣️ ${route.km.toFixed(1)} كم • ${fmtMin(route.min)}` : (mode==='pick'? 'اضغط على الخريطة لتحديد الانطلاق' : 'اضغط على الخريطة لتحديد الوصول')}</Text></View>
          </>
        ) : (
          <View style={s.locationGate}>
            <Text style={s.locationGateT}>{locationLoading?'📡 جارٍ تحديد موقعك لفتح الخريطة بالقرب منك':locationError?'تعذر تحديد موقعك. اسمح بإذن الموقع ثم أعد المحاولة.':'حدد موقعك لعرض الخريطة'}</Text>
            {!locationLoading && <Pressable onPress={useMyLocation} style={s.locationRetry}><Text style={s.locationRetryT}>تحديد موقعي وإعادة المحاولة</Text></Pressable>}
          </View>
        )}
      </View>
      {showActive && st && (
        <View style={s.activeWrap}>
          <View style={{flexDirection:'row-reverse', alignItems:'center', gap:10}}>
            <Text style={{fontSize:28}}>{st.icon}</Text>
            <View style={{flex:1}}>
              <Text style={s.activeT}>{st.t}</Text>
              <Text style={s.activeS}>{st.sub}</Text>
            </View>
            <View style={{alignItems:'flex-end'}}>
              <Text style={s.activeFare}>{aFareLabel}</Text>
              <Text style={{fontSize:10,color:'#64748b',fontWeight:'700'}}>المحاسبة بالمحفظة: {formatWalletUsd(aFareUsd)}</Text>
            </View>
          </View>
          {!!active.driver_name && active.status!=='completed' && (
            <View style={s.driverBox}>
              <Text style={{fontWeight:'900', textAlign:'right'}}>👤 {active.driver_name}</Text>
              <Stars r={drvRating} small />
              <ProviderPhotos service="taxi" refId={active.id} />
              {!!(active.vehicle_model||active.vehicle_color||active.vehicle_plate) && <Text style={s.activeS}>🚗 {[active.vehicle_model, active.vehicle_color, active.vehicle_plate].filter(Boolean).join(' • ')}</Text>}
              {moving && trackEta!=null && active.status!=='arrived' && <Text style={[s.activeS,{color:'#047857', fontWeight:'900'}]}>🕒 {active.status==='in_progress'? 'الوصول للوجهة خلال' : 'يصل السائق خلال'} {fmtMin(Math.max(1,trackEta))}</Text>}
              {moving && !carPos && <Text style={s.activeS}>📡 بانتظار موقع السائق...</Text>}
            </View>
          )}
          {active.status==='completed' && (
            <View style={s.payBox}>
              <View style={s.payRow}><Text style={s.payK}>أجرة الرحلة النقدية</Text><Text style={s.payV}>{aFareLabel}</Text></View>
              <View style={s.payRow}><Text style={s.payK}>المبلغ الأساسي في المحفظة</Text><Text style={s.payV}>{formatWalletUsd(aFareUsd)}</Text></View>
              {aDiscUsd>0 && <View style={s.payRow}><Text style={[s.payK,{color:'#047857'}]}>خصم الدفع من التطبيق {pct}%</Text><Text style={[s.payV,{color:'#047857'}]}>−{formatWalletUsd(aDiscUsd)}</Text></View>}
              <View style={s.payRow}><Text style={[s.payK,{fontWeight:'900'}]}>المبلغ عند الدفع من التطبيق</Text><Text style={[s.payV,{color:'#4F46E5'}]}>{formatWalletUsd(aPayUsd)}</Text></View>
            </View>
          )}
          <View style={{flexDirection:'row-reverse', gap:8, marginTop:10}}>
            <Pressable onPress={payActive} disabled={active.status!=='completed'} style={[s.aBtn,{flex:2, backgroundColor: active.status==='completed'? '#22c55e' : '#e2e8f0'}]}>
              <Text style={[s.aBtnT,{color: active.status==='completed'? '#fff' : '#64748b'}]}>{active.status==='completed'? `💳 ادفع ${formatWalletUsd(aPayUsd)} من المحفظة` : `💳 الدفع من المحفظة بعد انتهاء الرحلة${pct>0? ` • خصم ${pct}%` : ''}`}</Text>
            </Pressable>
            {moving && <ShareTripBtn service="taxi" refId={active.id}/>}
            {['pending','searching'].includes(active.status) && <Pressable onPress={cancelActive} style={[s.aBtn,{backgroundColor:'#fff', borderWidth:1, borderColor:'#fecaca'}]}><Text style={[s.aBtnT,{color:'#991b1b'}]}>إلغاء الطلب</Text></Pressable>}
            {active.status==='completed' && <Pressable onPress={()=> setHidden(active.id)} style={[s.aBtn,{backgroundColor:'#f1f5f9'}]}><Text style={s.aBtnT}>إغلاق</Text></Pressable>}
          </View>
        </View>
      )}
      {!showActive && distance>0 && (
        <View style={s.sliderWrap}>
          <Text style={s.sliderTitle}>اختر الفئة • {distance.toFixed(1)} كم • مدة متوقعة {fmtMin(route?.min||0)}</Text>
          <Text style={{fontSize:10,color:'#64748b',textAlign:'center',marginBottom:6}}>السعر بالليرة السورية الجديدة • العمولة على السائق ولا تُضاف إلى أجرتك • زمن متوقع دون انتظار</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:14, gap:10}}>
            {Object.entries(RATES).map(([k,v]:any)=> (
              <Pressable key={k} onPress={()=> pickCat(k)} style={[s.card, selected===k && hasCat(k) && s.cardActive, carsLoaded && !hasCat(k) && {opacity:.4}]}>
                <Text style={s.badge}>×{v.multiplier.toFixed(2)}</Text>
                <Text style={{fontSize:22, textAlign:'center'}}>{v.icon}</Text>
                <Text style={s.cardName}>{v.name}</Text>
                <Text style={s.price}>{fareLabel(k)}</Text>
                <Text style={{fontSize:9,color:'#64748b',marginTop:2}}>{quote(k)?`المحفظة ${formatWalletUsd(quote(k)!.fare_usd)}`:'جاري حساب السعر'}</Text>
                <Text style={[s.perkm, hasCat(k) && {color:'#047857', fontWeight:'900'}]}>{!carsLoaded? '...' : !hasCat(k)? 'غير متوفرة حالياً' : eta[k]!=null? `🕒 ${fmtMin(Math.max(1,eta[k]!))}` : 'متوفرة'}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={publish} disabled={loading || quoteLoading || !quotes[selected] || !hasCat(selected)} style={[s.publish, (loading || quoteLoading || !quotes[selected] || !hasCat(selected)) && {backgroundColor:'#cbd5e1'}]}>
            <Text style={s.publishT}>{loading? 'جاري...' : quoteLoading? 'جاري حساب السعر...' : `📢 نشر الطلب — ${RATES[selected].name} • ${fareLabel(selected)}`}</Text>
          </Pressable>
          <Text style={{fontSize:11,color:quoteError?'#b91c1c':'#64748b',textAlign:'center',marginTop:6}}>{quoteError||(!carsLoaded? 'جاري البحث عن سيارات قريبة...' : !cars.length? `لا توجد سيارات ضمن ${radius} كم${radius===5? ' — اضغط على فئة للتوسيع' : ''}` : radius===10? 'تم التوسيع إلى 10 كم' : `سيُرسل ضمن ${radius} كم`)}</Text>
        </View>
      )}
      {toast && (
        <View style={{position:'absolute', bottom:20, alignSelf:'center', backgroundColor:'#065f46', paddingHorizontal:20, paddingVertical:12, borderRadius:999, shadowColor:'#000', shadowOpacity:0.2, shadowRadius:8, elevation:5}}>
          <Text style={{color:'#fff', fontWeight:'900', fontSize:13, textAlign:'center'}}>{toast}</Text>
        </View>
      )}
    </View>
  )
}
const s=StyleSheet.create({
  page:{flex:1, backgroundColor:'#f8fafc'},
  header:{padding:10, backgroundColor:'#fff', borderBottomWidth:1, borderColor:'#e2e8f0'},
  h1:{fontSize:16, fontWeight:'900', textAlign:'center'},
  sub:{fontSize:11, color:'#64748b', textAlign:'center'},
  modeBar:{flexDirection:'row', gap:8, padding:8, backgroundColor:'#fff', borderBottomWidth:1, borderColor:'#e2e8f0'},
  modeBtn:{flex:1, height:40, borderRadius:12, borderWidth:1.5, borderColor:'#e2e8f0', backgroundColor:'#fff', alignItems:'center', justifyContent:'center'},
  modeActive:{backgroundColor:'#4F46E5', borderColor:'#4F46E5'},
  modeT:{fontSize:12, fontWeight:'800'},
  modeTActive:{color:'#fff'},
  locationGate:{flex:1, alignItems:'center', justifyContent:'center', padding:20, gap:12, backgroundColor:'#f8fafc'},
  locationGateT:{fontSize:13, lineHeight:20, fontWeight:'800', color:'#334155', textAlign:'center'},
  locationRetry:{height:42, paddingHorizontal:16, borderRadius:12, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center'},
  locationRetryT:{color:'#fff', fontWeight:'900', fontSize:12},
  hint:{position:'absolute', bottom:10, alignSelf:'center', backgroundColor:'rgba(15,23,42,.85)', paddingHorizontal:12, paddingVertical:6, borderRadius:999},
  hintT:{color:'#fff', fontSize:11},
  sliderWrap:{backgroundColor:'#fff', borderTopWidth:1, borderColor:'#e2e8f0', paddingVertical:10},
  sliderTitle:{fontSize:12, fontWeight:'900', paddingHorizontal:14, marginBottom:8},
  card:{width:140, borderWidth:1.5, borderColor:'#e2e8f0', borderRadius:14, padding:10, backgroundColor:'#fff', alignItems:'center'},
  cardActive:{borderColor:'#4F46E5', backgroundColor:'#eef2ff'},
  badge:{position:'absolute', top:6, left:6, fontSize:9, backgroundColor:'#f1f5f9', paddingHorizontal:6, paddingVertical:2, borderRadius:999, overflow:'hidden'},
  cardName:{fontSize:12, fontWeight:'900', textAlign:'center', marginTop:4},
  price:{fontSize:16, fontWeight:'900', color:'#4F46E5', marginTop:4},
  perkm:{fontSize:10, color:'#64748b'},
  publish:{marginHorizontal:14, marginTop:10, height:46, borderRadius:14, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center'},
  publishT:{color:'#fff', fontWeight:'900', fontSize:14},
  activeWrap:{backgroundColor:'#fff', borderTopWidth:1, borderColor:'#e2e8f0', padding:14},
  activeT:{fontSize:15, fontWeight:'900', textAlign:'right'},
  activeS:{fontSize:12, color:'#64748b', textAlign:'right', marginTop:2},
  activeFare:{fontSize:18, fontWeight:'900', color:'#4F46E5'},
  driverBox:{marginTop:10, backgroundColor:'#f8fafc', borderWidth:1, borderColor:'#e2e8f0', borderRadius:12, padding:10},
  payBox:{marginTop:10, backgroundColor:'#f8fafc', borderWidth:1, borderColor:'#e2e8f0', borderRadius:12, padding:10, gap:6},
  payRow:{flexDirection:'row-reverse', justifyContent:'space-between'},
  payK:{fontSize:13, color:'#334155'},
  payV:{fontSize:14, fontWeight:'900'},
  aBtn:{flex:1, height:46, borderRadius:12, alignItems:'center', justifyContent:'center'},
  aBtnT:{fontWeight:'900', fontSize:13},
});
