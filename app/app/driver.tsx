import MyRatingCard from '../components/MyRatingCard';
import NewOrdersToggle from '../components/NewOrdersToggle';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Modal, TextInput, Vibration, AppState } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { errMsg } from '../utils/errors';
import { supabase } from '../utils/supabase';
import WorkStatusBanner from '../components/WorkStatusBanner';
import * as Haptics from 'expo-haptics';
import { getRoute, fmtMin } from '../utils/route';
import { formatLocalFare, formatWalletUsd } from '../utils/taxi-pricing';
import SharedTripsDriver from '../components/SharedTripsDriver';
import WorkNav from '../components/WorkNav';
import { useWorkProfile } from '../utils/useWorkProfile';
import { isTaxiDriver, isWorkType } from '../utils/work';
import { livePingNow } from '../components/LivePinger';
import { getMyLocation, getFreshLocation } from '../utils/location';
import { MapView, UrlTile, Marker, Polyline, Circle } from '../components/OpenMapView';
const CAT:Record<string,string>={ordinary:'قياسية', economy:'اقتصادية', luxury:'فاخرة', van_8:'فان 8', van_11:'فان 11'};
const RADIUS_KM=5;
// نصف قطر دائرة استقبال الطلبات (للتصفية فقط — المسافات المعروضة كلها على الطريق)
const kmBetween=(a:number[],b:number[])=>{ const k=Math.cos(a[0]*Math.PI/180); return Math.hypot((b[1]-a[1])*111.32*k,(b[0]-a[0])*110.574); };
const toReq=(r:any)=>{
  const local=Number(r.fare_local||0), currency=r.local_currency||'SYP';
  return {from:r.pickup_text||'نقطة الانطلاق',to:r.dropoff_text||'الوجهة',fromLL:[r.pickup_lat,r.pickup_lng],toLL:[r.dropoff_lat,r.dropoff_lng],
    dist:`${Number(r.distance_km).toFixed(1)} كم${r.duration_min? ' • '+fmtMin(r.duration_min):''}`,cat:CAT[r.vehicle_category]||r.vehicle_category,
    price:local>0?formatLocalFare(local,currency):formatWalletUsd(r.estimated_fare),
    walletPrice:formatWalletUsd(r.estimated_fare),id:r.id,radius:Number(r.search_radius_km)||RADIUS_KM};
};
// خريطة التكسي لسائقي التكسي فقط؛ غيرهم يُوجَّه إلى شاشته
export default function DriverScreen(){
  const wp=useWorkProfile();
  const router=useRouter();
  if(wp===undefined) return <View style={{flex:1, backgroundColor:'#f8fafc'}}/>;
  if(!isTaxiDriver(wp)) return (
    <View style={{flex:1, backgroundColor:'#f8fafc', justifyContent:'center', padding:20, gap:12}}>
      <Text style={{fontSize:40, textAlign:'center'}}>🔒</Text>
      <Text style={{fontWeight:'900', fontSize:15, textAlign:'center'}}>هذه الشاشة لسائقي التكسي</Text>
      <Pressable onPress={()=> router.replace((isWorkType(wp)? '/work' : '/') as any)} style={{backgroundColor:'#4F46E5', borderRadius:12, padding:12}}>
        <Text style={{color:'#fff', fontWeight:'900', textAlign:'center'}}>{isWorkType(wp)? 'إلى الطلبات' : 'إلى الرئيسية'}</Text>
      </Pressable>
    </View>
  );
  return <DriverMap wp={wp}/>;
}

