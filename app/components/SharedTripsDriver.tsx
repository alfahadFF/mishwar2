import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Vibration, Modal } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';

// رحلات السائق المشتركة: بدء (تُخصم العمولة) / إنهاء / إلغاء + الركاب بلا أسماء وزر اتصال فقط
const REASONS=[{k:'no_answer',l:'الراكب لا يرد'},{k:'car_issue',l:'عطل في السيارة'},{k:'emergency',l:'ظرف طارئ'},{k:'other',l:'سبب آخر'}];
const fmtT=(iso:string)=> new Date(iso).toLocaleString('ar',{weekday:'short',hour:'2-digit',minute:'2-digit'});

export default function SharedTripsDriver({ toast, empty, noTrack }:{ toast:(m:string)=>void; empty?:React.ReactNode; noTrack?:boolean }){
  const [trips,setTrips]=useState<any[]>([]);
  const [open,setOpen]=useState<string|null>(null);
  const [pax,setPax]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);
  const [cancelFor,setCancelFor]=useState<any>(null);
  const [reason,setReason]=useState<string|null>(null);
  const load=useCallback(async()=>{ const { data }=await supabase.rpc('driver_my_shared_trips'); setTrips((data||[]) as any[]); },[]);
  useFocusEffect(useCallback(()=>{ load(); },[load]));
  const loadPax=async(id:string)=>{ const { data }=await supabase.rpc('driver_shared_passengers',{p_trip:id}); setPax((data||[]) as any[]); };
  const toggle=(id:string)=>{ if(open===id){ setOpen(null); return; } setOpen(id); setPax([]); loadPax(id); };

  // تذكير كل 15 دقيقة إذا فات وقت رحلة بدون بدء
  const overdue=trips.some(t=> t.overdue);
  useEffect(()=>{
    if(!overdue) return;
    const remind=()=>{ Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); Vibration.vibrate([0,300,150,300]); toast('حان وقت الانطلاق، اضغط «بدء الرحلة» أو ألغِها'); };
    remind(); const iv=setInterval(remind, 15*60*1000);
    return ()=> clearInterval(iv);
  },[overdue]);

  // إرسال موقع السائق أثناء الرحلة (لتظهر الرحلة فقط لمن هم أمام السيارة)
  const started=trips.find(t=> t.started_at);
  const sub=useRef<any>(null);
  useEffect(()=>{
    if(!started || noTrack) return;
    let alive=true;
    (async()=>{
      const { status }=await Location.requestForegroundPermissionsAsync(); if(status!=='granted' || !alive) return;
      sub.current=await Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced, timeInterval:30000, distanceInterval:100},
        loc=>{ supabase.rpc('driver_shared_position',{p_trip:started.id, p_lat:loc.coords.latitude, p_lng:loc.coords.longitude}); });
    })();
    return ()=>{ alive=false; sub.current?.remove?.(); sub.current=null; };
  },[started?.id]);

  const act=async(fn:string, t:any, okMsg:(d:any)=>string)=>{
    if(busy) return; setBusy(true);
    const { data, error }=await supabase.rpc(fn,{p_trip:t.id}); setBusy(false);
    if(error){ toast(errMsg(error)); load(); return; }
    toast(okMsg(data)); load(); if(open===t.id) loadPax(t.id);
  };
  const doCancel=async()=>{
    const t=cancelFor; if(!t || !reason) return; setCancelFor(null);
    const { data, error }=await supabase.rpc('driver_cancel_shared_trip',{p_trip:t.id, p_reason:reason}); setReason(null);
    if(error){ toast(errMsg(error)); return; }
    toast((data as any)?.suspended? 'تم إيقاف استقبال الطلبات بسبب كثرة الإلغاءات' : 'تم إلغاء الرحلة'); load();
  };

  if(!trips.length) return <>{empty ?? null}</>;
  return (
    <View style={{gap:8}}>
      <Text style={s.h}>👥 رحلاتي المشتركة ({trips.length} من 4 اليوم)</Text>
      {trips.map(t=> (
        <View key={t.id} style={[s.card, t.overdue && {borderColor:'#f59e0b'}]}>
          <Pressable onPress={()=> toggle(t.id)} style={{flexDirection:'row-reverse', justifyContent:'space-between'}}>
            <View style={{flex:1}}>
              <Text style={s.b}>{t.pickup_text} ← {t.dropoff_text}</Text>
              <Text style={s.m}>{fmtT(t.departure_time)} • {t.passengers} راكب • شاغر {t.available_seats}{t.started_at? ' • 🛣️ جارية' : t.overdue? ' • ⏰ فات الموعد' : ''}</Text>
            </View>
            <Text style={s.m}>{open===t.id? '▲' : '▼'}</Text>
          </Pressable>
          {open===t.id && (
            <View style={{marginTop:8, gap:6}}>
              {pax.length===0 && <Text style={s.m}>لا يوجد ركاب منضمون بعد</Text>}
              {pax.map((p,i)=> (
                <View key={p.request_id} style={s.pax}>
                  <View style={{flex:1}}>
                    <Text style={s.b}>راكب {i+1} • {p.seats} مقعد • ${Number(p.fare).toFixed(2)}{Number(p.extra_fee)>0? ` (إضافي ${Number(p.extra_fee)})` : ''}</Text>
                    <View style={{flexDirection:'row-reverse', gap:10, marginTop:4}}>
                      <Pressable onPress={()=> Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${p.pickup[0]},${p.pickup[1]}`)}><Text style={s.link}>📍 نقطة الركوب</Text></Pressable>
                      <Pressable onPress={()=> Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${p.dropoff[0]},${p.dropoff[1]}`)}><Text style={s.link}>🏁 نقطة النزول</Text></Pressable>
                      {p.paid && <Text style={[s.m,{color:'#047857'}]}>✅ دفع من التطبيق</Text>}
                    </View>
                  </View>
                  {!!p.phone && <Pressable onPress={()=> Linking.openURL('tel:'+p.phone)} style={s.call}><Text style={s.callT}>📞 اتصال</Text></Pressable>}
                </View>
              ))}
            </View>
          )}
          <View style={{flexDirection:'row-reverse', gap:8, marginTop:10}}>
            {!t.started_at
              ? <Pressable onPress={()=> act('driver_start_shared_trip', t, d=> d?.passengers? `انطلقت الرحلة • ${d.passengers} راكب` : 'انطلقت الرحلة')} style={[s.btn,{backgroundColor:'#0f172a'}]}><Text style={s.btnT}>▶️ بدء الرحلة</Text></Pressable>
              : <Pressable onPress={()=> act('driver_complete_shared_trip', t, ()=> 'انتهت الرحلة')} style={[s.btn,{backgroundColor:'#4F46E5'}]}><Text style={s.btnT}>🏁 إنهاء الرحلة</Text></Pressable>}
            <Pressable onPress={()=>{ setReason(null); setCancelFor(t); }} style={[s.btn,{flex:0, paddingHorizontal:14, backgroundColor:'#fee2e2'}]}><Text style={[s.btnT,{color:'#b91c1c'}]}>إلغاء</Text></Pressable>
          </View>
        </View>
      ))}
      <Modal visible={!!cancelFor} transparent animationType="fade" onRequestClose={()=> setCancelFor(null)}>
        <View style={s.overlay}><View style={s.modal}>
          <Text style={[s.b,{textAlign:'center', fontSize:15}]}>سبب الإلغاء</Text>
          <View style={{gap:8, marginTop:12}}>
            {REASONS.map(r=> <Pressable key={r.k} onPress={()=> setReason(r.k)} style={[s.opt, reason===r.k && {borderColor:'#dc2626', backgroundColor:'#fef2f2'}]}><Text style={s.b}>{r.l}</Text></Pressable>)}
          </View>
          {!!cancelFor?.passengers && <Text style={s.warn}>متأكد؟ سيُحتسب عليك إلغاء</Text>}
          <View style={{flexDirection:'row-reverse', gap:8, marginTop:10}}>
            <Pressable onPress={doCancel} disabled={!reason} style={[s.btn,{backgroundColor:'#dc2626', opacity: reason? 1 : .4}]}><Text style={s.btnT}>تأكيد الإلغاء</Text></Pressable>
            <Pressable onPress={()=> setCancelFor(null)} style={[s.btn,{backgroundColor:'#f1f5f9'}]}><Text style={[s.btnT,{color:'#0f172a'}]}>رجوع</Text></Pressable>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}
