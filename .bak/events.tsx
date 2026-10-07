import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Platform } from 'react-native';
import { supabase } from '../utils/supabase';

let MapView: any = View, UrlTile: any = View, Marker: any = View;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default; UrlTile = Maps.UrlTile; Marker = Maps.Marker;
} catch {}

const VEH = [
  { key:'wedding_car', name:'💍 سيارة زفاف', seats:4 },
  { key:'bus_large_50', name:'🚌 باص كبير 50', seats:50 },
  { key:'bus_mid_27', name:'🚌 باص متوسط 27', seats:27 },
  { key:'bus_mid_21', name:'🚌 باص متوسط 21', seats:21 },
  { key:'bus_mid_18', name:'🚌 باص متوسط 18', seats:18 },
  { key:'bus_small_14', name:'🚐 باص صغير 14', seats:14 },
  { key:'van_11', name:'🚐 فان 11', seats:11 },
  { key:'van_8', name:'🚐 فان 8', seats:8 },
] as const;

export default function EventsScreen(){
  const [eventType, setEventType] = useState<string|null>(null);
  const [otherType, setOtherType] = useState('');
  const [gatherPoint, setGatherPoint] = useState('');
  const [gatherTime, setGatherTime] = useState('');
  const [departTime, setDepartTime] = useState('');
  const [dests, setDests] = useState<string[]>(['']);
  const [duration, setDuration] = useState(4);
  const [wait, setWait] = useState(true);
  const [returnTime, setReturnTime] = useState('');
  const [finalPoint, setFinalPoint] = useState('');
  const [people, setPeople] = useState(20);
  const [counts, setCounts] = useState<Record<string,number>>({});
  const [weddingStyle, setWeddingStyle] = useState<'normal'|'lux'>('normal');
  const [weddingDeco, setWeddingDeco] = useState(true);
  const [notes, setNotes] = useState('');
  const [budgetType, setBudgetType] = useState<'fixed'|'quote'>('fixed');
  const [budgetFrom, setBudgetFrom] = useState('');
  const [budgetTo, setBudgetTo] = useState('');
  const [toast,setToast]=useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  // إحداثيات افتراضية — تُحدد بدقة بالسحب بدون ذكر دولة
  const [gatherCoord] = useState({ latitude: 33.5138, longitude: 36.2765 });

  const totalSeats = VEH.reduce((s,v)=> s + (counts[v.key]||0)*v.seats, 0);
  const canPublish = !!eventType && gatherPoint.trim() && dests.some(d=>d.trim()) && totalSeats>0 && (budgetType==='quote' || (budgetFrom && budgetTo && Number(budgetFrom)<=Number(budgetTo))) && (eventType!=='other' || otherType.trim());

  const chg = (k:string, d:number)=> setCounts(c=> ({...c, [k]: Math.max(0,(c[k]||0)+d)}));
  const addDest = ()=> setDests(d=> [...d,'']);
  const setDest = (i:number, v:string)=> setDests(d=> d.map((x,idx)=> idx===i? v:x));

  const handlePublish = async()=>{
    setLoading(true);
    try{
      const { data:{user}} = await supabase.auth.getUser();
      if(!user) throw new Error('سجل دخول أولاً');
      const vehicles = VEH.filter(v=> (counts[v.key]||0)>0).map(v=> ({ type:v.key, seats:v.seats, count:counts[v.key], ...(v.key==='wedding_car'? {style:weddingStyle, deco:weddingDeco}:{}) }));
      const payload:any = {
        user_id:user.id,
        event_type: eventType,
        event_type_other: eventType==='other'? otherType.trim(): null,
        gathering_point: gatherPoint.trim(),
        gathering_time: gatherTime||null,
        departure_time: departTime||null,
        destinations: dests.filter(x=>x.trim()).map(name=> ({name})),
        duration_hours: duration,
        return_time: returnTime||null,
        final_point: finalPoint.trim()||null,
        num_people: people,
        vehicles,
        notes: notes.trim()||null,
        budget_type: budgetType,
        budget_from: budgetType==='fixed'? Number(budgetFrom): null,
        budget_to: budgetType==='fixed'? Number(budgetTo): null,
      };
      const { error } = await supabase.from('event_orders').insert(payload);
      if(error) throw error;
      showToast(budgetType==='quote'? '📩 تم طلب عروض أسعار — سيصلك عروض السائقين' : '📢 تم نشر الطلب');
    } catch(e:any){ showToast(e.message) } finally{ setLoading(false) }
  };

  const showToast=(msg:string)=>{ setToast(msg); setTimeout(()=> setToast(null),2500); };
  return (
    <ScrollView style={s.page} contentContainerStyle={{padding:12, paddingBottom:100}}>
      <Text style={s.h1}>✨ طلب مناسبة جديد</Text>
      <Text style={s.sub}>زفاف • رحلة عائلية • سياحية • أخرى</Text>

      <View style={s.card}>
        <Text style={s.h2}>🎉 نوع المناسبة</Text>
        <View style={s.chips}>
          {[
            ['wedding','💍 زفاف'],
            ['family','👨‍👩‍👧‍👦 عائلية'],
            ['tourist','🏖️ سياحية'],
            ['other','✨ أخرى'],
          ].map(([k,l])=> (
            <Pressable key={k} onPress={()=> setEventType(k)} style={[s.chip, eventType===k && s.chipActive]}><Text style={[s.chipT, eventType===k && s.chipTActive]}>{l}</Text></Pressable>
          ))}
        </View>
        {eventType==='other' && <TextInput value={otherType} onChangeText={setOtherType} placeholder="اكتب نوع المناسبة" style={s.input}/>}
      </View>

      {eventType && (
        <>
          <View style={s.card}>
            <Text style={s.h2}>📍 المسار والمواعيد</Text>
            <Text style={s.hint}>{eventType==='wedding'? 'زفاف: نقطة التجمع → الوجهات → العودة' : 'نقطة التجمع والمسار والعودة'}</Text>
            <Text style={s.label}>نقطة التجمع</Text>
            <TextInput value={gatherPoint} onChangeText={setGatherPoint} placeholder="اكتب نقطة التجمع — اسم الحي والشارع" style={s.input}/>

            {/* خريطة — تظهر على الجوال والويب معاً عبر OSM HOT بدون مفتاح */}
            <View style={{height:180, borderRadius:12, overflow:'hidden', marginTop:8, borderWidth:1, borderColor:'#e2e8f0'}}>
              <MapView style={{flex:1}} initialRegion={{latitude: gatherCoord.latitude, longitude: gatherCoord.longitude, latitudeDelta:0.06, longitudeDelta:0.06}}>
                <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
                <Marker coordinate={gatherCoord} draggable onDragEnd={(e:any)=> {
                  const c=e.nativeEvent.coordinate;
                  setGatherPoint(`${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`);
                }}/>
              </MapView>
            </View>
            <Text style={{fontSize:11, color:'#64748b', textAlign:'center', marginTop:6}}>اسحب الدبوس لتحديد نقطة التجمع بدقة</Text>

            <View style={{flexDirection:'row', gap:8, marginTop:8}}>
              <View style={{flex:1}}><Text style={s.label}>موعد التجمع</Text><TextInput value={gatherTime} onChangeText={setGatherTime} placeholder="2026-09-30 18:00" style={s.input}/></View>
              <View style={{flex:1}}><Text style={s.label}>موعد الانطلاق</Text><TextInput value={departTime} onChangeText={setDepartTime} placeholder="2026-09-30 19:00" style={s.input}/></View>
            </View>
            <Text style={[s.label,{marginTop:8}]}>الوجهة / مسار الرحلة — أكثر من مكان</Text>
            {dests.map((d,i)=> (
              <View key={i} style={{flexDirection:'row', gap:6, marginTop:6}}>
                <TextInput value={d} onChangeText={v=> setDest(i,v)} placeholder={`وجهة ${i+1} — اكتب اسم المكان`} style={[s.input,{flex:1}]}/>
                <Pressable onPress={()=> setDests(x=> x.filter((_,idx)=> idx!==i))} style={s.mini}><Text>✕</Text></Pressable>
              </View>
            ))}
            <Pressable onPress={addDest} style={[s.chip,{marginTop:6, alignSelf:'flex-start'}]}><Text style={s.chipT}>＋ إضافة وجهة</Text></Pressable>

            {/* خريطة المسار */}
            <View style={{height:180, borderRadius:12, overflow:'hidden', marginTop:8, borderWidth:1, borderColor:'#e2e8f0'}}>
              <MapView style={{flex:1}} initialRegion={{latitude: gatherCoord.latitude, longitude: gatherCoord.longitude, latitudeDelta:0.12, longitudeDelta:0.12}}>
                <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
                <Marker coordinate={gatherCoord} pinColor="#4F46E5"/>
                {/* في التطبيق الفعلي نرسم خط الرحلة بين النقاط المحددة */}
              </MapView>
            </View>
            <Text style={{fontSize:11, color:'#64748b', textAlign:'center', marginTop:6}}>خريطة المسار — تُظهر خط الرحلة بين النقاط</Text>

            <View style={{flexDirection:'row', gap:8, marginTop:10}}>
              <View style={{flex:1}}>
                <Text style={s.label}>المدة بالساعات</Text>
                <View style={s.stepper}>
                  <Pressable onPress={()=> setDuration(d=> Math.max(1,d-1))} style={s.stepBtn}><Text>−</Text></Pressable>
                  <Text style={s.stepVal}>{duration}</Text>
                  <Pressable onPress={()=> setDuration(d=> Math.min(72,d+1))} style={s.stepBtn}><Text>＋</Text></Pressable>
                </View>
                <Pressable onPress={()=> setWait(v=> !v)} style={{flexDirection:'row', gap:6, marginTop:6}}><Text>{wait?'☑':'☐'}</Text><Text style={{fontSize:11}}>السائق ينتظر</Text></Pressable>
              </View>
              <View style={{flex:1}}><Text style={s.label}>موعد العودة</Text><TextInput value={returnTime} onChangeText={setReturnTime} placeholder="2026-10-01 02:00" style={s.input}/></View>
            </View>
            <Text style={[s.label,{marginTop:8}]}>نقطة التجمع النهائية</Text>
            <TextInput value={finalPoint} onChangeText={setFinalPoint} placeholder="نقطة الوصول الأخيرة" style={s.input}/>
          </View>

          <View style={s.card}>
            <Text style={s.h2}>👥 الأشخاص والمركبات</Text>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
              <Text style={{fontWeight:'800'}}>عدد الأشخاص</Text>
              <View style={s.stepper}>
                <Pressable onPress={()=> setPeople(p=> Math.max(1,p-1))} style={s.stepBtn}><Text>−</Text></Pressable>
                <Text style={s.stepVal}>{people}</Text>
                <Pressable onPress={()=> setPeople(p=> Math.min(500,p+1))} style={s.stepBtn}><Text>＋</Text></Pressable>
              </View>
            </View>
            {VEH.map(v=> (
              <View key={v.key} style={s.veh}>
                <View><Text style={{fontWeight:'800', fontSize:13}}>{v.name}</Text><Text style={{fontSize:11, color:'#64748b'}}>{v.seats} مقاعد • العدد: {counts[v.key]||0}</Text></View>
                <View style={s.stepper}>
                  <Pressable onPress={()=> chg(v.key,-1)} style={s.stepBtn}><Text>−</Text></Pressable>
                  <Text style={s.stepVal}>{counts[v.key]||0}</Text>
                  <Pressable onPress={()=> chg(v.key,1)} style={s.stepBtn}><Text>＋</Text></Pressable>
                </View>
              </View>
            ))}
            <View style={[s.total, (totalSeats>=people && totalSeats>0)? s.totalOk: s.totalWarn]}>
              <Text style={{fontWeight:'900', textAlign:'center'}}>{totalSeats===0? `⚠️ اختر مركبات — 0 / ${people}` : totalSeats>=people? `✅ المقاعد: ${totalSeats} / ${people}` : `⚠️ لا تكفي: ${totalSeats} / ${people}`}</Text>
            </View>
            {(counts['wedding_car']||0)>0 && (
              <View style={s.wedBox}>
                <Text style={{fontWeight:'900', fontSize:12}}>💍 تفاصيل سيارة الزفاف</Text>
                <View style={s.chips}>
                  <Pressable onPress={()=> setWeddingStyle('normal')} style={[s.chipSmall, weddingStyle==='normal' && s.chipActive]}><Text style={[s.chipT, weddingStyle==='normal' && s.chipTActive]}>عادية</Text></Pressable>
                  <Pressable onPress={()=> setWeddingStyle('lux')} style={[s.chipSmall, weddingStyle==='lux' && s.chipActive]}><Text style={[s.chipT, weddingStyle==='lux' && s.chipTActive]}>فاخرة</Text></Pressable>
                  <Pressable onPress={()=> setWeddingDeco(true)} style={[s.chipSmall, weddingDeco && s.chipActive]}><Text style={[s.chipT, weddingDeco && s.chipTActive]}>مع زينة ✨</Text></Pressable>
                  <Pressable onPress={()=> setWeddingDeco(false)} style={[s.chipSmall, !weddingDeco && s.chipActive]}><Text style={[s.chipT, !weddingDeco && s.chipTActive]}>بدون زينة</Text></Pressable>
                </View>
              </View>
            )}
          </View>

          <View style={s.card}>
            <Text style={s.h2}>📝 ملاحظات</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="كراسي أطفال، توقف إضافي..." style={[s.input,{height:80, textAlignVertical:'top', paddingTop:8}]} multiline/>
          </View>

          <View style={[s.card,{borderWidth:2, borderColor:'#4F46E5'}]}>
            <Text style={s.h2}>💰 الميزانية</Text>
            <View style={s.chips}>
              <Pressable onPress={()=> setBudgetType('fixed')} style={[s.chip, budgetType==='fixed' && s.chipActive]}><Text style={[s.chipT, budgetType==='fixed' && s.chipTActive]}>💰 تحديد ميزانية</Text></Pressable>
              <Pressable onPress={()=> setBudgetType('quote')} style={[s.chip, budgetType==='quote' && s.chipActive]}><Text style={[s.chipT, budgetType==='quote' && s.chipTActive]}>📩 طلب عروض أسعار</Text></Pressable>
            </View>
            {budgetType==='fixed' ? (
              <View style={{flexDirection:'row', gap:8, marginTop:8}}>
                <TextInput value={budgetFrom} onChangeText={setBudgetFrom} placeholder="من" keyboardType="numeric" style={[s.input,{flex:1}]}/>
                <Text style={{alignSelf:'center'}}>—</Text>
                <TextInput value={budgetTo} onChangeText={setBudgetTo} placeholder="إلى" keyboardType="numeric" style={[s.input,{flex:1}]}/>
              </View>
            ) : (
              <View style={s.quoteBox}><Text style={{fontWeight:'900'}}>📩 طلب عروض أسعار مفعّل</Text><Text style={{fontSize:12, color:'#065f46', marginTop:4}}>سيقدّم السائقون عروضهم وتختار الأنسب</Text></View>
            )}
          </View>

          <Pressable onPress={handlePublish} disabled={!canPublish || loading} style={[s.publish, (!canPublish||loading) && {backgroundColor:'#cbd5e1'}]}>
            <Text style={s.publishT}>{loading? 'جاري النشر...' : budgetType==='quote'? '📩 طلب عروض أسعار' : '📢 نشر الطلب'}</Text>
          </Pressable>
        </>
      )}
    
      {toast && (
        <View style={{position:'absolute', bottom:20, alignSelf:'center', backgroundColor:'#065f46', paddingHorizontal:20, paddingVertical:12, borderRadius:999, shadowColor:'#000', shadowOpacity:0.2, shadowRadius:8, elevation:5}}>
          <Text style={{color:'#fff', fontWeight:'900', fontSize:13, textAlign:'center'}}>{toast}</Text>
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  page:{flex:1, backgroundColor:'#f8fafc'},
  h1:{fontSize:18, fontWeight:'900', textAlign:'center', marginTop:8},
  sub:{fontSize:12, color:'#64748b', textAlign:'center', marginBottom:8},
  card:{backgroundColor:'#fff', borderWidth:1, borderColor:'#e2e8f0', borderRadius:16, padding:12, marginBottom:12},
  h2:{fontSize:14, fontWeight:'900', marginBottom:6},
  hint:{fontSize:11, color:'#64748b', marginBottom:6, lineHeight:16},
  label:{fontSize:12, fontWeight:'800'},
  input:{borderWidth:1.5, borderColor:'#e2e8f0', borderRadius:12, height:44, paddingHorizontal:12, backgroundColor:'#fff', marginTop:4},
  chips:{flexDirection:'row', flexWrap:'wrap', gap:8},
  chip:{paddingHorizontal:12, paddingVertical:8, borderRadius:999, borderWidth:1.5, borderColor:'#e2e8f0', backgroundColor:'#fff'},
  chipSmall:{paddingHorizontal:10, paddingVertical:6, borderRadius:999, borderWidth:1.5, borderColor:'#e2e8f0', backgroundColor:'#fff'},
  chipActive:{backgroundColor:'#4F46E5', borderColor:'#4F46E5'},
  chipT:{fontSize:13, fontWeight:'800', color:'#0f172a'},
  chipTActive:{color:'#fff'},
  stepper:{flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#f1f5f9', borderRadius:999, padding:4, alignSelf:'flex-start'},
  stepBtn:{width:32, height:32, borderRadius:999, borderWidth:1, borderColor:'#e2e8f0', backgroundColor:'#fff', alignItems:'center', justifyContent:'center'},
  stepVal:{minWidth:20, textAlign:'center', fontWeight:'900'},
  veh:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', borderWidth:1, borderColor:'#e2e8f0', borderRadius:12, padding:10, marginTop:8},
  total:{borderRadius:12, padding:10, marginTop:8, borderWidth:1},
  totalOk:{backgroundColor:'#f0fdf4', borderColor:'#a7f3d0'},
  totalWarn:{backgroundColor:'#fef2f2', borderColor:'#fecaca'},
  wedBox:{borderWidth:1, borderStyle:'dashed', borderColor:'#a5b4fc', borderRadius:12, padding:10, backgroundColor:'#f8fafc', marginTop:8, gap:6},
  quoteBox:{backgroundColor:'#f0fdf4', borderWidth:1, borderColor:'#a7f3d0', borderRadius:12, padding:10, alignItems:'center', marginTop:8},
  publish:{backgroundColor:'#4F46E5', height:48, borderRadius:14, alignItems:'center', justifyContent:'center'},
  publishT:{color:'#fff', fontWeight:'900', fontSize:15},
  mini:{paddingHorizontal:10, height:44, borderRadius:12, borderWidth:1, borderColor:'#e2e8f0', alignItems:'center', justifyContent:'center', backgroundColor:'#fff'},
});
