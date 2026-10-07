import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native';
import { supabase } from '../utils/supabase';
import { guestBlocked } from '../utils/guest';
import { errMsg } from '../utils/errors';
import { getRoute, fmtMin } from '../utils/route';
import { placeName } from '../utils/geocode';
import DatePicker, { ymd } from '../components/DatePicker';
import TimePicker, { timeLabel } from '../components/TimePicker';
import { MapView, UrlTile, Marker, Polyline } from '../components/OpenMapView';
const CATS=[{k:'ordinary',l:'🚗 قياسية'},{k:'economy',l:'⚡ اقتصادية'},{k:'luxury',l:'✨ فاخرة'},{k:'van_8',l:'🚐 فان 8'},{k:'van_11',l:'🚐 فان 11'}];
export default function DriverSharedPublish(){
  const [pickup,setPickup]=useState<number[]|null>(null);
  const [dropoff,setDropoff]=useState<number[]|null>(null);
  const [vacancy,setVacancy]=useState<number[]|null>(null);
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
  const [route,setRoute]=useState<any>(null);
  const [routeState,setRouteState]=useState<'idle'|'loading'|'error'|'ok'>('idle');
  useEffect(()=>{
    if(!pickup || !dropoff){ setRoute(null); setRouteState('idle'); return; }
    const pts=hasVacancy && vacancy ? [pickup,vacancy,dropoff] : [pickup,dropoff];
    let alive=true; setRouteState('loading');
    getRoute(pts).then(r=>{ if(!alive) return; if(r.ok){ setRoute(r); setRouteState('ok'); } else { setRoute(null); setRouteState('error'); } });
    return ()=>{ alive=false; };
  },[JSON.stringify([pickup,dropoff,vacancy,hasVacancy])]);
  const showToast=(m:string)=>{ setToast(m); setTimeout(()=> setToast(null),2500); };
  const onMapPress=(e:any)=>{
    const c=e.nativeEvent.coordinate; const ll=[c.latitude,c.longitude];
    if(mode==='pick') setPickup(ll);
    else if(mode==='drop') setDropoff(ll);
    else if(mode==='vacancy') setVacancy(ll);
  };
  const canPublish=routeState==='ok' && pickup && dropoff && departTime && price && Number(price)>0 && (!hasVacancy || vacancy);
  const publish=async()=>{
    if(!canPublish) return;
    try{
      const { data:{user} }=await supabase.auth.getUser(); if(!user){ guestBlocked(); return; }
      if(new Date(departTime).getTime() < Date.now()) throw new Error('PAST_TIME');
      const [fromName,toName]=await Promise.all([placeName(pickup!), placeName(dropoff!)]);
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
    <View style={s.page}>
      <ScrollView contentContainerStyle={{padding:10, paddingBottom:100}}>
        <Text style={s.h1}>👥 نشر رحلة راكب</Text>
        <Text style={s.sub}>حدد المسار والوقت والمقاعد — مع خيار شاغر منتصف الطريق</Text>
        <View style={{flexDirection:'row', gap:8, marginTop:10}}>
          <Pressable onPress={()=> setMode('pick')} style={[s.modeBtn, mode==='pick' && s.modeActive]}><Text style={[s.modeT, mode==='pick' && s.modeTActive]}>📍 الانطلاق</Text></Pressable>
          <Pressable onPress={()=> setMode('drop')} style={[s.modeBtn, mode==='drop' && s.modeActive]}><Text style={[s.modeT, mode==='drop' && s.modeTActive]}>🏁 الوصول</Text></Pressable>
        </View>
        <View style={{height:240, borderRadius:14, overflow:'hidden', marginTop:10, borderWidth:1, borderColor:'#e2e8f0'}}>
          <MapView style={{flex:1}} initialRegion={{latitude:33.5138, longitude:36.2765, latitudeDelta:0.06, longitudeDelta:0.06}} onPress={onMapPress}>
            <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
            {pickup && <Marker coordinate={{latitude:pickup[0], longitude:pickup[1]}} pinColor="green"/>}
            {dropoff && <Marker coordinate={{latitude:dropoff[0], longitude:dropoff[1]}} pinColor="red"/>}
            {hasVacancy && vacancy && <Marker coordinate={{latitude:vacancy[0], longitude:vacancy[1]}} pinColor="orange"/>}
            {route && <Polyline coordinates={route.path} strokeColor="#4F46E5" strokeWidth={5}/>}
          </MapView>
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
              <Pressable onPress={()=> setMode('vacancy')} style={[s.modeBtn, mode==='vacancy' && s.modeActive]}><Text style={[s.modeT, mode==='vacancy' && s.modeTActive]}>📍 حدد على الخريطة</Text></Pressable>
              {vacancy && <Text style={{fontSize:11,color:'#4F46E5',marginTop:6}}>{vacancy[0].toFixed(5)}, {vacancy[1].toFixed(5)}</Text>}
            </View>
          )}
        </View>
        <Pressable onPress={publish} disabled={!canPublish} style={[s.publish, !canPublish && {backgroundColor:'#cbd5e1'}]}><Text style={s.publishT}>📢 نشر رحلة راكب</Text></Pressable>
      </ScrollView>
      <DatePicker visible={dateOpen} value={departDate} minDate={new Date()} title="تاريخ الرحلة" onClose={()=> setDateOpen(false)} onPick={setDepartDate}/>
      <TimePicker visible={timeOpen} value={departHm} title="ساعة الانطلاق" onClose={()=> setTimeOpen(false)} onPick={setDepartHm}/>
      {toast && <View style={s.toast}><Text style={s.toastT}>{toast}</Text></View>}
    </View>
  )
}
const s=StyleSheet.create({
  page:{flex:1, backgroundColor:'#f8fafc'},
  h1:{fontSize:16, fontWeight:'900', textAlign:'center', marginTop:8},
  sub:{fontSize:11, color:'#64748b', textAlign:'center'},
  modeBtn:{flex:1, height:40, borderRadius:12, borderWidth:1.5, borderColor:'#e2e8f0', backgroundColor:'#fff', alignItems:'center', justifyContent:'center'},
  modeActive:{backgroundColor:'#4F46E5', borderColor:'#4F46E5'},
  modeT:{fontSize:12, fontWeight:'800'},
  modeTActive:{color:'#fff'},
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
