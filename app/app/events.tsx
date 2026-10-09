import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { guestBlocked } from '../utils/guest';
import { useToast } from '../components/Toast';
import PointPicker from '../components/PointPicker';
import PointRow from '../components/PointRow';
import TripRouteMap, { Segment, TripMarker } from '../components/TripRouteMap';

type Pt={ll:number[]|null,label:string};
const EMPTY:Pt={ll:null,label:''};

type EventType='wedding'|'family'|'tourist'|'other';
type EventVehicle = { key: string; name: string; seats: number };
const VEH: EventVehicle[] = [
  { key:'wedding_car', name:'💍 سيارة زفاف', seats:4 },
  { key:'bus_large_50', name:'🚌 باص كبير 50', seats:50 },
  { key:'bus_mid_27', name:'🚌 باص متوسط 27', seats:27 },
  { key:'bus_mid_21', name:'🚌 باص متوسط 21', seats:21 },
  { key:'bus_mid_18', name:'🚌 باص متوسط 18', seats:18 },
  { key:'bus_small_14', name:'🚐 باص صغير 14', seats:14 },
  { key:'van_11', name:'🚐 فان 11', seats:11 },
  { key:'van_8', name:'🚐 فان 8', seats:8 },
];
const EVENT_FORM:Record<EventType,{title:string;gather:string;routeTitle:string;routeHint:string;duration:string;detailsTitle:string;detailsHint:string}>={
  wedding:{title:'تفاصيل الزفاف',gather:'مكان التجمع (العروس/العريس)',routeTitle:'مسار الزفاف والصالة',routeHint:'حدد التجمع والصالة وأي محطات بينهما ومكان الوصول الأخير.',duration:'مدة خدمة الزفاف',detailsTitle:'ترتيبات الزفاف',detailsHint:'اسم الصالة وترتيب المراسم وأي متطلبات خاصة بنقل العروسين.'},
  family:{title:'خطة الرحلة العائلية',gather:'نقطة تجمع العائلة',routeTitle:'وجهات الرحلة العائلية',routeHint:'أضف وجهات الرحلة العائلية بالترتيب وحدد نقطة العودة.',duration:'مدة الرحلة العائلية',detailsTitle:'احتياجات العائلة',detailsHint:'أطفال، مقاعد أطفال، أمتعة أو متطلبات خاصة بالعائلة.'},
  tourist:{title:'برنامج الرحلة السياحية',gather:'نقطة انطلاق الرحلة السياحية',routeTitle:'المعالم ومحطات الزيارة',routeHint:'أضف المواقع السياحية بالترتيب وحدد نقطة الوصول الأخيرة.',duration:'مدة الجولة السياحية',detailsTitle:'برنامج الزيارة',detailsHint:'أماكن الزيارة المرغوبة ومدة التوقف أو تفاصيل البرنامج.'},
  other:{title:'تفاصيل المناسبة',gather:'نقطة تجمع المناسبة',routeTitle:'مسار المناسبة ونقاط التنقل',routeHint:'حدد نقطة التجمع والوجهات المطلوبة ونقطة الوصول الأخيرة.',duration:'مدة المناسبة',detailsTitle:'متطلبات المناسبة',detailsHint:'اشرح ما تحتاجه المناسبة من مركبات أو ترتيبات خاصة.'},
};

