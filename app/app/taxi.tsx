import Stars from '../components/Stars';
import { fetchRatings, Rating } from '../utils/rating';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import { getMyLocation } from '../utils/location';
import { placeName } from '../utils/geocode';
import PointPicker from '../components/PointPicker';
import { guestBlocked } from '../utils/guest';
import { getRoute, fmtMin, type RouteOption } from '../utils/route';
import { useRouter, useFocusEffect } from 'expo-router';
import { errMsg } from '../utils/errors';
import { TAXI_CATEGORY_META, TaxiPriceQuotes, TaxiQuote, formatLocalFare, formatWalletUsd } from '../utils/taxi-pricing';
import ShareTripBtn from '../components/ShareTripBtn';
import ProviderPhotos from '../components/ProviderPhotos';
import { MapView, UrlTile, Marker, Polyline } from '../components/OpenMapView';
const RATES= TAXI_CATEGORY_META;
const regionForRoutePoints=(points:any[])=>{
  const coords=points.map(p=>Array.isArray(p)?[Number(p[0]),Number(p[1])]:[Number(p?.latitude),Number(p?.longitude)])
    .filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
  if(!coords.length) return null;
  let minLat=Infinity,maxLat=-Infinity,minLng=Infinity,maxLng=-Infinity;
  coords.forEach(([lat,lng])=>{minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);minLng=Math.min(minLng,lng);maxLng=Math.max(maxLng,lng);});
  return {latitude:(maxLat+minLat)/2,longitude:(maxLng+minLng)/2,latitudeDelta:Math.max(0.015,(maxLat-minLat)*1.55+0.012),longitudeDelta:Math.max(0.015,(maxLng-minLng)*1.55+0.012)};
};
export default function TaxiScreen(){
  const router=useRouter();
  const insets=useSafeAreaInsets();
  const [pickup,setPickup]=useState<number[]|null>(null);
  const [dropoff,setDropoff]=useState<number[]|null>(null);
  const [pickupLabel,setPickupLabel]=useState('');
  const [dropoffLabel,setDropoffLabel]=useState('');
  const [picker,setPicker]=useState<'pick'|'drop'|null>(null);
  const labelReq=useRef({pick:0,drop:0});
  const mapRef=useRef<any>(null);
  const defaultPickupRef=useRef<number[]|null>(null);
  const lastActiveOrderRef=useRef<string|null>(null);
  const setPointLabel=useCallback((which:'pick'|'drop',ll:number[],known?:string)=>{
    const token=++labelReq.current[which];
    const setter=which==='pick'?setPickupLabel:setDropoffLabel;
    if(known){ setter(known); return; }
    setter('جارٍ تحديد اسم المكان...');
    placeName(ll).then(name=>{ if(labelReq.current[which]===token) setter(name); });
  },[]);
  const [mode,setMode]=useState<'pick'|'drop'>('pick');
  const [locationLoading,setLocationLoading]=useState(true);
  const [locationError,setLocationError]=useState(false);
  const [selected,setSelected]=useState('ordinary');
  const [radius,setRadius]=useState(5);
  const [toast,setToast]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [cashBusy,setCashBusy]=useState(false);
  // الطلب الحالي: بانتظار سائق ← مقبول ← وصل ← جارية ← انتهت (ثم اختيار طريقة الدفع)
  const [active,setActive]=useState<any>(null);
  const [drvRating,setDrvRating]=useState<Rating|undefined>(undefined);
  const [hidden,setHidden]=useState<string|null>(null);
  const loadActive=useCallback(async()=>{
    const { data }=await supabase.rpc('my_taxi_active');
    setActive(data||null);
    if((data as any)?.id) lastActiveOrderRef.current=String((data as any).id);
    const accepted=!!data&&['accepted','arrived','in_progress'].includes((data as any).status);
    if(accepted && (data as any)?.id && (data as any)?.driver_name){ const m=await fetchRatings('taxi_order',[(data as any).id]); setDrvRating(m[(data as any).id]); }
    else setDrvRating(undefined);
    return data;
  },[]);
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
      if(real && ll){
        defaultPickupRef.current=[...ll];
        if(!lastActiveOrderRef.current){ setPickup(ll); setPointLabel('pick',ll,'موقعي'); }
        setLocationError(false);
      }else setLocationError(true);
      setLocationLoading(false);
    }).catch(()=>{ if(alive){ setLocationError(true); setLocationLoading(false); } });
    return ()=>{ alive=false; };
  },[]);
  const useMyLocation=async()=>{
    setLocationLoading(true);
    const {ll,real}=await getMyLocation();
    setLocationLoading(false);
    if(!real || !ll){ setLocationError(true); showToast('تعذر تحديد موقعك؛ اسمح بإذن الموقع ثم أعد المحاولة'); return; }
    setLocationError(false); defaultPickupRef.current=[...ll]; setPickup(ll); setPointLabel('pick',ll,'موقعي'); setMode('drop');
    mapRef.current?.animateToRegion?.({latitude:ll[0],longitude:ll[1],latitudeDelta:0.02,longitudeDelta:0.02});
  };
  const [route,setRoute]=useState<(RouteOption & {alternatives:RouteOption[]})|null>(null);
  const [routeState,setRouteState]=useState<'idle'|'loading'|'error'|'ok'>('idle');
  const [quotes,setQuotes]=useState<Record<string,TaxiQuote>>({});
  const [quoteCurrency,setQuoteCurrency]=useState('SYP');
  const [quoteError,setQuoteError]=useState<string|null>(null);
  const [quoteLoading,setQuoteLoading]=useState(false);
  const [retry,setRetry]=useState(0);
  const resetTaxiForm=useCallback(()=>{
    lastActiveOrderRef.current=null;
    labelReq.current.drop++;
    setActive(null);
    setHidden(null);
    setDrvRating(undefined);
    setDropoff(null);
    setDropoffLabel('');
    setMode('pick');
    setSelected('ordinary');
    setRadius(5);
    setRoute(null);
    setRouteState('idle');
    setQuotes({});
    setQuoteError(null);
    setQuoteLoading(false);
    const home=defaultPickupRef.current;
    if(home){
      const point=[...home];
      setPickup(point);
      setPointLabel('pick',point,'موقعي');
      mapRef.current?.animateToRegion?.({latitude:point[0],longitude:point[1],latitudeDelta:0.02,longitudeDelta:0.02});
    }else{
      labelReq.current.pick++;
      setPickup(null);
      setPickupLabel('');
    }
  },[setPointLabel]);
  useFocusEffect(useCallback(()=>{
    let focused=true;
    loadActive().then((a:any)=>{
      if(!focused) return;
      if(a){
        setPickup(a.pickup);
        setDropoff(a.dropoff);
        setPointLabel('pick',a.pickup,a.pickup_text||'نقطة الانطلاق');
        setPointLabel('drop',a.dropoff,a.dropoff_text||'نقطة الوصول');
      }else if(lastActiveOrderRef.current){
        resetTaxiForm();
      }
    });
    return ()=>{ focused=false; };
  },[loadActive,resetTaxiForm,setPointLabel]));
  useEffect(()=>{
    if(!pickup || !dropoff){ setRoute(null); setRouteState('idle'); return; }
    let alive=true; setRouteState('loading');
    getRoute([pickup,dropoff],{alternatives:true,preference:'shortest'}).then(r=>{
      if(!alive) return;
      if(r.ok){
        setRoute({km:r.km,min:r.min,path:r.path,snapStartMeters:r.snapStartMeters,snapEndMeters:r.snapEndMeters,alternatives:r.alternatives});
        const fitted=regionForRoutePoints([...r.path,...r.alternatives.flatMap(a=>a.path),pickup,dropoff]);
        if(fitted) mapRef.current?.animateToRegion?.(fitted,700);
        setRouteState('ok');
      }
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
  // يستقبل تطبيق الراكب ملخصاً مجمّعاً فقط؛ لا تُحفظ هنا إحداثيات سيارات أو مساراتها.
  type CategoryAvailability = { cat:string; free_count:number; busy_count:number; eta_min:number|null; eta_max:number|null };
  const [cars,setCars]=useState<CategoryAvailability[]>([]);
  const [carsLoaded,setCarsLoaded]=useState(false);
  const [carsError,setCarsError]=useState<string|null>(null);
  const picked=React.useRef(false);
  const loadCars=useCallback(async(rad:number):Promise<CategoryAvailability[]>=>{
    if(!pickup) return [];
    const { data,error }=await supabase.rpc('nearby_taxis',{p_lat:pickup[0], p_lng:pickup[1], p_radius:rad});
    if(error){
      console.warn('[taxi] nearby_taxis failed',error);
      setCars([]); setCarsError(errMsg(error,'تعذر تحميل سيارات التكسي')); setCarsLoaded(true); return [];
    }
    // Whitelist response fields so coordinates/path data can never enter passenger UI state.
    const list=((data||[]) as any[]).map((row:any):CategoryAvailability=>({
      cat:typeof row?.cat==='string'?row.cat.trim():'',
      free_count:Number.isFinite(Number(row?.free_count))?Math.max(0,Math.floor(Number(row.free_count))):0,
      busy_count:Number.isFinite(Number(row?.busy_count))?Math.max(0,Math.floor(Number(row.busy_count))):0,
      eta_min:row?.eta_min!=null&&Number.isFinite(Number(row.eta_min))?Number(row.eta_min):null,
      eta_max:row?.eta_max!=null&&Number.isFinite(Number(row.eta_max))?Number(row.eta_max):null,
    })).filter(row=>!!row.cat&&(row.free_count>0||row.busy_count>0));
    setCarsError(null); setCars(list); setCarsLoaded(true); return list;
  },[pickup?.[0],pickup?.[1]]);
  useEffect(()=>{
    if(!pickup || (active && active.id!==hidden)) return;
    loadCars(radius); const iv=setInterval(()=> loadCars(radius),10000);
    return ()=> clearInterval(iv);
  },[loadCars, radius, active?.id, hidden]);
  const hasCat=(c:string)=> cars.some(x=>x.cat===c);
  const freeCount=(c:string)=> Number(cars.find(x=>x.cat===c)?.free_count||0);
  const busyCount=(c:string)=> Number(cars.find(x=>x.cat===c)?.busy_count||0);
  const etaRange=(c:string)=>{
    const row=cars.find(x=>x.cat===c);
    return row?.eta_min!=null&&row?.eta_max!=null?`${row.eta_min}–${row.eta_max} دقيقة تقريباً`:null;
  };
  useEffect(()=>{
    if(picked.current||!cars.length) return;
    const cats=Object.keys(RATES);
    const best=cats.find(c=>freeCount(c)>0)||cats.find(c=>busyCount(c)>0);
    if(best) setSelected(best);
  },[cars]);
  const pickCat=async(k:string)=>{
    if(hasCat(k)){ picked.current=true; setSelected(k); return; }
    if(radius===5){
      setRadius(10); showToast('جاري البحث ضمن 10 كم...');
      const list=await loadCars(10);
      if(list.some((x:CategoryAvailability)=> x.cat===k)){ picked.current=true; setSelected(k); showToast(`تم التوسيع إلى 10 كم — توجد ${RATES[k].name}`); }
      else showToast(`لا توجد ${RATES[k].name} قريبة حالياً`);
    } else showToast(`لا توجد ${RATES[k].name} قريبة حالياً`);
  };
  const quote=(cat:string)=>quotes[cat];
  const fareLabel=(cat:string)=>quotes[cat]?formatLocalFare(quotes[cat].fare_local,quoteCurrency):'—';
  const onMapPress=(e:any)=>{
    if(showActive) return;
    const c=e.nativeEvent.coordinate;
    const ll=[c.latitude, c.longitude];
    if(mode==='pick'){ setPickup(ll); setPointLabel('pick',ll); setMode('drop'); }
    else { setDropoff(ll); setPointLabel('drop',ll); }
  };
  const confirmPickedPoint=(ll:number[],label?:string)=>{
    if(picker==='pick'){ setPickup(ll); setPointLabel('pick',ll,label); setMode('drop'); }
    if(picker==='drop'){ setDropoff(ll); setPointLabel('drop',ll,label); }
    setPicker(null);
    mapRef.current?.animateToRegion?.({latitude:ll[0],longitude:ll[1],latitudeDelta:0.02,longitudeDelta:0.02});
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
        pickup_lat: pickup[0], pickup_lng: pickup[1], pickup_text: pickupLabel || 'نقطة الانطلاق',
        dropoff_lat: dropoff[0], dropoff_lng: dropoff[1], dropoff_text: dropoffLabel || 'نقطة الوصول',
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
  const confirmCashPayment=async()=>{
    if(!active || active.status!=='completed' || cashBusy || active.cash_paid_at) return;
    setCashBusy(true);
    try{
      const { data, error }=await supabase.rpc('customer_taxi_cash_paid',{p_order:active.id});
      if(error || !(data as any)?.paid){ showToast(errMsg(error||'تعذر تسجيل الدفع النقدي','تعذر تسجيل الدفع النقدي')); return; }
      resetTaxiForm();
      showToast('تم تسجيل الدفع النقدي، يمكنك طلب رحلة جديدة');
    }catch(e:any){
      showToast(errMsg(e,'تعذر تسجيل الدفع النقدي'));
    }finally{
      setCashBusy(false);
    }
  };
  const payCash=()=>{
    if(!active || active.status!=='completed' || active.cash_paid_at || cashBusy) return;
    void confirmCashPayment();
  };
  const showActive=!!active && active.id!==hidden;
  const moving=showActive && ['accepted','arrived','in_progress'].includes(active.status);
  const activeEtaRange=Number(active?.search_radius_km||5)>=10?'10–25 دقيقة تقريباً':'5–15 دقيقة تقريباً';
  const pct=Number(active?.discount_pct||0), aFareUsd=Number(active?.fare||0), aFareLocal=Number(active?.fare_local||0);
  const aDiscUsd=Math.round(aFareUsd*pct)/100, aPayUsd=Math.round((aFareUsd-aDiscUsd)*100)/100;
  const aLocalCurrency=active?.local_currency||quoteCurrency;
  const aFareLabel=aFareLocal>0?formatLocalFare(aFareLocal,aLocalCurrency):formatWalletUsd(aFareUsd);
  const ST:Record<string,{icon:string,t:string,sub:string}>={
    pending:{icon:'⏳', t:'بانتظار قبول سائق', sub:'سيصلك إشعار عند قبول طلبك'},
    searching:{icon:'⏳', t:'بانتظار قبول سائق', sub:'سيصلك إشعار عند قبول طلبك'},
    accepted:{icon:'🚕', t:'السائق في الطريق إليك', sub:'وقت الوصول تقريبي؛ لا نعرض موقع السائق المباشر'},
    arrived:{icon:'📍', t:'وصل السائق', sub:'السائق بانتظارك عند نقطة الانطلاق'},
    in_progress:{icon:'🛣️', t:'الرحلة جارية', sub:'تُعرض حالة الرحلة دون تتبّع مباشر لموقع المركبة'},
    completed:{icon:'✅', t:'انتهت الرحلة', sub:pct>0? `ادفع نقداً أو من التطبيق ووفّر ${pct}%` : 'ادفع نقداً أو من التطبيق'},
  };
  const st=active? (ST[active.status]||ST.pending) : null;
  return (
    <View style={[s.page,{paddingTop:insets.top,paddingBottom:insets.bottom}]}>
      <View style={[s.header,{paddingLeft:insets.left+78,paddingRight:insets.right+12}]}>
        <Text style={s.h1}>🚕 طلب تكسي</Text>
        <Text style={s.sub}>اضغط على الخريطة لتحديد الانطلاق والوصول</Text>
      </View>
      <Pressable onPress={()=> router.push('/taxi-shared' as any)} style={{margin:8, height:42, borderRadius:12, borderWidth:1.5, borderColor:'#4F46E5', backgroundColor:'#eef2ff', alignItems:'center', justifyContent:'center'}}><Text style={{color:'#4F46E5', fontWeight:'900'}}>👥 رحلات راكب مشتركة — تصفح على طول المسار</Text></Pressable>
      <View style={s.modeBar}>
        <Pressable onPress={()=> setMode('pick')} style={[s.modeBtn, mode==='pick' && s.modeActive]}><Text style={[s.modeT, mode==='pick' && s.modeTActive]}>📍 الانطلاق</Text></Pressable>
        <Pressable onPress={()=> setMode('drop')} style={[s.modeBtn, mode==='drop' && s.modeActive]}><Text style={[s.modeT, mode==='drop' && s.modeTActive]}>🏁 الوصول</Text></Pressable>
        <Pressable onPress={useMyLocation} style={[s.modeBtn,{backgroundColor:'#f1f5f9'}]}><Text style={s.modeT}>📍 موقعي</Text></Pressable>
      </View>
      <View style={s.pointBar}>
        <Pressable disabled={showActive} onPress={()=>{setMode('pick');setPicker('pick');}} style={[s.pointBtn,mode==='pick'&&s.pointBtnActive]} accessibilityRole="button" accessibilityLabel="اختيار نقطة الانطلاق بالخريطة أو البحث أو الصوت">
          <View style={s.pointBtnHead}><Text style={s.pointTitle}>📍 الانطلاق</Text><Text style={s.pointWays}>🗺️ كتابة • 🎙️ صوت</Text></View>
          <Text style={s.pointLabel} numberOfLines={1}>{pickupLabel||'اضغط لاختيار الموقع'}</Text>
        </Pressable>
        <Pressable disabled={showActive} onPress={()=>{setMode('drop');setPicker('drop');}} style={[s.pointBtn,mode==='drop'&&s.pointBtnActive]} accessibilityRole="button" accessibilityLabel="اختيار نقطة الوصول بالخريطة أو البحث أو الصوت">
          <View style={s.pointBtnHead}><Text style={s.pointTitle}>🏁 الوصول</Text><Text style={s.pointWays}>🗺️ كتابة • 🎙️ صوت</Text></View>
          <Text style={s.pointLabel} numberOfLines={1}>{dropoffLabel||'اضغط لاختيار الموقع'}</Text>
        </Pressable>
      </View>
      <View style={{flex:1, marginHorizontal:10, borderRadius:14, overflow:'hidden', borderWidth:1, borderColor:'#e2e8f0'}}>
        {pickup ? (
          <>
            <MapView ref={mapRef} style={{flex:1}} basemap="hybrid" initialRegion={{latitude:pickup[0], longitude:pickup[1], latitudeDelta:0.02, longitudeDelta:0.02}} onPress={onMapPress}>
              <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
              <Marker coordinate={{latitude:pickup[0], longitude:pickup[1]}} pinColor="green"/>
              {dropoff && <Marker coordinate={{latitude:dropoff[0], longitude:dropoff[1]}} pinColor="red"/>}
              {route?.alternatives.map((alt,i)=><React.Fragment key={`taxi-alt-${i}`}>
                <Polyline coordinates={alt.path} strokeColor="#fff" strokeWidth={7} strokeOpacity={0.92}/>
                <Polyline coordinates={alt.path} strokeColor="#818CF8" strokeWidth={3} strokeOpacity={0.9}/>
              </React.Fragment>)}
              {route&&<>
                <Polyline coordinates={route.path} strokeColor="#fff" strokeWidth={9} strokeOpacity={0.96}/>
                <Polyline coordinates={route.path} strokeColor="#4F46E5" strokeWidth={5}/>
              </>}
              {route && pickup && route.snapStartMeters > 15 && <Polyline coordinates={[{latitude:pickup[0],longitude:pickup[1]}, route.path[0]]} strokeColor="#f59e0b" strokeWidth={4} lineDashPattern={[3,3]}/>}
              {route && dropoff && route.snapEndMeters > 15 && <Polyline coordinates={[route.path[route.path.length-1], {latitude:dropoff[0],longitude:dropoff[1]}]} strokeColor="#f59e0b" strokeWidth={4} lineDashPattern={[3,3]}/>}
            </MapView>
            <View style={[s.hint,{alignItems:'center',position:'relative',bottom:0,alignSelf:'stretch',maxWidth:'100%'}]}>
              <Text style={s.hintT}>{routeState==='loading'? '⏳ جاري حساب المسارات...' : routeState==='error'? '⚠️ تعذر حساب المسار' : route? `🛣️ الأقصر: ${route.km.toFixed(1)} كم • ${fmtMin(route.min)}${route.alternatives.length?` • من ${route.alternatives.length+1} مسارات`:' • مسار واحد متاح'}` : (mode==='pick'? 'اضغط على الخريطة لتحديد الانطلاق' : 'اضغط على الخريطة لتحديد الوصول')}</Text>
              {!!route?.alternatives.length&&<Text style={{fontSize:9,color:'#64748b',marginTop:2}}>الأغمق: الأقصر • الأفتح: بدائل</Text>}
            </View>
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
          {['accepted','arrived','in_progress'].includes(active.status) && !!active.driver_name && (
            <View style={s.driverBox}>
              <Text style={{fontWeight:'900', textAlign:'right'}}>👤 {active.driver_name}</Text>
              <Stars r={drvRating} small />
              <ProviderPhotos service="taxi" refId={active.id} />
              {!!(active.vehicle_model||active.vehicle_color||active.vehicle_plate) && <Text style={s.activeS}>🚗 {[active.vehicle_model, active.vehicle_color, active.vehicle_plate].filter(Boolean).join(' • ')}</Text>}
              {active.status==='accepted' && <Text style={[s.activeS,{color:'#047857', fontWeight:'900'}]}>🕒 الوصول التقريبي حسب نطاق البحث: {activeEtaRange}</Text>}
              {active.status==='in_progress' && Number(active.duration_min)>0 && <Text style={s.activeS}>🛣️ مدة المسار المقدّرة عند الطلب: نحو {fmtMin(Number(active.duration_min))}</Text>}
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
          <View style={{flexDirection:'row-reverse', flexWrap:'wrap', gap:8, marginTop:10}}>
            {active.status==='completed' ? active.cash_paid_at ? (
              <View style={[s.aBtn,{flex:2, backgroundColor:'#ecfdf5', borderWidth:1, borderColor:'#a7f3d0'}]}>
                <Text style={[s.aBtnT,{color:'#047857'}]}>✅ تم تسجيل الدفع نقداً للسائق</Text>
              </View>
            ) : (
              <>
                <Pressable onPress={payCash} disabled={cashBusy} style={[s.aBtn,{flex:1,backgroundColor:'#f59e0b',opacity:cashBusy?0.6:1}]}>
                  <Text style={[s.aBtnT,{color:'#fff'}]}>{cashBusy?'جارٍ التسجيل...':`💵 دفعت نقداً • ${aFareLabel}`}</Text>
                </Pressable>
                <Pressable onPress={payActive} style={[s.aBtn,{flex:1,backgroundColor:'#22c55e'}]}>
                  <Text style={[s.aBtnT,{color:'#fff'}]}>{`💳 المحفظة • ${formatWalletUsd(aPayUsd)}`}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={payActive} disabled style={[s.aBtn,{flex:2,backgroundColor:'#e2e8f0'}]}>
                <Text style={[s.aBtnT,{color:'#64748b'}]}>{`💳 الدفع من المحفظة بعد انتهاء الرحلة${pct>0? ` • خصم ${pct}%` : ''}`}</Text>
              </Pressable>
            )}
            {moving && <ShareTripBtn service="taxi" refId={active.id}/>}
            {['pending','searching'].includes(active.status) && <Pressable onPress={cancelActive} style={[s.aBtn,{backgroundColor:'#fff', borderWidth:1, borderColor:'#fecaca'}]}><Text style={[s.aBtnT,{color:'#991b1b'}]}>إلغاء الطلب</Text></Pressable>}
            {active.status==='completed' && <Pressable onPress={()=> setHidden(active.id)} style={[s.aBtn,{backgroundColor:'#f1f5f9'}]}><Text style={s.aBtnT}>إغلاق</Text></Pressable>}
          </View>
        </View>
      )}
      {!showActive && distance>0 && (
        <View style={s.sliderWrap}>
          <Text style={s.sliderTitle}>اختر الفئة • الأقصر {distance.toFixed(1)} كم • مدة متوقعة {fmtMin(route?.min||0)}</Text>
          <Text style={{fontSize:10,color:'#64748b',textAlign:'center',marginBottom:6}}>السعر بالليرة السورية الجديدة • العمولة على السائق • لا نعرض مواقع السائقين؛ وقت الوصول تقريبي حسب نطاق البحث</Text>
          {!!route&&Math.max(route.snapStartMeters,route.snapEndMeters)>25&&<Text style={{fontSize:10,color:'#b45309',textAlign:'center',marginBottom:6}}>الخط المتقطع يصل الدبوس بأقرب طريق • البداية {Math.round(route.snapStartMeters)}م / الوصول {Math.round(route.snapEndMeters)}م</Text>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:14, gap:10}}>
            {Object.entries(RATES).map(([k,v]:any)=> (
              <Pressable key={k} onPress={()=> pickCat(k)} style={[s.card, selected===k && hasCat(k) && s.cardActive, carsLoaded && !hasCat(k) && {opacity:.4}]}>
                <Text style={s.badge}>×{v.multiplier.toFixed(2)}</Text>
                <Text style={{fontSize:22, textAlign:'center'}}>{v.icon}</Text>
                <Text style={s.cardName}>{v.name}</Text>
                <Text style={s.price}>{fareLabel(k)}</Text>
                <Text style={{fontSize:9,color:'#64748b',marginTop:2}}>{quote(k)?`المحفظة ${formatWalletUsd(quote(k)!.fare_usd)}`:'جاري حساب السعر'}</Text>
                {!carsLoaded ? <Text style={s.cardStatus}>جارٍ البحث...</Text> : carsError ? <Text style={[s.cardStatus,{color:'#b91c1c'}]}>تعذر تحميل التوفر</Text> : !hasCat(k) ? <Text style={s.cardStatus}>غير متوفرة حالياً</Text> : freeCount(k)>0 ? (
                  <>
                    <Text style={[s.cardStatus,{color:'#047857'}]}>🟢 متفرغة الآن ({freeCount(k)})</Text>
                    <Text style={s.cardEta}>وصول تقريبي: {etaRange(k)||'غير متاح'}</Text>
                    {busyCount(k)>0 && <Text style={s.cardEta}>مشغولة أيضاً: {busyCount(k)}</Text>}
                  </>
                ) : (
                  <>
                    <Text style={[s.cardStatus,{color:'#b45309'}]}>🟠 مشغولة ({busyCount(k)})</Text>
                    <Text style={s.cardEta}>لا يتوفر تقدير وصول حتى تتفرغ سيارة.</Text>
                  </>
                )}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={publish} disabled={loading || quoteLoading || !quotes[selected] || !hasCat(selected)} style={[s.publish, (loading || quoteLoading || !quotes[selected] || !hasCat(selected)) && {backgroundColor:'#cbd5e1'}]}>
            <Text style={s.publishT}>{loading? 'جاري...' : quoteLoading? 'جاري حساب السعر...' : `📢 نشر الطلب — ${RATES[selected].name} • ${fareLabel(selected)}`}</Text>
          </Pressable>
          <Text style={{fontSize:11,color:(quoteError||carsError)?'#b91c1c':'#64748b',textAlign:'center',marginTop:6}}>{quoteError||carsError||(!carsLoaded? 'جاري البحث عن سيارات قريبة...' : !cars.length? `لا توجد سيارات ضمن ${radius} كم${radius===5? ' — اضغط على فئة للتوسيع' : ''}` : radius===10? 'تم التوسيع إلى 10 كم' : `سيُرسل ضمن ${radius} كم`)}</Text>
          {!!carsError&&<Pressable onPress={()=>void loadCars(radius)} style={{alignSelf:'center',marginTop:5,paddingHorizontal:14,paddingVertical:7,borderRadius:10,backgroundColor:'#fef2f2',borderWidth:1,borderColor:'#fecaca'}}><Text style={{color:'#991b1b',fontSize:11,fontWeight:'900'}}>إعادة تحميل السيارات</Text></Pressable>}
        </View>
      )}
      {toast && (
        <View style={{position:'absolute', bottom:Math.max(insets.bottom,8)+((showActive || distance>0)?360:12), alignSelf:'center', backgroundColor:'#065f46', paddingHorizontal:20, paddingVertical:12, borderRadius:999, shadowColor:'#000', shadowOpacity:0.2, shadowRadius:8, elevation:5}}>
          <Text style={{color:'#fff', fontWeight:'900', fontSize:13, textAlign:'center'}}>{toast}</Text>
        </View>
      )}
      <PointPicker visible={picker!==null} title={picker==='pick'?'حدد نقطة الانطلاق':'حدد نقطة الوصول'} color={picker==='pick'?'#16a34a':'#dc2626'} initial={picker==='pick'?pickup:dropoff} onClose={()=>setPicker(null)} onConfirm={confirmPickedPoint}/>
    </View>
  )
}
const s=StyleSheet.create({
  page:{flex:1, backgroundColor:'#f8fafc'},
  header:{padding:10, paddingLeft:78, paddingRight:12, backgroundColor:'#fff', borderBottomWidth:1, borderColor:'#e2e8f0'},
  h1:{fontSize:16, fontWeight:'900', textAlign:'center'},
  sub:{fontSize:11, color:'#64748b', textAlign:'center'},
  modeBar:{flexDirection:'row', gap:8, padding:8, backgroundColor:'#fff', borderBottomWidth:1, borderColor:'#e2e8f0'},
  modeBtn:{flex:1, height:40, borderRadius:12, borderWidth:1.5, borderColor:'#e2e8f0', backgroundColor:'#fff', alignItems:'center', justifyContent:'center'},
  modeActive:{backgroundColor:'#4F46E5', borderColor:'#4F46E5'},
  modeT:{fontSize:12, fontWeight:'800'},
  modeTActive:{color:'#fff'},
  pointBar:{flexDirection:'row-reverse',gap:8,paddingHorizontal:10,paddingVertical:8,backgroundColor:'#f8fafc'},
  pointBtn:{flex:1,minHeight:60,backgroundColor:'#fff',borderWidth:1.5,borderColor:'#cbd5e1',borderRadius:12,paddingHorizontal:10,paddingVertical:8},
  pointBtnActive:{borderColor:'#4F46E5',backgroundColor:'#eef2ff'},
  pointBtnHead:{flexDirection:'row-reverse',justifyContent:'space-between',alignItems:'center',gap:4},
  pointTitle:{fontSize:12,fontWeight:'900',color:'#0f172a'},
  pointWays:{fontSize:9,fontWeight:'800',color:'#4F46E5'},
  pointLabel:{fontSize:11,fontWeight:'700',color:'#475569',textAlign:'right',marginTop:5},
  locationGate:{flex:1, alignItems:'center', justifyContent:'center', padding:20, gap:12, backgroundColor:'#f8fafc'},
  locationGateT:{fontSize:13, lineHeight:20, fontWeight:'800', color:'#334155', textAlign:'center'},
  locationRetry:{height:42, paddingHorizontal:16, borderRadius:12, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center'},
  locationRetryT:{color:'#fff', fontWeight:'900', fontSize:12},
  hint:{position:'relative', alignSelf:'stretch', backgroundColor:'#f8fafc', paddingHorizontal:10, paddingVertical:5, borderTopWidth:1, borderColor:'#e2e8f0'},
  hintT:{color:'#334155', fontSize:10, textAlign:'center'},
  sliderWrap:{backgroundColor:'#fff', borderTopWidth:1, borderColor:'#e2e8f0', paddingVertical:10},
  sliderTitle:{fontSize:12, fontWeight:'900', paddingHorizontal:14, marginBottom:8},
  card:{width:158, minHeight:150, borderWidth:1.5, borderColor:'#e2e8f0', borderRadius:14, padding:10, backgroundColor:'#fff', alignItems:'center'},
  cardActive:{borderColor:'#4F46E5', backgroundColor:'#eef2ff'},
  badge:{position:'absolute', top:6, left:6, fontSize:9, backgroundColor:'#f1f5f9', paddingHorizontal:6, paddingVertical:2, borderRadius:999, overflow:'hidden'},
  cardName:{fontSize:12, fontWeight:'900', textAlign:'center', marginTop:4},
  price:{fontSize:16, fontWeight:'900', color:'#4F46E5', marginTop:4},
  cardStatus:{fontSize:9, color:'#64748b', fontWeight:'900', textAlign:'center', marginTop:4},
  cardEta:{fontSize:9, color:'#475569', fontWeight:'700', textAlign:'center', lineHeight:12, marginTop:2},
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