function DriverMap({ wp }:{ wp:any }){
  const router=useRouter();
  // ===== طلبات انضمام الركاب للرحلات المشتركة =====
  const [joinQueue,setJoinQueue]=useState<any[]>([]);
  const [joinReq,setJoinReq]=useState<any>(null);
  const [showExtra,setShowExtra]=useState(false);
  const [extra,setExtra]=useState('');
  const [modal,setModal]=useState<any>(null);
  // الرحلة الحالية للسائق: مقبولة ← وصلت ← جارية ← انتهت
  const [trip,setTrip]=useState<any>(null);
  const [stepBusy,setStepBusy]=useState(false);
  const loadTrip=useCallback(async()=>{ const { data }=await supabase.rpc('driver_taxi_active'); setTrip(data||null); },[]);
  useFocusEffect(useCallback(()=>{ loadTrip(); },[loadTrip]));
  // إلغاء السائق بعد القبول: سبب إجباري + تأكيد، والإيقاف بعد كثرة الإلغاءات
  const [status,setStatus]=useState<any>(null);
  const loadStatus=useCallback(async()=>{ const { data }=await supabase.rpc('my_driver_status'); setStatus(data||null); },[]);
  useFocusEffect(useCallback(()=>{ loadStatus(); },[loadStatus]));
  const statusRef=React.useRef<any>(null);
  useEffect(()=>{ statusRef.current=status; },[status]);
  // إرسال موقع السائق كل 30 ثانية طالما الشاشة مفتوحة (لا زر متاح/غير متاح)
  useFocusEffect(useCallback(()=>{
    if(!status?.taxi_category || status?.taxi_suspended) return;
    const ping=async()=>{
      if(AppState.currentState!=='active') return;
      const ll=await getFreshLocation(); if(!ll) return;
      myRef.current=ll; setMyLL(ll);
      await supabase.rpc('driver_taxi_ping',{p_lat:ll[0], p_lng:ll[1]});
    };
    ping(); const iv=setInterval(ping,30000);
    return ()=> clearInterval(iv);
  },[status?.taxi_category, status?.taxi_suspended]));
  const [cancelOpen,setCancelOpen]=useState(false);
  const [cancelReason,setCancelReason]=useState<string|null>(null);
  const [cancelId,setCancelId]=useState<string|null>(null);
  const REASONS=[{k:'no_answer',l:'الراكب لا يرد'},{k:'car_issue',l:'عطل في السيارة'},{k:'emergency',l:'ظرف طارئ'},{k:'other',l:'سبب آخر'}];
  const doCancel=async()=>{
    const oid=cancelId||trip?.id;
    if(!oid || !cancelReason) return;
    setCancelOpen(false); setCancelId(null);
    const { data, error }=await supabase.rpc('driver_cancel_taxi',{p_order:oid, p_reason:cancelReason});
    setCancelReason(null);
    if(error){ showToast(errMsg(error)); loadTrip(); return; }
    showToast((data as any)?.suspended? 'تم إيقاف استقبال الطلبات بسبب كثرة الإلغاءات' : 'تم إلغاء الرحلة');
    loadTrip(); loadStatus();
  };
  const [toast,setToast]=useState<string|null>(null);
  const showToast=(msg:string)=>{ setToast(msg); setTimeout(()=> setToast(null),2500); };
  // يعرض الطلب مع المسار الحقيقي على الطرق (المسافة المحفوظة بالطلب محسوبة على الطريق من جهة الزبون)
  const openWithRoute=async(r:any)=>{
    const rt=await getRoute([r.fromLL,r.toLL]);
    if(rt.ok){
      r.path=rt.path;
      if(!r.dist) r.dist=`${rt.km.toFixed(1)} كم • ${fmtMin(rt.min)}`;
    } else if(!r.dist){ r.dist='تعذر حساب المسار'; r.price=r.price||'—'; }
    setModal({...r});
  };
  // موقع السائق + الطلبات المنتظرة ضمن دائرة 5 كم
  const [myLL,setMyLL]=useState<number[]|null>(null);
  const [nearby,setNearby]=useState<any[]>([]);
  const myRef=React.useRef<number[]|null>(null);
  const loadNearby=useCallback(async()=>{
    const { ll }=await getMyLocation(); setMyLL(ll); myRef.current=ll;
    const since=new Date(Date.now()-60*60*1000).toISOString();
    const { data }=await supabase.from('taxi_orders').select('id,pickup_text,dropoff_text,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,duration_min,vehicle_category,estimated_fare,fare_local,local_currency,search_radius_km,created_at')
      .eq('status','pending').is('driver_id',null).gte('created_at',since).order('created_at',{ascending:false}).limit(50);
    setNearby(((data||[]) as any[]).map(r=> ({...toReq(r), away:kmBetween(ll,[r.pickup_lat,r.pickup_lng])}))
      .filter(r=> r.away<=r.radius).sort((a,b)=> a.away-b.away));
  },[]);
  useFocusEffect(useCallback(()=>{ loadNearby(); },[loadNearby]));
  // طلب جديد لحظياً: يظهر فقط إذا كان ضمن الدائرة
  useEffect(()=>{
    const channel=supabase.channel('taxi_orders_driver')
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'taxi_orders'}, payload=>{
        const r=payload.new as any; const me=myRef.current;
        const cat=statusRef.current?.taxi_category;
        if(!me || !cat || r.vehicle_category!==cat || kmBetween(me,[r.pickup_lat,r.pickup_lng])>(Number(r.search_radius_km)||RADIUS_KM)) return;
        const q={...toReq(r), away:kmBetween(me,[r.pickup_lat,r.pickup_lng])};
        // أولوية المستوى: السائق الأعلى مستوى بالنطاق بيشوف الطلب قبل
        supabase.rpc('taxi_priority_wait',{p_order:r.id}).then(({data})=>{
          setTimeout(()=>{
            setNearby(p=> [q, ...p.filter(x=> x.id!==q.id)]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Vibration.vibrate([0,200,100,200]);
            openWithRoute(q);
          }, Math.max(0, Number(data)||0)*1000);
        }, ()=>{});
      }).subscribe();
    return ()=>{ supabase.removeChannel(channel); };
  },[]);
  const driverNotify=(msg:string)=>{ Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); Vibration.vibrate([0,200,100,200]); showToast(msg); };
  // الاشتراك بطلبات الانضمام (RLS يضمن وصول طلبات رحلات هذا السائق فقط)
  useEffect(()=>{
    const ch=supabase.channel('shared_join_driver')
      .on('postgres_changes',{event:'INSERT', schema:'public', table:'taxi_shared_requests'}, (payload:any)=> enqueueJoin(payload.new))
      .on('postgres_changes',{event:'UPDATE', schema:'public', table:'taxi_shared_requests'}, (payload:any)=>{
        const r=payload.new;
        if(r.status==='pending' && r.join_type==='approval') enqueueJoin(r);
        if(r.status==='confirmed' && r.join_type==='auto') driverNotify('انضم راكب جديد لرحلتك');
        if(r.status==='confirmed' && Number(r.extra_fee)>0) driverNotify(`✅ وافق الراكب على +$${Number(r.extra_fee).toFixed(2)} — تمت إضافته لرحلتك`);
        if(r.status==='declined_by_passenger') driverNotify('رفض الراكب المبلغ الإضافي');
        if(r.status==='cancelled'){
          setJoinQueue(q=> q.filter(x=> x.id!==r.id));
          setJoinReq((cur:any)=> cur?.id===r.id? null : cur);
          driverNotify('ألغى الراكب طلب الانضمام');
        }
      }).subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[]);
  const enqueueJoin=async(r:any)=>{
    if(r.status!=='pending') return;
    const { data:trip }=await supabase.from('taxi_shared_trips').select('*').eq('id', r.trip_id).single();
    if(!trip) return;
    setJoinQueue(q=> q.some(x=> x.id===r.id)? q : [...q, {...r, trip}]);
  };
  useEffect(()=>{ if(!joinReq && joinQueue.length){ setJoinReq(joinQueue[0]); setJoinQueue(q=> q.slice(1)); setShowExtra(false); } },[joinQueue, joinReq]);
  // تنبيه متكرر حتى يتخذ السائق قراراً (لا يفوته الطلب)
  useEffect(()=>{
    if(!joinReq) return;
    const tick=()=>{ Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); Vibration.vibrate(300); };
    tick(); const iv=setInterval(tick,2000);
    return ()=> clearInterval(iv);
  },[joinReq?.id]);
  const respondJoin=async(action:'accept'|'reject'|'counter')=>{
    if(!joinReq) return;
    const v=Number(extra);
    if(action==='counter' && !(v>0)){ showToast('اكتب المبلغ الإضافي أولاً'); return; }
    const { error }=await supabase.rpc('driver_respond_join',{p_request:joinReq.id, p_action:action, p_extra: action==='counter'? v : 0});
    if(error){ showToast(error.message.includes('TRIP_FULL')? 'الرحلة مكتملة' : 'تعذر إرسال الرد'); }
    else showToast(action==='accept'? 'تم قبول الراكب' : action==='reject'? 'تم رفض الطلب' : 'تم إرسال المبلغ للراكب — بانتظار موافقته');
    setJoinReq(null); setExtra('');
  };
  const openExtra=()=>{ setExtra(''); setShowExtra(true); };
  const toLL=(p:number[])=>({latitude:p[0], longitude:p[1]});

  const quickAccept=(r:any)=>{ setModal(r); setTimeout(()=> accept(),100); };
  const accept=async()=>{
    if(!modal) return;
    const m=modal; setModal(null);
    setNearby(p=> p.filter(x=> x.id!==m.id));
    const { data, error }=await supabase.rpc('driver_accept_taxi',{p_order:m.id});
    if(error){ showToast(errMsg(error, 'تعذر قبول الطلب')); loadNearby(); return; }
    await loadTrip(); livePingNow();
    showToast((data as any)?.is_next? 'تم قبول الطلب كطلب تالٍ — يبدأ بعد إنهاء رحلتك' : 'تم قبول الطلب — يمكنك الاتصال بالعميل الآن');
  };
  const STEP:Record<string,{step:string,label:string,done:string}>={
    accepted:{step:'arrived', label:'📍 وصلت إلى الراكب', done:'تم إبلاغ الراكب بوصولك'},
    arrived:{step:'start', label:'▶️ بدء الرحلة', done:'بدأت الرحلة'},
    in_progress:{step:'complete', label:'🏁 إنهاء الرحلة', done:'انتهت الرحلة — وصل للراكب طلب الدفع'},
  };
  const doStep=async()=>{
    if(!trip || stepBusy) return; const st=STEP[trip.status]; if(!st) return;
    setStepBusy(true);
    const { error }=await supabase.rpc(`driver_taxi_${st.step}`,{p_order:trip.id});
    setStepBusy(false);
    if(error){ showToast(errMsg(error)); loadTrip(); return; }
    showToast(st.done); loadTrip();
  };
  const reject=()=>{ const m=modal; setModal(null); if(m) setNearby(p=> p.filter(x=> x.id!==m.id)); showToast('تم رفض الطلب'); };
  return (
    <View style={s.page}>
      <View style={s.header}>
        <Text style={s.h1}>🚕 لوحة السائق</Text>
        <View style={{flexDirection:'row', gap:6, alignItems:'center'}}><MyRatingCard compact /><NewOrdersToggle compact onChange={v=> showToast(v? 'إشعارات الطلبات الجديدة مفعّلة 🔔' : 'إشعارات الطلبات الجديدة متوقفة 🔕')} /><View style={s.badge}><Text style={s.badgeT}>● متاح</Text></View></View>
      </View>
      <WorkStatusBanner />
      <WorkNav profile={wp} here="map" />
      <View style={{flex:1, margin:10, borderRadius:14, overflow:'hidden', borderWidth:1, borderColor:'#e2e8f0'}}>
        <MapView style={{flex:1}} region={{latitude:(myLL||[33.5138,36.2765])[0], longitude:(myLL||[33.5138,36.2765])[1], latitudeDelta:0.12, longitudeDelta:0.12}}>
          <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
          {myLL && <Circle center={toLL(myLL)} radius={RADIUS_KM*1000} fillColor="rgba(79,70,229,0.08)" strokeColor="rgba(79,70,229,0.5)"/>}
          {myLL && <Marker coordinate={toLL(myLL)} pinColor="#4F46E5"/>}
          {nearby.map(r=> <Marker key={r.id} coordinate={toLL(r.fromLL)} pinColor="green" onPress={()=> openWithRoute(r)}/>)}
        </MapView>
        <View style={s.legend}><Text style={{fontSize:10, fontWeight:'900'}}>نطاق الطلبات {RADIUS_KM} كم{status?.taxi_category? ' • '+(CAT[status.taxi_category]||'') : ''}</Text></View>
      </View>
      <View style={{padding:10, gap:8, paddingBottom:80}}>
        {status?.taxi_suspended && (
          <View style={{backgroundColor:'#fef2f2', borderWidth:1, borderColor:'#fecaca', borderRadius:12, padding:10}}><Text style={{color:'#991b1b', fontWeight:'800', fontSize:12, textAlign:'center'}}>{status.message}</Text></View>
        )}

        {!!status && !status.taxi_category && !status.taxi_suspended && (
          <View style={{backgroundColor:'#fffbeb', borderWidth:1, borderColor:'#fde68a', borderRadius:12, padding:10}}><Text style={{color:'#92400e', fontWeight:'800', fontSize:12, textAlign:'center'}}>فئة سيارتك غير محددة — تُحدد عند التسجيل، وبعدها تظهر لك طلبات فئتك فقط</Text></View>
        )}
        {!trip?.next && !status?.taxi_suspended && !!status?.taxi_category && (nearby.length
          ? <View style={{gap:6}}>
              <Text style={{fontWeight:'900', fontSize:13, textAlign:'right'}}>📋 طلبات قريبة ({nearby.length}){trip? ' • يمكنك قبول طلب تالٍ واحد' : ''}</Text>
              {nearby.slice(0,5).map(r=> (
                <Pressable key={r.id} onPress={()=> openWithRoute(r)} style={{backgroundColor:'#fff', borderWidth:1, borderColor:'#e2e8f0', borderRadius:12, padding:10, flexDirection:'row-reverse', justifyContent:'space-between'}}>
                  <View style={{flex:1}}><Text style={{fontWeight:'800', fontSize:12, textAlign:'right'}}>{r.from} ← {r.to}</Text><Text style={{fontSize:11, color:'#64748b', textAlign:'right'}}>{r.cat} • {r.dist}</Text></View>
                  <Text style={{fontWeight:'900', color:'#4F46E5'}}>{r.price}</Text>
                </Pressable>
              ))}
            </View>
          : <Pressable onPress={loadNearby} style={[s.btn,{backgroundColor:'#fff', borderWidth:1, borderColor:'#e2e8f0'}]}><Text style={s.btnT}>لا توجد طلبات ضمن {RADIUS_KM} كم • تحديث</Text></Pressable>)}
        <SharedTripsDriver toast={showToast}/>
        <Pressable onPress={()=> router.push('/driver-shared-publish' as any)} style={[s.btn,{backgroundColor:'#4F46E5'}]}><Text style={[s.btnT,{color:'#fff'}]}>👥 نشر رحلة راكب مشتركة</Text></Pressable>
      </View>
      {trip && (
        <View style={s.tripCard}>
          <View style={{flexDirection:'row-reverse', justifyContent:'space-between', alignItems:'center'}}>
            <Text style={{fontWeight:'900', fontSize:14}}>{trip.status==='accepted'? '🚕 في الطريق إلى الراكب' : trip.status==='arrived'? '📍 بانتظار الراكب' : '🛣️ الرحلة جارية'}</Text>
            <Text style={{fontWeight:'900', fontSize:16, color:'#4F46E5'}}>{Number(trip.fare_local)>0?formatLocalFare(trip.fare_local,trip.local_currency||'SYP'):formatWalletUsd(trip.fare)}</Text>
          </View>
          {Number(trip.fare_local)>0 && <>
            <Text style={{fontSize:11,color:'#475569',textAlign:'right',marginTop:4}}>{trip.commission_waived ? `الفترة المجانية: دون عمولة • صافي السائق ${formatLocalFare(trip.fare_local,trip.local_currency||'SYP')}` : `عمولة التطبيق ${Math.round(Number(trip.commission_rate||0.10)*100)}%: ${formatLocalFare(trip.commission_local,trip.local_currency||'SYP')} • صافي السائق: ${formatLocalFare(trip.driver_net_local,trip.local_currency||'SYP')}`}</Text>
            <Text style={{fontSize:10,color:'#64748b',textAlign:'right'}}>{trip.commission_waived ? 'لن يُخصم شيء من المحفظة خلال الفترة المجانية' : `يُخصم من المحفظة: ${formatWalletUsd(Math.round(Number(trip.fare)*Number(trip.commission_rate||0.10)*100)/100)}`}</Text>
          </>}
          <View style={{flexDirection:'row-reverse', gap:8, marginTop:10}}>
            <Pressable onPress={doStep} disabled={stepBusy} style={[s.btn,{flex:2, backgroundColor: trip.status==='in_progress'? '#4F46E5' : '#0f172a', opacity:stepBusy? .6:1}]}><Text style={[s.btnT,{color:'#fff'}]}>{stepBusy? 'جاري...' : STEP[trip.status]?.label}</Text></Pressable>
            {!!trip.customer_phone && <Pressable onPress={()=> Linking.openURL(`tel:${trip.customer_phone}`)} style={[s.btn,{flex:1, backgroundColor:'#22c55e'}]}><Text style={[s.btnT,{color:'#fff'}]}>📞 اتصال بالعميل</Text></Pressable>}
          </View>
          {!!trip.next && (
            <View style={{marginTop:10, backgroundColor:'#f8fafc', borderWidth:1, borderColor:'#e2e8f0', borderRadius:12, padding:8, flexDirection:'row-reverse', alignItems:'center', gap:8}}>
              <View style={{flex:1}}>
                <Text style={{fontWeight:'900', fontSize:12, textAlign:'right'}}>⏭️ الطلب التالي • {Number(trip.next.fare_local)>0?formatLocalFare(trip.next.fare_local,trip.next.local_currency||'SYP'):formatWalletUsd(trip.next.fare)}</Text>
                {!!trip.next.driver_net_local && <Text style={{fontSize:10,color:'#047857',textAlign:'right'}}>صافي السائق المتوقع: {formatLocalFare(trip.next.driver_net_local,trip.next.local_currency||'SYP')}</Text>}
                <Text style={{fontSize:11, color:'#64748b', textAlign:'right'}}>يبدأ بعد إنهاء رحلتك الحالية</Text>
              </View>
              {!!trip.next.customer_phone && <Pressable onPress={()=> Linking.openURL(`tel:${trip.next.customer_phone}`)} style={{backgroundColor:'#22c55e', borderRadius:10, paddingHorizontal:10, paddingVertical:8}}><Text style={{color:'#fff', fontWeight:'900', fontSize:12}}>📞 اتصال</Text></Pressable>}
              <Pressable onPress={()=>{ setCancelId(trip.next.id); setCancelReason(null); setCancelOpen(true); }}><Text style={{color:'#dc2626', fontWeight:'800', fontSize:11}}>إلغاء</Text></Pressable>
            </View>
          )}
          {(trip.status==='accepted' || trip.status==='arrived') && (
            <Pressable onPress={()=>{ setCancelId(null); setCancelReason(null); setCancelOpen(true); }} style={{marginTop:8, alignItems:'center'}}><Text style={{color:'#dc2626', fontWeight:'800', fontSize:12}}>إلغاء الرحلة</Text></Pressable>
          )}
        </View>
      )}

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={()=> setModal(null)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>🔔 طلب تكسي جديد ضمن نطاقك</Text>
            <Text style={{fontSize:11,color:'#64748b',textAlign:'center'}}>اضغط قبول خلال 15 ثانية</Text>
            {modal && (
              <>
                <Text style={{fontSize:13,fontWeight:'900',textAlign:'center',marginTop:10}}>{modal.from} → {modal.to}</Text>
                <View style={{height:100, borderRadius:12, overflow:'hidden', marginTop:10, borderWidth:1, borderColor:'#e2e8f0'}}>
                  <MapView style={{flex:1}} initialRegion={{latitude:modal.fromLL[0], longitude:modal.fromLL[1], latitudeDelta:0.04, longitudeDelta:0.04}} scrollEnabled={false} zoomEnabled={false}>
                    <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
                    <Marker coordinate={{latitude:modal.fromLL[0], longitude:modal.fromLL[1]}} pinColor="green"/>
                    <Marker coordinate={{latitude:modal.toLL[0], longitude:modal.toLL[1]}} pinColor="red"/>
                    {modal.path && <Polyline coordinates={modal.path} strokeColor="#4F46E5" strokeWidth={4}/>}
                  </MapView>
                </View>
                <View style={{flexDirection:'row', gap:8, marginTop:10}}>
                  <View style={s.detail}><Text style={s.detailB}>{modal.dist}</Text><Text style={s.detailS}>المسافة</Text></View>
                  <View style={s.detail}><Text style={s.detailB}>{modal.cat}</Text><Text style={s.detailS}>الفئة</Text></View>
                  <View style={s.detail}><Text style={s.detailB}>{modal.price}</Text><Text style={s.detailS}>الأجرة</Text></View>
                </View>
                <Text style={{fontSize:10,color:'#64748b',textAlign:'center',marginTop:5}}>قيمة المحاسبة: {modal.walletPrice}</Text>

              </>
            )}
            <View style={{flexDirection:'row', gap:8, marginTop:14}}>
              <Pressable onPress={reject} style={[s.modalBtn,{backgroundColor:'#fff', borderWidth:1, borderColor:'#fecaca'}]}><Text style={{color:'#991b1b', fontWeight:'900'}}>رفض</Text></Pressable>
              <Pressable onPress={accept} style={[s.modalBtn,{backgroundColor:'#22c55e'}]}><Text style={{color:'#fff', fontWeight:'900'}}>✅ قبول</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!joinReq} transparent animationType="fade" onRequestClose={()=>{}}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>👤 طلب انضمام راكب</Text>
            {joinReq && (
              <>
                <Text style={{fontSize:12,color:'#64748b',textAlign:'center',marginTop:4}}>رحلتك: {joinReq.trip.pickup_text} ← {joinReq.trip.dropoff_text}</Text>
                {joinReq.wrong_dir && <View style={{marginTop:8, backgroundColor:'#fef2f2', borderWidth:1, borderColor:'#fecaca', borderRadius:10, padding:6}}><Text style={{color:'#991b1b', fontSize:11, fontWeight:'800', textAlign:'center'}}>↩️ نزول الراكب قبل موقع ركوبه على اتجاه رحلتك</Text></View>}
                <View style={{height:180, borderRadius:12, overflow:'hidden', marginTop:10, borderWidth:1, borderColor:'#e2e8f0'}}>
                  <MapView style={{flex:1}} initialRegion={{latitude:joinReq.pickup_lat, longitude:joinReq.pickup_lng, latitudeDelta:0.08, longitudeDelta:0.08}} scrollEnabled={false} zoomEnabled={false}>
                    <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
                    {joinReq.trip.route_polyline && <Polyline coordinates={joinReq.trip.route_polyline.map(toLL)} strokeColor="#94a3b8" strokeWidth={5} lineDashPattern={[8,6]}/>}
                    {joinReq.detour_polyline && <Polyline coordinates={joinReq.detour_polyline.map(toLL)} strokeColor="#f59e0b" strokeWidth={4}/>}
                    <Marker coordinate={{latitude:joinReq.pickup_lat, longitude:joinReq.pickup_lng}} pinColor="green"/>
                    <Marker coordinate={{latitude:joinReq.dropoff_lat, longitude:joinReq.dropoff_lng}} pinColor="red"/>
                  </MapView>
                </View>
                <Text style={{fontSize:10,color:'#64748b',textAlign:'center',marginTop:4}}>رمادي متقطع: مسارك الأصلي • برتقالي: مع الراكب • 🟢 ركوب • 🔴 نزول</Text>
                <View style={{flexDirection:'row', gap:8, marginTop:10}}>
                  <View style={s.detail}><Text style={s.detailB}>{Math.max(Number(joinReq.off_pick_km),Number(joinReq.off_drop_km)).toFixed(1)} كم</Text><Text style={s.detailS}>البعد عن مسارك</Text></View>
                  <View style={[s.detail,{backgroundColor:'#fffbeb', borderColor:'#fde68a'}]}><Text style={[s.detailB,{color:'#92400e'}]}>+{Number(joinReq.detour_km).toFixed(1)} كم</Text><Text style={s.detailS}>التفاف إضافي</Text></View>
                  <View style={s.detail}><Text style={s.detailB}>${Number(joinReq.trip.price_per_seat).toFixed(2)}</Text><Text style={s.detailS}>سعر المقعد</Text></View>
                </View>
                <Text style={{fontSize:11,color:'#64748b',textAlign:'center',marginTop:6}}>ركوب {Number(joinReq.off_pick_km).toFixed(1)} كم • نزول {Number(joinReq.off_drop_km).toFixed(1)} كم عن مسارك • وقت إضافي +{fmtMin(joinReq.detour_min||0)}</Text>
              </>
            )}
            {showExtra ? (
              <View style={{marginTop:10, backgroundColor:'#f8fafc', borderWidth:1, borderColor:'#e2e8f0', borderRadius:12, padding:10}}>
                <Text style={{fontSize:12, fontWeight:'900'}}>المبلغ الإضافي المطلوب من الراكب</Text>
                <View style={{flexDirection:'row', alignItems:'center', gap:6, marginTop:6}}>
                  <Text style={{fontWeight:'900'}}>+$</Text>
                  <TextInput value={extra} onChangeText={setExtra} keyboardType="decimal-pad" placeholder="0.00" autoFocus style={{flex:1, height:42, borderWidth:1.5, borderColor:'#e2e8f0', borderRadius:10, paddingHorizontal:10, fontSize:15, fontWeight:'900', backgroundColor:'#fff'}}/>
                </View>
                <Text style={{fontSize:10, color:'#64748b', marginTop:4}}>الالتفاف +{Number(joinReq?.detour_km||0).toFixed(1)} كم • +{fmtMin(joinReq?.detour_min||0)} — اكتب المبلغ الذي تراه مناسباً</Text>
                <View style={{flexDirection:'row', gap:6, marginTop:8}}><Pressable onPress={()=> setShowExtra(false)} style={[s.modalBtn,{backgroundColor:'#fff', borderWidth:1, borderColor:'#e2e8f0'}]}><Text style={{fontWeight:'900'}}>رجوع</Text></Pressable><Pressable onPress={()=> respondJoin('counter')} style={[s.modalBtn,{flex:2, backgroundColor:'#4F46E5'}]}><Text style={{color:'#fff', fontWeight:'900'}}>إرسال للراكب</Text></Pressable></View>
              </View>
            ) : (
              <View style={{flexDirection:'row', gap:6, marginTop:14}}>
                <Pressable onPress={()=> respondJoin('reject')} style={[s.modalBtn,{backgroundColor:'#fff', borderWidth:1, borderColor:'#fecaca'}]}><Text style={{color:'#991b1b', fontWeight:'900'}}>رفض</Text></Pressable>
                <Pressable onPress={openExtra} style={[s.modalBtn,{flex:1.4, backgroundColor:'#fff', borderWidth:1.5, borderColor:'#4F46E5'}]}><Text style={{color:'#4F46E5', fontWeight:'900', fontSize:12}}>قبول بمبلغ إضافي</Text></Pressable>
                <Pressable onPress={()=> respondJoin('accept')} style={[s.modalBtn,{backgroundColor:'#22c55e'}]}><Text style={{color:'#fff', fontWeight:'900'}}>قبول</Text></Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={cancelOpen} transparent animationType="fade" onRequestClose={()=> setCancelOpen(false)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>سبب الإلغاء</Text>
            <View style={{gap:8, marginTop:12}}>
              {REASONS.map(r=> (
                <Pressable key={r.k} onPress={()=> setCancelReason(r.k)} style={[s.btn,{borderWidth:1, borderColor: cancelReason===r.k? '#dc2626':'#e2e8f0', backgroundColor: cancelReason===r.k? '#fef2f2':'#fff'}]}><Text style={s.btnT}>{r.l}</Text></Pressable>
              ))}
            </View>
            <Text style={{fontSize:12, color:'#b91c1c', textAlign:'center', marginTop:12, fontWeight:'700'}}>متأكد؟ سيُحتسب عليك إلغاء</Text>
            <View style={{flexDirection:'row-reverse', gap:8, marginTop:10}}>
              <Pressable onPress={doCancel} disabled={!cancelReason} style={[s.modalBtn,{backgroundColor:'#dc2626', opacity: cancelReason? 1 : .4}]}><Text style={[s.btnT,{color:'#fff'}]}>تأكيد الإلغاء</Text></Pressable>
              <Pressable onPress={()=> setCancelOpen(false)} style={[s.modalBtn,{backgroundColor:'#f1f5f9'}]}><Text style={s.btnT}>رجوع</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {toast && (
        <View style={s.toast}><Text style={s.toastT}>{toast}</Text></View>
      )}
    </View>
  )
}
const s=StyleSheet.create({
  page:{flex:1, backgroundColor:'#f8fafc'},
  header:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:10, backgroundColor:'#fff', borderBottomWidth:1, borderColor:'#e2e8f0'},
  h1:{fontSize:16, fontWeight:'900'},
  badge:{backgroundColor:'#f0fdf4', borderWidth:1, borderColor:'#a7f3d0', paddingHorizontal:8, paddingVertical:4, borderRadius:999},
  badgeT:{fontSize:11, color:'#065f46', fontWeight:'800'},
  legend:{position:'absolute', bottom:10, right:10, backgroundColor:'rgba(255,255,255,0.95)', padding:8, borderRadius:10, borderWidth:1, borderColor:'#e2e8f0'},
  btn:{height:44, borderRadius:12, alignItems:'center', justifyContent:'center'},
  btnT:{fontWeight:'900', fontSize:13},
  overlay:{flex:1, backgroundColor:'rgba(15,23,42,0.5)', alignItems:'center', justifyContent:'center', padding:16},
  modal:{backgroundColor:'#fff', borderRadius:20, padding:16, width:'100%', maxWidth:420},
  modalTitle:{fontSize:15, fontWeight:'900', textAlign:'center'},
  detail:{flex:1, backgroundColor:'#f8fafc', borderWidth:1, borderColor:'#e2e8f0', borderRadius:12, padding:8, alignItems:'center'},
  detailB:{fontSize:13, fontWeight:'900'},
  detailS:{fontSize:10, color:'#64748b'},
  modalBtn:{flex:1, height:44, borderRadius:12, alignItems:'center', justifyContent:'center'},
  toast:{position:'absolute', bottom:20, alignSelf:'center', backgroundColor:'#065f46', paddingHorizontal:20, paddingVertical:12, borderRadius:999},
  toastT:{color:'#fff', fontWeight:'900', fontSize:13},
  tripCard:{position:'absolute', left:10, right:10, bottom:10, backgroundColor:'#fff', borderRadius:16, padding:12, borderWidth:1, borderColor:'#c7d2fe', shadowColor:'#000', shadowOpacity:.15, shadowRadius:10, elevation:6},
});
