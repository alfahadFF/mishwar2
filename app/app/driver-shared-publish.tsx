import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import { guestBlocked } from '../utils/guest';
import { errMsg } from '../utils/errors';
import { getRoute, fmtMin } from '../utils/route';
import { placeName } from '../utils/geocode';
import { getMyLocation } from '../utils/location';
import DatePicker, { ymd } from '../components/DatePicker';
import TimePicker, { timeLabel } from '../components/TimePicker';
import PointPicker from '../components/PointPicker';
import { MapView, UrlTile, Marker, Polyline } from '../components/OpenMapView';
const CATS=[{k:'ordinary',l:'🚗 قياسية'},{k:'economy',l:'⚡ اقتصادية'},{k:'luxury',l:'✨ فاخرة'},{k:'van_8',l:'🚐 فان 8'},{k:'van_11',l:'🚐 فان 11'}];
export default function DriverSharedPublish(){
  const insets=useSafeAreaInsets();
  const {height:windowHeight}=useWindowDimensions();
  const mapRef=useRef<any>(null);
  const [pickup,setPickup]=useState<number[]|null>(null);
  const [dropoff,setDropoff]=useState<number[]|null>(null);
  const [vacancy,setVacancy]=useState<number[]|null>(null);
  const [pickupLabel,setPickupLabel]=useState('');
  const [dropoffLabel,setDropoffLabel]=useState('');
  const [vacancyLabel,setVacancyLabel]=useState('');
  const [pointPicker,setPointPicker]=useState<'pick'|'drop'|'vacancy'|null>(null);
  const pointLabelReq=useRef({pick:0,drop:0,vacancy:0});
  const manualPickupRef=useRef(false);
  const [mode,setMode]=useState<'pick'|'drop'|'vacancy'>('pick');
  const [departDate,setDepartDate]=useState<string>(ymd(new Date()));
  const [departHm,setDepartHm]=useState<string>('');
  const [dateOpen,setDateOpen]=useState(false);
  const [timeOpen,setTimeOpen]=useState(false);
  const [cat,setCat]=useState('ordinary');
  const departTime=departHm? `${departDate}T${departHm}` : '';
  const [totalSeats,setTotalSeats]=useState(4);
  const [price,setPrice]=useState('');
  const [hasVacancy,setHasVacancy]=useState(false);
  const [toast,setToast]=useState<string|null>(null);
  const setRoutePoint=(which:'pick'|'drop'|'vacancy',ll:number[],knownLabel?:string,manual=true)=>{
    if(which==='pick' && manual) manualPickupRef.current=true;
    const setCoordinates=which==='pick'?setPickup:which==='drop'?setDropoff:setVacancy;
    const setText=which==='pick'?setPickupLabel:which==='drop'?setDropoffLabel:setVacancyLabel;
    const req=++pointLabelReq.current[which];
    setCoordinates(ll);
    if(knownLabel){setText(knownLabel);return;}
    setText('جارٍ تحديد اسم المكان...');
    placeName(ll).then(name=>{if(pointLabelReq.current[which]===req)setText(name);});
  };
  const [locationLoading,setLocationLoading]=useState(true);
  const [locationError,setLocationError]=useState(false);
  const [route,setRoute]=useState<any>(null);
  const [routeState,setRouteState]=useState<'idle'|'loading'|'error'|'ok'>('idle');
  const locatePickup=useCallback(async()=>{
    setLocationLoading(true);
    try{
      const {ll,real}=await getMyLocation();
      if(!real || !ll){ setLocationError(true); return; }
      if(manualPickupRef.current) return;
      setRoutePoint('pick',ll,'موقعي',false); setMode('drop'); setLocationError(false);
    }catch{ setLocationError(true); }
    finally{ setLocationLoading(false); }
  },[]);
  useEffect(()=>{ void locatePickup(); },[locatePickup]);
  useEffect(()=>{
    if(!pickup || !dropoff){ setRoute(null); setRouteState('idle'); return; }
    const pts=hasVacancy && vacancy ? [pickup,vacancy,dropoff] : [pickup,dropoff];
    let alive=true; setRouteState('loading');
    getRoute(pts).then(r=>{ if(!alive) return; if(r.ok){ setRoute(r); setRouteState('ok'); } else { setRoute(null); setRouteState('error'); } });
    return ()=>{ alive=false; };
  },[JSON.stringify([pickup,dropoff,vacancy,hasVacancy])]);
  useEffect(()=>{
    if(!pickup) return;
    const raw=route?.path?.length?route.path:[pickup,...(hasVacancy&&vacancy?[vacancy]:[]),...(dropoff?[dropoff]:[])];
    const points=raw.map((p:any)=>Array.isArray(p)?[Number(p[0]),Number(p[1])]:[Number(p.latitude),Number(p.longitude)])
      .filter((p:number[])=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
    if(!points.length) return;
    const lats=points.map((p:number[])=>p[0]),lngs=points.map((p:number[])=>p[1]);
    mapRef.current?.animateToRegion?.({latitude:(Math.min(...lats)+Math.max(...lats))/2,longitude:(Math.min(...lngs)+Math.max(...lngs))/2,
      latitudeDelta:Math.max(0.02,(Math.max(...lats)-Math.min(...lats))*1.5+0.01),longitudeDelta:Math.max(0.02,(Math.max(...lngs)-Math.min(...lngs))*1.5+0.01)},600);
  },[pickup?.[0],pickup?.[1],dropoff?.[0],dropoff?.[1],vacancy?.[0],vacancy?.[1],hasVacancy,route?.path]);
  const showToast=(m:string)=>{ setToast(m); setTimeout(()=> setToast(null),2500); };
  const onMapPress=(e:any)=>{
    const c=e.nativeEvent.coordinate; const ll=[c.latitude,c.longitude];
    setRoutePoint(mode,ll);
    if(mode==='pick' && !dropoff) setMode('drop');
  };
  const confirmPoint=(ll:number[],label:string)=>{
    if(!pointPicker) return;
    const target=pointPicker;
    setRoutePoint(target,ll,label);
    setMode(target==='pick' && !dropoff?'drop':target);
    setPointPicker(null);
  };
  const canPublish=routeState==='ok' && pickup && dropoff && departTime && price && Number(price)>0 && (!hasVacancy || vacancy);
  const publish=async()=>{
    if(!canPublish) return;
    try{
      const { data:{user} }=await supabase.auth.getUser(); if(!user){ guestBlocked(); return; }
      if(new Date(departTime).getTime() < Date.now()) throw new Error('PAST_TIME');
      const [fromName,toName]=await Promise.all([pickupLabel||placeName(pickup!), dropoffLabel||placeName(dropoff!)]);
      const payload:any={
        driver_id:user.id,
        pickup_text: fromName,
        pickup_lat: pickup![0], pickup_lng: pickup![1],
        dropoff_text: toName,
        dropoff_lat: dropoff![0], dropoff_lng: dropoff![1],
        waypoints: hasVacancy && vacancy ? [pickup, vacancy, dropoff] : [pickup, dropoff],
        route_polyline: route.path.map((p:any)=> [p.latitude,p.longitude]),
        distance_km: Number(route.km.toFixed(2)),
        duration_min: Math.round(route.min),
        has_vacancy_mid: hasVacancy,
        vacancy_lat: hasVacancy && vacancy ? vacancy[0] : null,
        vacancy_lng: hasVacancy && vacancy ? vacancy[1] : null,
        departure_time: new Date(departTime).toISOString(),
        available_seats: totalSeats,
        total_seats: totalSeats,
        price_per_seat: Number(price),
        vehicle_category:cat,
      };
      const { error }=await supabase.from('taxi_shared_trips').insert(payload);
      if(error) throw error;
      showToast('تم نشر رحلة الراكب');
    }catch(e:any){ showToast(errMsg(e, 'تعذر نشر الرحلة')); }
  };
  return (
    <View style={[s.page,{paddingTop:insets.top}]}>
      <ScrollView contentContainerStyle={{padding:10, paddingBottom:100+insets.bottom}} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>👥 نشر رحلة راكب</Text>
        <Text style={s.sub}>حدد المسار والوقت والمقاعد — مع خيار شاغر منتصف الطريق</Text>
        <View style={s.endpointRow}>
          <Pressable onPress={()=>{setMode('pick');setPointPicker('pick');}} style={[s.endpointCard,mode==='pick'&&s.endpointActive]} accessibilityRole="button" accessibilityLabel="اختيار نقطة الانطلاق بالكتابة أو الصوت أو الخريطة">
            <Text style={s.endpointTitle}>📍 الانطلاق</Text>
            <Text style={s.endpointLabel} numberOfLines={1}>{pickupLabel||'اكتب أو قل اسم المكان'}</Text>
          </Pressable>
          <Pressable onPress={()=>{setMode('drop');setPointPicker('drop');}} style={[s.endpointCard,mode==='drop'&&s.endpointActive]} accessibilityRole="button" accessibilityLabel="اختيار نقطة الوصول بالكتابة أو الصوت أو الخريطة">
            <Text style={s.endpointTitle}>🏁 الوصول</Text>
            <Text style={s.endpointLabel} numberOfLines={1}>{dropoffLabel||'اكتب أو قل اسم المكان'}</Text>
          </Pressable>
        </View>
        <View style={[s.mapBox,{height:Math.max(280,Math.min(400,windowHeight*0.42)),marginTop:10}]}>
          {pickup ? (
            <>
            <MapView ref={mapRef} style={{flex:1}} basemap="hybrid" initialRegion={{latitude:pickup[0], longitude:pickup[1], latitudeDelta:0.02, longitudeDelta:0.02}} onPress={onMapPress}>
              <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
              <Marker coordinate={{latitude:pickup[0], longitude:pickup[1]}} pinColor="green"/>
              {dropoff && <Marker coordinate={{latitude:dropoff[0], longitude:dropoff[1]}} pinColor="red"/>}
              {hasVacancy && vacancy && <Marker coordinate={{latitude:vacancy[0], longitude:vacancy[1]}} pinColor="orange"/>}
              {route && <Polyline coordinates={route.path} strokeColor="#4F46E5" strokeWidth={5}/>}
            </MapView>
            <View style={s.mapHint}><Text style={s.mapHintText}>{mode==='pick'?'انقر الخريطة لتحديد الانطلاق':mode==='drop'?'انقر الخريطة لتحديد الوصول':'انقر الخريطة لتحديد نقطة الشاغر'}</Text></View>
            </>
          ) : (
            <View style={s.locationGate}>
              <Text style={s.locationGateT}>{locationLoading?'📡 جارٍ تحديد موقعك لفتح الخريطة بالقرب منك':locationError?'تعذر تحديد موقعك. اسمح بإذن الموقع ثم أعد المحاولة.':'حدد موقع الانطلاق لفتح الخريطة'}</Text>
              {!locationLoading && <Pressable onPress={locatePickup} style={s.locationRetry}><Text style={s.locationRetryT}>تحديد موقعي وإعادة المحاولة</Text></Pressable>}
            </View>
          )}
        </View>
        {routeState!=='idle' && <View style={[s.card,{backgroundColor:'#eef2ff',borderColor:'#c7d2fe'}]}><Text style={{textAlign:'center',fontWeight:'900',color:'#3730a3'}}>{routeState==='loading'? '⏳ جاري حساب المسار على الطرق...' : routeState==='error'? '⚠️ تعذر حساب المسار — أعد تحديد النقطة' : `🛣️ ${route.km.toFixed(1)} كم على الطريق • ${fmtMin(route.min)}`}</Text></View>}
        <View style={s.card}>
          <Text style={s.h2}>🕖 موعد الانطلاق</Text>
          <View style={{flexDirection:'row-reverse', gap:8, marginTop:6}}>
            <Pressable onPress={()=> setDateOpen(true)} style={s.modeBtn}><Text style={s.modeT}>📅 {departDate}</Text></Pressable>
            <Pressable onPress={()=> setTimeOpen(true)} style={s.modeBtn}><Text style={s.modeT}>🕒 {departHm? timeLabel(departHm) : 'الساعة'}</Text></Pressable>
          </View>
        </View>
        <View style={s.card}>
          <Text style={s.h2}>🚘 فئة المركبة</Text>
          <View style={{flexDirection:'row-reverse', flexWrap:'wrap', gap:6, marginTop:6}}>
            {CATS.map(c=> <Pressable key={c.k} onPress={()=> setCat(c.k)} style={[s.chip, cat===c.k && s.modeActive]}><Text style={[s.modeT, cat===c.k && s.modeTActive]}>{c.l}</Text></Pressable>)}
          </View>
        </View>
        <View style={s.card}>
          <Text style={s.h2}>💺 المقاعد والسعر</Text>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <Text style={{fontWeight:'800'}}>عدد المقاعد</Text>
            <View style={s.stepper}>
              <Pressable onPress={()=> setTotalSeats(s=> Math.max(1,s-1))} style={s.stepBtn}><Text>−</Text></Pressable><Text style={s.stepVal}>{totalSeats}</Text><Pressable onPress={()=> setTotalSeats(s=> Math.min(11,s+1))} style={s.stepBtn}><Text>＋</Text></Pressable>
            </View>
          </View>
          <Text style={[s.h2,{marginTop:8}]}>سعر المقعد USD</Text><TextInput value={price} onChangeText={setPrice} placeholder="2.00" keyboardType="numeric" style={s.input}/>
        </View>
        <View style={s.card}>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
            <View><Text style={s.h2}>🔄 يوجد شاغر في منتصف الطريق</Text><Text style={{fontSize:11,color:'#64748b'}}>سيركب زبون وينزل منتصف الطريق</Text></View>
            <Pressable onPress={()=> setHasVacancy(v=> !v)} style={[s.toggle, hasVacancy && s.toggleActive]}><View style={[s.knob, hasVacancy && {transform:[{translateX: -18}]}]}/></Pressable>
          </View>
          {hasVacancy && (
            <View style={{marginTop:10}}>
              <Text style={s.h2}>أين سينزل الراكب؟</Text>
              <Pressable onPress={()=>{setMode('vacancy');setPointPicker('vacancy');}} style={[s.locationButton,mode==='vacancy'&&s.endpointActive]} accessibilityRole="button" accessibilityLabel="اختيار نقطة الشاغر بالكتابة أو الصوت أو الخريطة">
                <Text style={s.locationButtonText}>{vacancyLabel||'اختر مكان الشاغر بالكتابة أو الصوت'}</Text><Text>📍</Text>
              </Pressable>
            </View>
          )}
        </View>
        <Pressable onPress={publish} disabled={!canPublish} style={[s.publish, !canPublish && {backgroundColor:'#cbd5e1'}]}><Text style={s.publishT}>📢 نشر رحلة راكب</Text></Pressable>
      </ScrollView>
      <DatePicker visible={dateOpen} value={departDate} minDate={new Date()} title="تاريخ الرحلة" onClose={()=> setDateOpen(false)} onPick={setDepartDate}/>
      <TimePicker visible={timeOpen} value={departHm} title="ساعة الانطلاق" onClose={()=> setTimeOpen(false)} onPick={setDepartHm}/>
      <PointPicker visible={pointPicker!==null} title={pointPicker==='pick'?'حدد نقطة الانطلاق':pointPicker==='drop'?'حدد نقطة الوصول':'حدد نقطة الشاغر'} color={pointPicker==='pick'?'#16a34a':pointPicker==='drop'?'#dc2626':'#f97316'} initial={pointPicker==='pick'?pickup:pointPicker==='drop'?dropoff:vacancy} onClose={()=> setPointPicker(null)} onConfirm={confirmPoint}/>
      {toast && <View style={[s.toast,{bottom:Math.max(insets.bottom,8)+16}]}><Text style={s.toastT}>{toast}</Text></View>}
    </View>
  )
}
const s=StyleSheet.create({
  page:{flex:1, backgroundColor:'#f8fafc'},
  h1:{fontSize:16, fontWeight:'900', textAlign:'center', marginTop:8},
  sub:{fontSize:11, color:'#64748b', textAlign:'center'},
  endpointRow:{flexDirection:'row-reverse',gap:8,marginTop:10},
  endpointCard:{flex:1,minHeight:58,borderRadius:12,borderWidth:1.5,borderColor:'#e2e8f0',backgroundColor:'#fff',justifyContent:'center',paddingHorizontal:10,gap:4},
  endpointActive:{borderColor:'#4F46E5',backgroundColor:'#eef2ff'},
  endpointTitle:{fontSize:12,fontWeight:'900',color:'#0f172a',textAlign:'right'},
  endpointLabel:{fontSize:10,fontWeight:'700',color:'#64748b',textAlign:'right'},
  mapBox:{borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:'#e2e8f0'},
  mapHint:{position:'absolute',top:8,alignSelf:'center',backgroundColor:'rgba(15,23,42,.86)',paddingHorizontal:12,paddingVertical:6,borderRadius:999},
  mapHintText:{color:'#fff',fontSize:11,fontWeight:'800'},
  locationButton:{minHeight:44,borderRadius:12,borderWidth:1.5,borderColor:'#e2e8f0',backgroundColor:'#fff',flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:10,marginTop:6},
  locationButtonText:{flex:1,fontSize:11,fontWeight:'800',color:'#334155',textAlign:'right'},
  modeBtn:{flex:1, height:40, borderRadius:12, borderWidth:1.5, borderColor:'#e2e8f0', backgroundColor:'#fff', alignItems:'center', justifyContent:'center'},

  modeActive:{backgroundColor:'#4F46E5', borderColor:'#4F46E5'},
  modeT:{fontSize:12, fontWeight:'800'},
  modeTActive:{color:'#fff'},
  locationGate:{flex:1, alignItems:'center', justifyContent:'center', padding:18, gap:10, backgroundColor:'#f8fafc'},
  locationGateT:{fontSize:12, lineHeight:18, fontWeight:'800', color:'#334155', textAlign:'center'},
  locationRetry:{height:38, paddingHorizontal:14, borderRadius:11, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center'},
  locationRetryT:{color:'#fff', fontWeight:'900', fontSize:11},
  chip:{paddingHorizontal:12, height:36, borderRadius:999, borderWidth:1.5, borderColor:'#e2e8f0', backgroundColor:'#fff', alignItems:'center', justifyContent:'center'},
  card:{backgroundColor:'#fff', borderWidth:1, borderColor:'#e2e8f0', borderRadius:14, padding:12, marginTop:10},
  h2:{fontSize:13, fontWeight:'900'},
  input:{borderWidth:1.5, borderColor:'#e2e8f0', borderRadius:12, height:44, paddingHorizontal:12, backgroundColor:'#fff', marginTop:6},
  stepper:{flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#f1f5f9', borderRadius:999, padding:4},
  stepBtn:{width:32, height:32, borderRadius:999, borderWidth:1, borderColor:'#e2e8f0', backgroundColor:'#fff', alignItems:'center', justifyContent:'center'},
  stepVal:{minWidth:24, textAlign:'center', fontWeight:'900'},
  toggle:{width:44, height:26, borderRadius:999, backgroundColor:'#e2e8f0', justifyContent:'center', padding:2},
  toggleActive:{backgroundColor:'#22c55e'},
  knob:{width:22, height:22, borderRadius:999, backgroundColor:'#fff'},
  publish:{height:48, borderRadius:14, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center', marginTop:12},
  publishT:{color:'#fff', fontWeight:'900', fontSize:15},
  toast:{position:'absolute', bottom:20, alignSelf:'center', backgroundColor:'#065f46', paddingHorizontal:20, paddingVertical:12, borderRadius:999},
  toastT:{color:'#fff', fontWeight:'900', fontSize:13},
});
