import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import ShareTripBtn from './ShareTripBtn';
import ProviderPhotos from './ProviderPhotos';

// رحلات الراكب المشتركة: اسم السائق وبيانات المركبة بدون أي وسيلة اتصال + زر الدفع ظاهر دائماً
export default function MySharedJoins(){
  const router=useRouter();
  const [list,setList]=useState<any[]>([]);
  useFocusEffect(useCallback(()=>{ (async()=>{ const { data }=await supabase.rpc('my_shared_joins'); setList(((data||[]) as any[]).filter(x=> x.status==='confirmed')); })(); },[]));
  if(!list.length) return null;
  return (
    <View style={{gap:8}}>
      <Text style={s.h}>🎫 رحلاتي</Text>
      {list.map(j=>{
        const fare=Number(j.fare), pct=Number(j.discount_pct||0), app=fare-Math.round(fare*pct)/100;
        const st=j.trip_status==='completed'? '✅ انتهت' : j.trip_status==='cancelled'? '❌ أُلغيت' : j.started? '🛣️ انطلقت' : '⏳ بانتظار الانطلاق';
        return (
          <View key={j.request_id} style={s.card}>
            <Text style={s.b}>{j.pickup_text} ← {j.dropoff_text}</Text>
            <Text style={s.m}>{st} • {j.seats} مقعد • الأجرة ${fare.toFixed(2)}{Number(j.extra_fee)>0? ` (شامل إضافي ${Number(j.extra_fee)})` : ''}</Text>
            <Text style={s.m}>🚗 {j.driver_name||'السائق'}{j.vehicle_model? ' • '+j.vehicle_model : ''}{j.vehicle_color? ' • '+j.vehicle_color : ''}</Text>
            {j.trip_status!=='cancelled' && j.trip_status!=='completed' && <ProviderPhotos service="taxi_shared" refId={j.request_id} />}
            {j.trip_status!=='cancelled' && j.trip_status!=='completed' && <View style={{marginTop:8, flexDirection:'row'}}><ShareTripBtn service="taxi_shared" refId={j.request_id}/></View>}
            {j.trip_status!=='cancelled' && (j.paid
              ? <Text style={[s.m,{color:'#047857', fontWeight:'800'}]}>✅ تم الدفع من التطبيق</Text>
              : <Pressable onPress={()=> router.push('/wallet' as any)} style={s.pay}><Text style={s.payT}>💳 ادفع من التطبيق ${app.toFixed(2)}{pct>0? ` (خصم ${pct}%)` : ''}</Text></Pressable>)}
          </View>
        );
      })}
    </View>
  );
}
const s=StyleSheet.create({
  h:{fontWeight:'900', fontSize:13, textAlign:'right'},
  card:{backgroundColor:'#fff', borderWidth:1, borderColor:'#c7d2fe', borderRadius:14, padding:10},
  b:{fontWeight:'800', fontSize:13, textAlign:'right'},
  m:{fontSize:11, color:'#64748b', textAlign:'right', marginTop:3},
  pay:{marginTop:8, height:40, borderRadius:12, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center'},
  payT:{color:'#fff', fontWeight:'900', fontSize:12},
});