const s=StyleSheet.create({
  h:{fontWeight:'900', fontSize:13, textAlign:'right'},
  card:{backgroundColor:'#fff', borderWidth:1, borderColor:'#e2e8f0', borderRadius:14, padding:10},
  b:{fontWeight:'800', fontSize:13, textAlign:'right'},
  m:{fontSize:11, color:'#64748b', textAlign:'right', marginTop:2},
  link:{fontSize:11, color:'#4F46E5', fontWeight:'800'},
  pax:{flexDirection:'row-reverse', alignItems:'center', gap:8, backgroundColor:'#f8fafc', borderRadius:10, padding:8},
  call:{backgroundColor:'#22c55e', borderRadius:10, paddingHorizontal:10, paddingVertical:8},
  callT:{color:'#fff', fontWeight:'900', fontSize:12},
  btn:{flex:1, height:42, borderRadius:12, alignItems:'center', justifyContent:'center'},
  btnT:{color:'#fff', fontWeight:'900', fontSize:13},
  overlay:{flex:1, backgroundColor:'rgba(15,23,42,0.5)', alignItems:'center', justifyContent:'center', padding:16},
  modal:{backgroundColor:'#fff', borderRadius:20, padding:16, width:'100%', maxWidth:420},
  opt:{height:44, borderRadius:12, borderWidth:1, borderColor:'#e2e8f0', alignItems:'center', justifyContent:'center'},
  warn:{fontSize:12, color:'#b91c1c', textAlign:'center', marginTop:12, fontWeight:'700'},
});