export default function EventsScreen(){
  const [eventType, setEventType] = useState<EventType|null>(null);
  const [otherType, setOtherType] = useState('');
  const [typeDetails, setTypeDetails] = useState('');
  const [gather, setGather] = useState<Pt>(EMPTY);
  const [gatherTime, setGatherTime] = useState('');
  const [departTime, setDepartTime] = useState('');
  const [dests, setDests] = useState<Pt[]>([EMPTY]);
  const [duration, setDuration] = useState(4);
  const [wait, setWait] = useState(true);
  const [returnTime, setReturnTime] = useState('');
  const [finalPt, setFinalPt] = useState<Pt>(EMPTY);
  const [picker,setPicker]=useState<{title:string,color:string,initial:number[]|null,apply:(ll:number[],label:string)=>void}|null>(null);
  const [routeInfo,setRouteInfo]=useState<any>(null);
  const [people, setPeopleRaw] = useState(20);
  const setPeople=(n:number)=>{ const v=Math.max(1,Math.min(500,Math.round(n)||1)); setPeopleRaw(v); setPeopleTxt(String(v)); };
  const [counts, setCounts] = useState<Record<string,number>>({});
  const [weddingStyle, setWeddingStyle] = useState<'normal'|'lux'>('normal');
  const [weddingDeco, setWeddingDeco] = useState(true);
  const [notes, setNotes] = useState('');
  const [peopleTxt, setPeopleTxt] = useState('20');
  const toast=useToast();
  const router=useRouter();
  const [loading, setLoading] = useState(false);

  const eventForm=eventType?EVENT_FORM[eventType]:null;
  const eventVehicles=eventType==='wedding'?VEH:VEH.filter(v=>v.key!=='wedding_car');
  const totalSeats = eventVehicles.reduce<number>((s,v)=> s + (counts[v.key]||0)*v.seats, 0);
  const canPublish = !!eventType && !!gather.ll && dests.some(d=>d.ll) && totalSeats>=people && people>=1 && (eventType!=='other' || !!otherType.trim());

  const selectEventType=(next:EventType)=>{
    if(next===eventType) return;
    setEventType(next); setTypeDetails(''); setCounts({});
    setWeddingStyle('normal'); setWeddingDeco(true);
    if(next!=='other') setOtherType('');
  };
  const chg = (k:string, d:number)=> setCounts(c=> ({...c, [k]: Math.max(0,(c[k]||0)+d)}));
  const addDest = ()=> setDests(d=> [...d,EMPTY]);
  const openPick=(title:string,color:string,initial:number[]|null,apply:(ll:number[],label:string)=>void)=> setPicker({title,color,initial,apply});
  const D=dests.filter(d=>d.ll).map(d=>d.ll!);
  const segments:Segment[]= gather.ll && D.length ? [
    {key:'outbound', name:'الذهاب', icon:'🛣️', color:'#4F46E5', pts:[gather.ll,...D]},
    {key:'return', name:'العودة', icon:'↩️', color:'#16a34a', ret:true, pts:[D[D.length-1], finalPt.ll||gather.ll]},
  ] : [];
  const markers:TripMarker[]=[
    ...(gather.ll? [{ll:gather.ll, txt:'نقطة التجمع', color:'green'}]:[]),
    ...dests.flatMap((d,i)=> d.ll? [{ll:d.ll, txt:'الوجهة '+(i+1), color:'indigo'}]:[]),
    ...(finalPt.ll? [{ll:finalPt.ll, txt:'الوصول الأخير', color:'red'}]:[]),
  ];

  const handlePublish = async()=>{
    setLoading(true);
    try{
      const { data:{user}} = await supabase.auth.getUser();
      if(!user){ guestBlocked(); return; }
      const vehicles = eventVehicles.filter(v=> (counts[v.key]||0)>0).map(v=> ({ type:v.key, seats:v.seats, count:counts[v.key], ...(eventType==='wedding' && v.key==='wedding_car'? {style:weddingStyle, deco:weddingDeco}:{}) }));
      const orderNotes=[
        typeDetails.trim()? `${eventForm?.detailsTitle||'تفاصيل الطلب'}: ${typeDetails.trim()}`:null,
        notes.trim()? `ملاحظات إضافية: ${notes.trim()}`:null,
      ].filter(Boolean).join('\n\n')||null;
      const payload:any = {
        user_id:user.id,
        event_type: eventType,
        event_type_other: eventType==='other'? otherType.trim(): null,
        gathering_point: gather.label,
        gathering_lat: gather.ll![0], gathering_lng: gather.ll![1],
        gathering_time: gatherTime||null,
        departure_time: departTime||null,
        destinations: dests.filter(x=>x.ll).map(x=> ({label:x.label, lat:x.ll![0], lng:x.ll![1]})),
        duration_hours: duration,
        return_time: returnTime||null,
        wait,
        final_point: finalPt.ll? JSON.stringify({label:finalPt.label, lat:finalPt.ll[0], lng:finalPt.ll[1]}) : null,
        route_info: routeInfo,
        num_people: people,
        vehicles,
        total_seats: totalSeats,
        notes: orderNotes,
        budget_type: 'quote',
      };
      const { error } = await supabase.from('event_orders').insert(payload);
      if(error) throw error;
      toast.show('تم نشر الطلب');
      setTimeout(()=> router.replace('/my-orders?tab=events' as any), 1200);
    } catch(e:any){ toast.show('تعذر نشر الطلب، حاول مرة أخرى','err') } finally{ setLoading(false) }
  };

  return (
    <View style={{flex:1}}>
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
            <Pressable key={k} onPress={()=> selectEventType(k as EventType)} style={[s.chip, eventType===k && s.chipActive]}><Text style={[s.chipT, eventType===k && s.chipTActive]}>{l}</Text></Pressable>
          ))}
        </View>
        {eventType==='other' && <TextInput value={otherType} onChangeText={setOtherType} placeholder="اكتب نوع المناسبة" style={s.input}/>}
      </View>

      {eventType && eventForm && (
        <>
          <View style={s.card}>
            <Text style={s.h2}>{eventForm.title}</Text>
            <Text style={s.hint}>{eventForm.detailsHint}</Text>
            <TextInput value={typeDetails} onChangeText={setTypeDetails} maxLength={500} multiline
              placeholder={eventForm.detailsHint} style={[s.input,{height:80,textAlignVertical:'top',paddingTop:8}]}/>
          </View>

          <View style={s.card}>
            <Text style={s.h2}>📍 {eventForm.routeTitle}</Text>
            <Text style={s.hint}>{eventForm.routeHint}</Text>
            <PointRow badge="📍" color="#16a34a" title={eventForm.gather} label={gather.label} set={!!gather.ll}
              onPick={()=> openPick(eventForm.gather,'green',gather.ll,(ll,label)=> setGather({ll,label}))}/>

            <View style={{flexDirection:'row', gap:8, marginTop:8}}>
              <View style={{flex:1}}><Text style={s.label}>موعد التجمع</Text><TextInput value={gatherTime} onChangeText={setGatherTime} placeholder="YYYY-MM-DD HH:MM" style={s.input}/></View>
              <View style={{flex:1}}><Text style={s.label}>موعد الانطلاق</Text><TextInput value={departTime} onChangeText={setDepartTime} placeholder="YYYY-MM-DD HH:MM" style={s.input}/></View>
            </View>
            <Text style={[s.label,{marginTop:8}]}>{eventForm.routeTitle} — أكثر من محطة</Text>
            {dests.map((d,i)=> {
              const pointTitle=eventType==='wedding'?`وجهة الزفاف ${i+1}`:eventType==='tourist'?`محطة الزيارة ${i+1}`:eventType==='family'?`وجهة العائلة ${i+1}`:`وجهة ${i+1}`;
              return <PointRow key={i} badge={String(i+1)} color="#4F46E5" title={pointTitle} label={d.label} set={!!d.ll}
                onPick={()=> openPick(pointTitle,'indigo',d.ll,(ll,label)=> setDests(x=> x.map((y,idx)=> idx===i? {ll,label}:y)))}
                onRemove={i>0? ()=> setDests(x=> x.filter((_,idx)=> idx!==i)) : undefined}/>;
            })}
            <Pressable onPress={addDest} style={s.addPt}><Text style={s.addPtT}>{eventType==='tourist'?'＋ إضافة محطة زيارة':'＋ إضافة وجهة'}</Text></Pressable>

            <View style={{flexDirection:'row', gap:8, marginTop:10}}>
              <View style={{flex:1}}>
                <Text style={s.label}>{eventForm.duration} (بالساعات)</Text>
                <View style={s.stepper}>
                  <Pressable onPress={()=> setDuration(d=> Math.max(1,d-1))} style={s.stepBtn}><Text>−</Text></Pressable>
                  <Text style={s.stepVal}>{duration}</Text>
                  <Pressable onPress={()=> setDuration(d=> Math.min(72,d+1))} style={s.stepBtn}><Text>＋</Text></Pressable>
                </View>
                <Pressable onPress={()=> setWait(v=> !v)} style={{flexDirection:'row', gap:6, marginTop:6}}><Text>{wait?'☑':'☐'}</Text><Text style={{fontSize:11}}>{eventType==='wedding'?'السائق ينتظر بين محطات الزفاف':eventType==='tourist'?'السائق ينتظر بين الزيارات':'السائق ينتظر بين المحطات'}</Text></Pressable>
              </View>
              <View style={{flex:1}}><Text style={s.label}>موعد العودة</Text><TextInput value={returnTime} onChangeText={setReturnTime} placeholder="YYYY-MM-DD HH:MM" style={s.input}/></View>
            </View>
            <PointRow badge="🏁" color="#dc2626" title={eventType==='wedding'?'الوصول الأخير (الصالة/المنزل)':eventType==='tourist'?'نهاية الجولة السياحية':'نقطة الوصول الأخيرة'} label={finalPt.label} set={!!finalPt.ll} optional
              onPick={()=> openPick(eventType==='wedding'?'الوصول الأخير للزفاف':eventType==='tourist'?'نهاية الجولة السياحية':'نقطة الوصول الأخيرة','red',finalPt.ll,(ll,label)=> setFinalPt({ll,label}))}
              onRemove={finalPt.ll? ()=> setFinalPt(EMPTY) : undefined}/>
            {segments.length>0 && <><Text style={[s.label,{marginTop:12}]}>🛣️ مسار الرحلة</Text><TripRouteMap segments={segments} markers={markers} onResult={setRouteInfo}/></>}
          </View>

          <View style={s.card}>
            <Text style={s.h2}>{eventType==='wedding'?'💍 الأشخاص ومركبات الزفاف':eventType==='family'?'👨‍👩‍👧‍👦 أفراد العائلة والمركبات':eventType==='tourist'?'🏖️ المشاركون ومركبات الجولة':'👥 الأشخاص والمركبات'}</Text>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
              <Text style={{fontWeight:'800'}}>{eventType==='family'?'عدد أفراد العائلة':eventType==='tourist'?'عدد المشاركين':'عدد الأشخاص'}</Text>
              <View style={s.stepper}>
                <Pressable onPress={()=> setPeople(people-1)} style={s.stepBtn}><Text>−</Text></Pressable>
                <TextInput value={peopleTxt} keyboardType="number-pad" maxLength={3} style={s.peopleIn}
                  onChangeText={t=>{ const d=t.replace(/[^0-9]/g,''); setPeopleTxt(d); if(d) setPeopleRaw(Math.min(500,Math.max(1,Number(d)))); }}
                  onBlur={()=> setPeople(Number(peopleTxt)||1)}/>
                <Pressable onPress={()=> setPeople(people+1)} style={s.stepBtn}><Text>＋</Text></Pressable>
              </View>
            </View>
            <View style={[s.chips,{marginTop:8}]}>
              {[10,20,30,50,100,150].map(n=> (
                <Pressable key={n} onPress={()=> setPeople(n)} style={[s.chipSmall, people===n && s.chipActive]}><Text style={[s.chipT, people===n && s.chipTActive]}>{n}</Text></Pressable>
              ))}
            </View>
            {eventVehicles.map(v=> (
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
            {eventType==='wedding' && (counts['wedding_car']||0)>0 && (
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
            <Text style={s.h2}>📝 ملاحظات إضافية مشتركة (اختياري)</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="أي ملاحظة أخرى للطلب..." style={[s.input,{height:80, textAlignVertical:'top', paddingTop:8}]} multiline/>
          </View>

          <Pressable onPress={handlePublish} disabled={!canPublish || loading} style={[s.publish, (!canPublish||loading) && {backgroundColor:'#cbd5e1'}]}>
            <Text style={s.publishT}>{loading? 'جاري النشر...' : '📢 نشر الطلب واستقبال العروض'}</Text>
          </Pressable>
        </>
      )}
    
      <PointPicker visible={!!picker} title={picker?.title||''} color={picker?.color} initial={picker?.initial}
        onClose={()=> setPicker(null)} onConfirm={(ll,label)=>{ picker?.apply(ll,label); setPicker(null); }}/>
    </ScrollView>
    {toast.node}
    </View>
  )
}

const s = StyleSheet.create({
  addPt:{marginTop:8, height:38, borderRadius:12, borderWidth:1.5, borderStyle:'dashed', borderColor:'#c7d2fe', backgroundColor:'#f8faff', alignItems:'center', justifyContent:'center'},
  addPtT:{color:'#4F46E5', fontWeight:'900', fontSize:12},
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
  peopleIn:{minWidth:52, height:32, textAlign:'center', fontWeight:'900', fontSize:15, backgroundColor:'#fff', borderRadius:10, borderWidth:1, borderColor:'#e2e8f0', paddingVertical:0},
  mini:{paddingHorizontal:10, height:44, borderRadius:12, borderWidth:1, borderColor:'#e2e8f0', alignItems:'center', justifyContent:'center', backgroundColor:'#fff'},
});
