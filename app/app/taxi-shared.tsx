import Stars from '../components/Stars';
import { fetchRatings, Rating } from '../utils/rating';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { supabase } from '../utils/supabase';
import { guestBlocked } from '../utils/guest';
import { getRoute, fmtMin } from '../utils/route';
import { nearestOnPath, NEAR_KM } from '../utils/geo';
import MySharedJoins from '../components/MySharedJoins';
import { MapView, UrlTile, Marker, Polyline } from '../components/OpenMapView';

type LL=number[];
type Trip={rating?:Rating, id:string, from:string, to:string, fromLL:LL, toLL:LL, time:string, total:number, left:number, price:number, path?:LL[], km?:number, min?:number, routeFailed?:boolean, demo?:boolean, car?:LL};
type Req={id:string, trip_id:string, status:string, extra_fee:number, detour_km?:number, detour_min?:number, detour_path?:LL[], pickup?:LL, dropoff?:LL};

const toLatLng=(p:LL)=>({latitude:p[0], longitude:p[1]});

export default function TaxiSharedScreen(){
  const [trips,setTrips]=useState<Trip[]>([]);
  const [pickup,setPickup]=useState<LL|null>(null);
  const [dropoff,setDropoff]=useState<LL|null>(null);
  const [mode,setMode]=useState<'pick'|'drop'>('pick');
  const [selected,setSelected]=useState<string|null>(null);
  const [myReqs,setMyReqs]=useState<Record<string,Req>>({});
  const [confirm,setConfirm]=useState<{trip:Trip, off:number, km:number, min:number, path:LL[], wrongDir:boolean}|null>(null);
  const [counter,setCounter]=useState<{trip:Trip, req:Req}|null>(null);
  const [busy,setBusy]=useState(false);
  const [toast,setToast]=useState<{m:string,err?:boolean}|null>(null);
  const toastTimer=useRef<any>(null);
  // تنبيه صوتي/اهتزاز عند وصول رد السائق
  const notify=(type:'success'|'warning'|'error'='warning')=>{ Haptics.notificationAsync(type==='success'? Haptics.NotificationFeedbackType.Success : type==='error'? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning); Vibration.vibrate([0,200,100,200]); };
  const showToast=(m:string, err=false)=>{ setToast({m,err}); clearTimeout(toastTimer.current); toastTimer.current=setTimeout(()=> setToast(null),2800); };

  // تحميل الرحلات + حساب مساراتها الحقيقية
  useEffect(()=>{
    (async()=>{
      let list:Trip[]=[];
      const { data }=await supabase.from('taxi_shared_trips').select('*').eq('status','pending').gt('available_seats',0).order('departure_time');
      if(data && data.length){
        list=data.map((r:any)=>({ id:r.id, from:r.pickup_text, to:r.dropoff_text, fromLL:[r.pickup_lat,r.pickup_lng], toLL:[r.dropoff_lat,r.dropoff_lng],
          time:new Date(r.departure_time).toLocaleString('ar',{weekday:'short',hour:'2-digit',minute:'2-digit'}), total:r.total_seats, left:r.available_seats,
          price:Number(r.price_per_seat), path:r.route_polyline||undefined, km:r.distance_km!=null?Number(r.distance_km):undefined, min:r.duration_min??undefined,
          car: r.started_at && r.driver_lat!=null? [r.driver_lat, r.driver_lng] : undefined }));
      }
      setTrips(list);
      const withRoutes=await Promise.all(list.map(async t=>{
        if(t.path && t.km!=null) return t;
        const r=await getRoute([t.fromLL,t.toLL]);
        return r.ok? {...t, path:r.path.map(p=>[p.latitude,p.longitude]), km:r.km, min:r.min} : {...t, routeFailed:true};
      }));
      setTrips(withRoutes);
      const rm=await fetchRatings('shared_trip', withRoutes.map(t=>t.id));
      setTrips(withRoutes.map(t=>({...t, rating:rm[t.id]})));
    })();
    (async()=>{
      const { status }=await Location.requestForegroundPermissionsAsync();
      if(status==='granted'){ const loc=await Location.getCurrentPositionAsync({}); setPickup([loc.coords.latitude, loc.coords.longitude]); setMode('drop'); }
    })();
  },[]);

  // متابعة رد السائق فوراً (Realtime)
  useEffect(()=>{
    let ch:any;
    (async()=>{
      const { data:{user} }=await supabase.auth.getUser(); if(!user) return;
      ch=supabase.channel('my_shared_requests')
        .on('postgres_changes',{event:'UPDATE', schema:'public', table:'taxi_shared_requests', filter:`passenger_id=eq.${user.id}`}, (payload:any)=>{
          const r=payload.new; onReqUpdate({id:r.id, trip_id:r.trip_id, status:r.status, extra_fee:Number(r.extra_fee||0),
            detour_km:r.detour_km!=null? Number(r.detour_km):undefined, detour_min:r.detour_min??undefined, detour_path:r.detour_polyline||undefined,
            pickup:r.pickup_lat!=null? [r.pickup_lat,r.pickup_lng]:undefined, dropoff:r.dropoff_lat!=null? [r.dropoff_lat,r.dropoff_lng]:undefined});
        }).subscribe();
    })();
    return ()=>{ if(ch) supabase.removeChannel(ch); };
  },[trips, myReqs]);

  const onReqUpdate=(r:Req)=>{
    const prev=myReqs[r.trip_id]; const merged:Req={...prev, ...Object.fromEntries(Object.entries(r).filter(([,v])=> v!==undefined))} as Req;
    setMyReqs(p=> ({...p, [r.trip_id]:merged}));
    const t=trips.find(x=> x.id===r.trip_id); if(!t) return;
    if(r.status==='confirmed' && prev?.status!=='confirmed'){ notify('success'); seatTaken(t.id); showToast('تمت إضافتك للرحلة'); }
    else if(r.status==='rejected'){ notify('error'); clearReq(t.id); showToast('اعتذر السائق عن هذا الطلب', true); }
    else if(r.status==='counter'){ setCounter({trip:t, req:merged}); }
  };
  // تنبيه متكرر طالما نافذة المبلغ الإضافي مفتوحة حتى يرد الراكب
  useEffect(()=>{
    if(!counter) return;
    notify(); const iv=setInterval(()=> notify(), 2500);
    return ()=> clearInterval(iv);
  },[counter?.req.id]);
  const cancelReq=async(t:Trip)=>{
    const rq=myReqs[t.id]; if(!rq) return;
    if(!t.demo){
      const { error }=await supabase.rpc('passenger_cancel_join',{p_request:rq.id});
      if(error){ showToast('تعذر إلغاء الطلب', true); return; }
    }
    clearReq(t.id); showToast('تم إلغاء طلب الانضمام');
  };
  const clearReq=(tripId:string)=> setMyReqs(prev=>{ const n={...prev}; delete n[tripId]; return n; });
  const seatTaken=(tripId:string)=>{ setTrips(prev=> prev.map(x=> x.id===tripId? {...x, left:x.left-1} : x).filter(x=> x.left>0)); clearReq(tripId); };

  // ملاءمة كل رحلة لموقع الراكب
  const evaluated=useMemo(()=> trips.filter(t=> t.left>0).map(t=>{
    if(!t.path || !pickup || !dropoff) return {t, fit:null as any};
    const a=nearestOnPath(pickup,t.path), b=nearestOnPath(dropoff,t.path);
    // بعد الانطلاق: تظهر فقط لمن هم أمام السيارة على باقي المسار
    if(t.car && a.along < nearestOnPath(t.car,t.path).along - 0.05) return null as any;
    const wrongDir=b.along<=a.along;
    return {t, fit:{offPick:a.km, offDrop:b.km, off:Math.max(a.km,b.km), wrongDir, near:a.km<=NEAR_KM && b.km<=NEAR_KM && !wrongDir}};
  }).filter(Boolean).sort((x,y)=> (x.fit? x.fit.off+(x.fit.wrongDir?100:0) : 999)-(y.fit? y.fit.off+(y.fit.wrongDir?100:0) : 999)),[trips,pickup,dropoff]);

  const onMapPress=(e:any)=>{
    const c=e.nativeEvent.coordinate; const ll=[c.latitude,c.longitude];
    if(mode==='pick'){ setPickup(ll); if(!dropoff) setMode('drop'); } else setDropoff(ll);
  };

  const join=async(t:Trip, fit:any)=>{
    if(busy) return; setBusy(true);
    try{
      if(fit.near){ await submit(t, {km:0, min:0, path:null, wrongDir:false}); return; }
      showToast('جاري حساب الالتفاف على الطريق...');
      const r=await getRoute([t.fromLL, pickup!, dropoff!, t.toLL]);
      if(!r.ok){ showToast('تعذر حساب الالتفاف، حاول مرة أخرى', true); return; }
      setToast(null);
      setConfirm({trip:t, off:fit.off, km:Math.max(0,r.km-(t.km||0)), min:Math.max(0,r.min-(t.min||0)), path:r.path.map(p=>[p.latitude,p.longitude]), wrongDir:fit.wrongDir});
    } finally { setBusy(false); }
  };
  const submit=async(t:Trip, d:{km:number,min:number,path:LL[]|null,wrongDir:boolean})=>{
    if(t.demo){ // وضع تجريبي بدون قاعدة بيانات
      if(d.path){ setMyReqs(p=> ({...p, [t.id]:{id:'demo', trip_id:t.id, status:'pending', extra_fee:0, detour_km:d.km, detour_min:d.min, detour_path:d.path!, pickup:pickup!, dropoff:dropoff!}})); showToast('تم إرسال طلبك للسائق'); }
      else { seatTaken(t.id); showToast('تمت إضافتك للرحلة'); }
      return;
    }
    const { data:{user} }=await supabase.auth.getUser(); if(!user){ guestBlocked(); return; }
    const { data, error }=await supabase.rpc('request_shared_join',{
      p_trip:t.id, p_pick_lat:pickup![0], p_pick_lng:pickup![1], p_drop_lat:dropoff![0], p_drop_lng:dropoff![1],
      p_wrong_dir:d.wrongDir, p_detour_km:Number(d.km.toFixed(2)), p_detour_min:Math.round(d.min), p_detour_polyline:d.path,
    });
    if(error){ showToast(error.message.includes('TRIP_FULL')? 'الرحلة مكتملة' : 'تعذر إرسال الطلب', true); return; }
    if(data.status==='confirmed'){ seatTaken(t.id); showToast('تمت إضافتك للرحلة'); }
    else { setMyReqs(p=> ({...p, [t.id]:{id:data.id, trip_id:t.id, status:'pending', extra_fee:0, detour_km:d.km, detour_min:d.min, detour_path:d.path||undefined, pickup:pickup!, dropoff:dropoff!}})); showToast('تم إرسال طلبك للسائق'); }
  };
  const answerCounter=async(ok:boolean)=>{
    if(!counter) return; const {trip, req}=counter; setCounter(null);
    const { error }=await supabase.rpc('passenger_answer_counter',{p_request:req.id, p_accept:ok});
    if(error){ showToast(error.message.includes('TRIP_FULL')? 'الرحلة اكتملت' : 'تعذر إرسال الرد', true); clearReq(trip.id); return; }
    if(ok){ seatTaken(trip.id); showToast('تمت إضافتك للرحلة'); } else { clearReq(trip.id); showToast('تم رفض المبلغ الإضافي'); }
  };

  const sel=trips.find(t=> t.id===selected);
  return (
    <View style={s.page}>
      <View style={s.header}>
        <Text style={s.h1}>👥 تكسي راكب — رحلات مشتركة</Text>
        <Text style={s.sub}>حدد موقع ركوبك ونزولك واختر رحلة مناسبة</Text>
      </View>
      <View style={s.modeBar}>
        <Pressable onPress={()=> setMode('pick')} style={[s.modeBtn, pickup && s.modeDone, mode==='pick' && s.modeActive]}><Text style={[s.modeT, mode==='pick' && {color:'#fff'}]}>📍 موقع ركوبي</Text></Pressable>
        <Pressable onPress={()=> setMode('drop')} style={[s.modeBtn, dropoff && s.modeDone, mode==='drop' && s.modeActive]}><Text style={[s.modeT, mode==='drop' && {color:'#fff'}]}>🏁 موقع نزولي</Text></Pressable>
      </View>
      <View style={s.mapBox}>
        <MapView style={{flex:1}} initialRegion={{latitude:33.52, longitude:36.30, latitudeDelta:0.12, longitudeDelta:0.12}} onPress={onMapPress}>
          <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
          {evaluated.map(({t})=> t.path ? <Polyline key={t.id} coordinates={t.path.map(toLatLng)} strokeColor={t.id===selected?'#4F46E5':'#818cf8'} strokeWidth={t.id===selected?6:4} tappable onPress={()=> setSelected(t.id)}/> : null)}
          {pickup && <Marker coordinate={toLatLng(pickup)} pinColor="green"/>}
          {dropoff && <Marker coordinate={toLatLng(dropoff)} pinColor="red"/>}
          {sel && <Marker coordinate={toLatLng(sel.fromLL)} pinColor="indigo"/>}
        </MapView>
        <View style={s.hint}><Text style={s.hintT}>{mode==='pick'? 'اضغط على الخريطة لتحديد موقع ركوبك' : 'اضغط على الخريطة لتحديد موقع نزولك'}</Text></View>
      </View>
      <ScrollView contentContainerStyle={{padding:10, gap:10, paddingBottom:40}}>
        <MySharedJoins/>
        {evaluated.length===0 && <Text style={s.empty}>لا توجد رحلات متاحة حالياً</Text>}
        {evaluated.map(({t,fit})=>{
          const rq=myReqs[t.id];
          return (
            <Pressable key={t.id} onPress={()=> setSelected(t.id)} style={[s.card, t.id===selected && s.cardSel]}>
              <Text style={s.route}>📍 {t.from} ← 🏁 {t.to}</Text>
              <Text style={s.time}>🕖 {t.time}</Text>
              <Text style={s.meta}>{t.routeFailed? '⚠️ تعذر حساب مسار الرحلة' : t.path? `🛣️ ${t.km!.toFixed(1)} كم على الطريق • ${fmtMin(t.min!)}` : '⏳ جاري حساب المسار...'}</Text>
              <View style={s.row}><Text style={s.seats}>✅ {t.left} مقاعد متبقية من {t.total}</Text><Text style={s.price}>${t.price.toFixed(2)} USD / مقعد</Text></View>
              <Stars r={t.rating} small />
              {!t.path || !pickup || !dropoff ? (
                !t.routeFailed && t.path ? <View style={[s.fit, s.fitWait]}><Text style={s.fitWaitT}>📍 حدد موقع ركوبك ونزولك على الخريطة لمعرفة ملاءمة الرحلة</Text></View> : null
              ) : fit.wrongDir ? (
                <View style={[s.fit, s.fitBad]}><Text style={s.fitBadT}>↩️ موقع نزولك قبل موقع ركوبك على اتجاه هذه الرحلة — يحتاج موافقة السائق</Text></View>
              ) : fit.near ? (
                <View style={[s.fit, s.fitNear]}><Text style={s.fitNearT}>✅ على مسار الرحلة — ركوب {(fit.offPick*1000).toFixed(0)} م • نزول {(fit.offDrop*1000).toFixed(0)} م عن المسار</Text></View>
              ) : (
                <View style={[s.fit, s.fitFar]}><Text style={s.fitFarT}>📍 بعيد عن المسار — ركوب {fit.offPick.toFixed(1)} كم • نزول {fit.offDrop.toFixed(1)} كم عن المسار{'\n'}يتطلب موافقة السائق وقد يطلب مبلغاً إضافياً</Text></View>
              )}
              {rq && rq.status==='pending' ? <View style={s.pending}><Text style={s.pendingT}>⏳ بانتظار موافقة السائق</Text><Pressable onPress={()=> cancelReq(t)} hitSlop={8}><Text style={s.cancelT}>إلغاء الطلب</Text></Pressable></View>
               : rq && rq.status==='counter' ? <Pressable onPress={()=> setCounter({trip:t, req:rq})} style={[s.pending,{backgroundColor:'#fffbeb', borderColor:'#fde68a'}]}><Text style={[s.pendingT,{color:'#92400e'}]}>💬 السائق طلب مبلغاً إضافياً — عرض</Text></Pressable>
               : <Pressable disabled={!fit || busy} onPress={()=> join(t,fit)} style={[s.join, fit && !fit.near && {backgroundColor:'#f59e0b'}, (!fit || busy) && {backgroundColor:'#cbd5e1'}]}>
                   <Text style={s.joinT}>{fit && !fit.near? '📨 إرسال طلب انضمام للسائق' : '👥 انضم للرحلة'}</Text>
                 </Pressable>}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* تأكيد إرسال طلب (بعيد عن المسار) */}
      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={()=> setConfirm(null)}>
        <View style={s.overlay}><View style={s.modal}>
          <Text style={s.mH}>📨 موقعك بعيد عن مسار الرحلة</Text>
          <Text style={s.mSub}>{confirm?.trip.from} ← {confirm?.trip.to} • {confirm?.trip.time}</Text>
          <View style={s.stats}>
            <View style={s.stat}><Text style={s.statB}>{confirm?.off.toFixed(1)} كم</Text><Text style={s.statS}>البعد عن المسار</Text></View>
            <View style={s.stat}><Text style={s.statB}>+{confirm?.km.toFixed(1)} كم</Text><Text style={s.statS}>التفاف إضافي</Text></View>
            <View style={s.stat}><Text style={s.statB}>+{confirm? fmtMin(confirm.min):''}</Text><Text style={s.statS}>وقت إضافي</Text></View>
          </View>
          <Text style={[s.mSub,{marginTop:10}]}>سيصل طلبك للسائق ليقرر القبول، وقد يطلب مبلغاً إضافياً مقابل الالتفاف — لن تُضاف إلا بموافقتك</Text>
          <View style={s.mBtns}>
            <Pressable onPress={()=> setConfirm(null)} style={[s.mBtn, s.btnNo]}><Text style={s.btnNoT}>إلغاء</Text></Pressable>
            <Pressable onPress={async()=>{ const c=confirm!; setConfirm(null); await submit(c.trip,{km:c.km,min:c.min,path:c.path,wrongDir:c.wrongDir}); }} style={[s.mBtn,{backgroundColor:'#4F46E5'}]}><Text style={s.btnYesT}>إرسال الطلب للسائق</Text></Pressable>
          </View>
        </View></View>
      </Modal>

      {/* رد السائق بمبلغ إضافي */}
      <Modal visible={!!counter} transparent animationType="fade" onRequestClose={()=> setCounter(null)}>
        <View style={s.overlay}><View style={s.modal}>
          <Text style={s.mH}>💬 السائق وافق بمبلغ إضافي</Text>
          <Text style={s.mSub}>{counter?.trip.from} ← {counter?.trip.to} • {counter?.trip.time}</Text>
          <Text style={s.big}>+${counter?.req.extra_fee.toFixed(2)}</Text>
          <Text style={s.mSub}>مقابل الالتفاف إلى موقع ركوبك ونزولك</Text>
          {counter?.trip.path && counter.req.detour_path && (
            <View style={s.cMap}>
              <MapView style={{flex:1}} scrollEnabled={false} zoomEnabled={false}
                initialRegion={{latitude:counter.req.pickup? counter.req.pickup[0]:counter.trip.fromLL[0], longitude:counter.req.pickup? counter.req.pickup[1]:counter.trip.fromLL[1], latitudeDelta:0.08, longitudeDelta:0.08}}>
                <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
                <Polyline coordinates={counter.trip.path.map(toLatLng)} strokeColor="#94a3b8" strokeWidth={5} lineDashPattern={[8,6]}/>
                <Polyline coordinates={counter.req.detour_path.map(toLatLng)} strokeColor="#f59e0b" strokeWidth={4}/>
                {counter.req.pickup && <Marker coordinate={toLatLng(counter.req.pickup)} pinColor="green"/>}
                {counter.req.dropoff && <Marker coordinate={toLatLng(counter.req.dropoff)} pinColor="red"/>}
              </MapView>
            </View>
          )}
          <Text style={s.legend}>رمادي متقطع: مسار الرحلة • برتقالي: مع الالتفاف إليك</Text>
          <View style={[s.stats,{marginTop:8}]}>
            <View style={s.stat}><Text style={s.statB}>+{(counter?.req.detour_km??0).toFixed(1)} كم</Text><Text style={s.statS}>التفاف إضافي</Text></View>
            <View style={s.stat}><Text style={s.statB}>+{fmtMin(counter?.req.detour_min??0)}</Text><Text style={s.statS}>وقت إضافي</Text></View>
            <View style={s.stat}><Text style={s.statB}>${counter?.trip.price.toFixed(2)} USD</Text><Text style={s.statS}>سعر المقعد</Text></View>
          </View>
          <View style={[s.stat,{marginTop:8, backgroundColor:'#eef2ff', borderColor:'#c7d2fe'}]}><Text style={[s.statB,{color:'#4F46E5', fontSize:18}]}>${counter? (counter.trip.price+counter.req.extra_fee).toFixed(2):''} USD</Text><Text style={s.statS}>الإجمالي عليك للمقعد</Text></View>
          <View style={s.mBtns}>
            <Pressable onPress={()=> answerCounter(false)} style={[s.mBtn, s.btnNo]}><Text style={s.btnNoT}>رفض</Text></Pressable>
            <Pressable onPress={()=> answerCounter(true)} style={[s.mBtn,{backgroundColor:'#22c55e'}]}><Text style={s.btnYesT}>موافق</Text></Pressable>
          </View>
        </View></View>
      </Modal>

      {toast && <View style={[s.toast, toast.err && {backgroundColor:'#991b1b'}]}><Text style={s.toastT}>{toast.m}</Text></View>}
    </View>
  );
}
const s=StyleSheet.create({
  page:{flex:1, backgroundColor:'#f8fafc'},
  header:{backgroundColor:'#fff', borderBottomWidth:1, borderColor:'#e2e8f0', padding:12},
  h1:{fontSize:16, fontWeight:'900', textAlign:'right'},
  sub:{fontSize:11, color:'#64748b', textAlign:'right', marginTop:2},
  modeBar:{flexDirection:'row-reverse', gap:8, margin:10, marginBottom:8},
  modeBtn:{flex:1, height:40, borderRadius:12, borderWidth:1.5, borderColor:'#e2e8f0', backgroundColor:'#fff', alignItems:'center', justifyContent:'center'},
  modeDone:{borderColor:'#22c55e', backgroundColor:'#f0fdf4'},
  modeActive:{backgroundColor:'#4F46E5', borderColor:'#4F46E5'},
  modeT:{fontSize:12, fontWeight:'800', color:'#0f172a'},
  mapBox:{height:250, marginHorizontal:10, borderRadius:14, overflow:'hidden', borderWidth:1, borderColor:'#e2e8f0'},
  hint:{position:'absolute', top:8, alignSelf:'center', backgroundColor:'rgba(15,23,42,.85)', paddingHorizontal:12, paddingVertical:6, borderRadius:999},
  hintT:{color:'#fff', fontSize:11, fontWeight:'800'},
  empty:{textAlign:'center', color:'#64748b', padding:24},
  card:{backgroundColor:'#fff', borderWidth:1.5, borderColor:'#e2e8f0', borderRadius:16, padding:12},
  cardSel:{borderColor:'#4F46E5'},
  route:{fontSize:13, fontWeight:'900', textAlign:'right'},
  time:{fontSize:11, color:'#4F46E5', fontWeight:'800', marginTop:4, textAlign:'right'},
  meta:{fontSize:11, color:'#64748b', marginTop:4, textAlign:'right'},
  row:{flexDirection:'row-reverse', justifyContent:'space-between', alignItems:'center', marginTop:8},
  seats:{fontSize:11, color:'#065f46', backgroundColor:'#f0fdf4', borderWidth:1, borderColor:'#a7f3d0', paddingHorizontal:8, paddingVertical:4, borderRadius:999, overflow:'hidden'},
  price:{fontSize:14, fontWeight:'900', color:'#4F46E5'},
  fit:{marginTop:8, borderRadius:10, padding:8, borderWidth:1},
  fitNear:{backgroundColor:'#f0fdf4', borderColor:'#a7f3d0'}, fitNearT:{color:'#065f46', fontSize:11, fontWeight:'800', textAlign:'right'},
  fitFar:{backgroundColor:'#fffbeb', borderColor:'#fde68a'}, fitFarT:{color:'#92400e', fontSize:11, fontWeight:'800', textAlign:'right', lineHeight:18},
  fitBad:{backgroundColor:'#fef2f2', borderColor:'#fecaca'}, fitBadT:{color:'#991b1b', fontSize:11, fontWeight:'800', textAlign:'right'},
  fitWait:{backgroundColor:'#f1f5f9', borderColor:'#e2e8f0'}, fitWaitT:{color:'#475569', fontSize:11, fontWeight:'800', textAlign:'right'},
  join:{height:42, borderRadius:12, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center', marginTop:8},
  joinT:{color:'#fff', fontWeight:'900', fontSize:13},
  pending:{marginTop:8, borderRadius:12, backgroundColor:'#eef2ff', borderWidth:1, borderColor:'#c7d2fe', padding:10},
  pendingT:{color:'#3730a3', fontWeight:'900', fontSize:12, textAlign:'center'},
  cancelT:{color:'#991b1b', fontSize:11, fontWeight:'800', textAlign:'center', textDecorationLine:'underline', marginTop:6},
  cMap:{height:170, borderRadius:12, overflow:'hidden', borderWidth:1, borderColor:'#e2e8f0', marginTop:10},
  legend:{fontSize:10, color:'#64748b', textAlign:'center', marginTop:4},
  overlay:{flex:1, backgroundColor:'rgba(15,23,42,.55)', alignItems:'center', justifyContent:'center', padding:16},
  modal:{backgroundColor:'#fff', borderRadius:24, padding:18, width:'100%', maxWidth:420},
  mH:{fontSize:16, fontWeight:'900', textAlign:'center'},
  mSub:{fontSize:12, color:'#64748b', textAlign:'center', marginTop:4},
  stats:{flexDirection:'row-reverse', gap:8, marginTop:12},
  stat:{flex:1, backgroundColor:'#f8fafc', borderWidth:1, borderColor:'#e2e8f0', borderRadius:12, padding:8, alignItems:'center'},
  statB:{fontSize:14, fontWeight:'900'}, statS:{fontSize:10, color:'#64748b'},
  big:{fontSize:28, fontWeight:'900', color:'#4F46E5', textAlign:'center', marginTop:10},
  mBtns:{flexDirection:'row-reverse', gap:8, marginTop:14},
  mBtn:{flex:1, height:44, borderRadius:12, alignItems:'center', justifyContent:'center'},
  btnNo:{backgroundColor:'#fff', borderWidth:1.5, borderColor:'#fecaca'}, btnNoT:{color:'#991b1b', fontWeight:'900'},
  btnYesT:{color:'#fff', fontWeight:'900'},
  toast:{position:'absolute', bottom:20, alignSelf:'center', backgroundColor:'#065f46', paddingHorizontal:20, paddingVertical:12, borderRadius:999, maxWidth:'90%'},
  toastT:{color:'#fff', fontWeight:'900', fontSize:13, textAlign:'center'},
});
