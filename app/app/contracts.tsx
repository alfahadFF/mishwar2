import React, { useState } from 'react';
import PointPicker from '../components/PointPicker';
import PointRow from '../components/PointRow';
import TripRouteMap, { Segment, TripMarker } from '../components/TripRouteMap';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { guestBlocked } from '../utils/guest';
import { useToast } from '../components/Toast';
import DatePicker from '../components/DatePicker';
import { CT_UNITS, CtUnit, unitOf, durText, ctEndDate } from '../utils/contracts';
const CATS=[{k:'school',icon:'🏫',label:'مدارس'},{k:'kindergarten',icon:'🧸',label:'روضة'},{k:'university',icon:'🎓',label:'جامعات'},{k:'factory',icon:'🏭',label:'مصانع'},{k:'company',icon:'🏢',label:'شركة'},{k:'workers',icon:'👷',label:'عمال'}] as const;
const VEH_S=[{key:'car',name:'🚗 سيارة 4',seats:4},{key:'van_8',name:'🚐 فان 8',seats:8},{key:'van_11',name:'🚐 فان 11',seats:11},{key:'bus_small_14',name:'🚐 باص صغير 14',seats:14}] as const;
const VEH_L=[{key:'bus_large_50',name:'🚌 باص كبير 50',seats:50},{key:'bus_mid_27',name:'🚌 باص متوسط 27',seats:27},{key:'bus_mid_21',name:'🚌 باص متوسط 21',seats:21},{key:'bus_mid_18',name:'🚌 باص متوسط 18',seats:18},{key:'bus_small_14',name:'🚐 باص صغير 14',seats:14},{key:'van_11',name:'🚐 فان 11',seats:11}] as const;
type Pt={ll:number[]|null,label:string};
const setAt=<T,>(arr:T[], i:number, v:Partial<T>)=> arr.map((x,idx)=> idx===i? {...x,...v}:x);
export default function ContractsScreen(){
  const [cat,setCat]=useState<string|null>(null);
  const [eduRole,setEduRole]=useState<'parent'|'employee'|'institution'>('parent');
  const [people,setPeopleRaw]=useState(3); const [peopleTxt,setPeopleTxt]=useState('3');
  const setPeople=(n:number)=>{ const v=Math.max(1,Math.min(500,Math.round(n)||1)); setPeopleRaw(v); setPeopleTxt(String(v)); };
  const [pickups,setPickups]=useState<Pt[]>([{ll:null,label:''}]); const [departTime,setDepartTime]=useState('');
  const [dests,setDests]=useState<(Pt&{rt:string})[]>([{ll:null,label:'',rt:''}]); const [returnTime,setReturnTime]=useState('');
  const [dropSame,setDropSame]=useState('same'); const [drops,setDrops]=useState<Pt[]>([{ll:null,label:''}]);
  const [picker,setPicker]=useState<{title:string,color:string,initial:number[]|null,apply:(ll:number[],label:string)=>void}|null>(null);
  const [routeInfo,setRouteInfo]=useState<any>(null);
  const [days,setDays]=useState<Set<number>>(new Set([0,1,2,3,4])); const [unit,setUnit]=useState<CtUnit>('month'); const [unitCount,setUnitCount]=useState(1); const [dateOpen,setDateOpen]=useState(false);
  const [startDate,setStartDate]=useState<string>('');
  const [shiftType,setShiftType]=useState('morning'); const [needSup,setNeedSup]=useState(false);
  const [counts,setCounts]=useState<Record<string,number>>({}); const [notes,setNotes]=useState('');
  const toast=useToast(); const router=useRouter();
  const [loading,setLoading]=useState(false);
  const isEdu=cat && ['school','kindergarten','university'].includes(cat); const isWork=cat && ['factory','company','workers'].includes(cat);
  const vehList = isWork ? VEH_L : (eduRole==='institution' ? VEH_L : VEH_S);
  const totalSeats=vehList.reduce((s,v)=> s+(counts[v.key]||0)*v.seats,0);
  const canPublish=!!cat && pickups.some(p=>p.ll) && dests.some(d=>d.ll) && (isWork || dropSame==='same' || drops.some(d=>d.ll)) && days.size>0 && totalSeats>0 && !!startDate && unitCount>=1;
  const endDate=ctEndDate(startDate||null, unit, unitCount, Array.from(days));
  const U=unitOf(unit);
  const toggleDay=(d:number)=> setDays(s=>{ const n=new Set(s); if(n.has(d)) n.delete(d); else n.add(d); return n;});
  const chg=(k:string,d:number)=> setCounts(c=> ({...c,[k]:Math.max(0,(c[k]||0)+d)}));
  const handlePublish=async()=>{
    setLoading(true);
    try{
      const {data:{user}}=await supabase.auth.getUser(); if(!user){ guestBlocked(); return; }
      const vehicles=vehList.filter(v=> (counts[v.key]||0)>0).map(v=> ({type:v.key,seats:v.seats,count:counts[v.key]}));
      const roleForDB = isEdu ? eduRole : 'business';
      const payload:any={
        user_id:user.id, contract_category:cat, contract_role:roleForDB, num_people:people,
        pickup_points: pickups.filter(x=>x.ll).map(x=>({label:x.label, lat:x.ll![0], lng:x.ll![1]})), departure_time:departTime||null,
        destinations: dests.filter(d=>d.ll).map(d=>({label:d.label, lat:d.ll![0], lng:d.ll![1], return_time:d.rt||null})), return_time:returnTime||null,
        drop_points: dropSame==='same'? null : drops.filter(x=>x.ll).map(x=>({label:x.label, lat:x.ll![0], lng:x.ll![1]})),
        route_info: routeInfo, days:Array.from(days),
        contract_unit:unit, unit_count:unitCount, duration_type:unit, start_date:startDate, total_seats:totalSeats, shift_type: isWork? shiftType:null,
        need_supervisor:needSup, vehicles, notes:notes.trim()||null, budget_type:'quote',
        
      };
      const {error}=await supabase.from('contract_orders').insert(payload); if(error) throw error;
      toast.show('تم نشر الطلب');
      setTimeout(()=> router.replace('/my-orders?tab=contracts' as any), 1200);
    }catch(e:any){ toast.show('تعذر نشر الطلب، حاول مرة أخرى','err')} finally{ setLoading(false)}
  };
  const P=pickups.filter(p=>p.ll).map(p=>p.ll!), D=dests.filter(d=>d.ll).map(d=>d.ll!);
  const R= (!isWork && dropSame==='different')? drops.filter(d=>d.ll).map(d=>d.ll!) : P.slice().reverse();
  const segments:Segment[]= P.length && D.length ? [
    {key:'outbound', name:'الذهاب', icon:'🛣️', color:'#4F46E5', pts:[...P,...D]},
    ...(R.length? [{key:'return', name:'العودة', icon:'↩️', color:'#16a34a', ret:true, pts:[...D.slice().reverse(),...R]}] : []),
  ] : [];
  const markers:TripMarker[]=[
    ...pickups.flatMap((p,i)=> p.ll? [{ll:p.ll, txt:'A'+(i+1), color:'green'}]:[]),
    ...dests.flatMap((d,i)=> d.ll? [{ll:d.ll, txt:'B'+(i+1), color:'indigo'}]:[]),
    ...(!isWork && dropSame==='different'? drops.flatMap((d,i)=> d.ll? [{ll:d.ll, txt:'C'+(i+1), color:'red'}]:[]) : []),
  ];
  const openPick=(title:string,color:string,initial:number[]|null,apply:(ll:number[],label:string)=>void)=> setPicker({title,color,initial,apply});
  return (
    <View style={{flex:1}}>
    <ScrollView style={s.page} contentContainerStyle={{padding:12,paddingBottom:100}}>
      <Text style={s.h1}>📄 عقد نقل جديد</Text>
      <Text style={s.sub}>مدارس • روضة • جامعات • مصانع • شركات • عمال</Text>
      <View style={s.card}>
        <Text style={s.h2}>📚 فئة العقد</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
          {CATS.map(c=> <Pressable key={c.k} onPress={()=> setCat(c.k)} style={[s.cat, cat===c.k && s.catActive]}><Text>{c.icon}</Text><Text style={[s.catT, cat===c.k && s.catTActive]}>{c.label}</Text></Pressable>)}
        </View>
      </View>
      {cat && isEdu && (
        <View style={s.card}>
          <Text style={s.h2}>👤 صفة المتعاقد</Text>
          <View style={s.row}>
            <Pressable onPress={()=> setEduRole('parent')} style={[s.chip, eduRole==='parent'&&s.chipActive]}><Text style={[s.chipT, eduRole==='parent'&&s.chipTActive]}>👨‍👩‍👧 ولي أمر</Text></Pressable>
            <Pressable onPress={()=> setEduRole('employee')} style={[s.chip, eduRole==='employee'&&s.chipActive]}><Text style={[s.chipT, eduRole==='employee'&&s.chipTActive]}>👨‍🏫 موظف</Text></Pressable>
            <Pressable onPress={()=> setEduRole('institution')} style={[s.chip, eduRole==='institution'&&s.chipActive]}><Text style={[s.chipT, eduRole==='institution'&&s.chipTActive]}>🏫 مؤسسة</Text></Pressable>
          </View>
        </View>
      )}
      {cat && (
        <>
          <View style={s.card}>
            <Text style={s.h2}>👥 {isWork? 'عدد العمال' : eduRole==='parent'? 'عدد الأطفال' : eduRole==='employee'? 'عدد الموظفين' : 'عدد الطلاب'}</Text>
            <View style={s.stepRow}>
              <Text style={{fontWeight:'800'}}>{isWork? 'عدد العمال/الموظفين' : 'العدد'}</Text>
              <View style={s.stepper}>
                <Pressable onPress={()=> setPeople(people-1)} style={s.stepBtn}><Text>−</Text></Pressable>
                <TextInput value={peopleTxt} keyboardType="number-pad" maxLength={3} style={s.numIn}
                  onChangeText={t=>{ const d=t.replace(/[^0-9]/g,''); setPeopleTxt(d); if(d) setPeopleRaw(Math.min(500,Math.max(1,Number(d)))); }}
                  onBlur={()=> setPeople(Number(peopleTxt)||1)}/>
                <Pressable onPress={()=> setPeople(people+1)} style={s.stepBtn}><Text>＋</Text></Pressable>
              </View>
            </View>
            <View style={[s.row,{marginTop:8}]}>
              {[5,10,20,30,50,100].map(n=> <Pressable key={n} onPress={()=> setPeople(n)} style={[s.chipSmall, people===n&&s.chipActive]}><Text style={[s.chipT, people===n&&s.chipTActive]}>{n}</Text></Pressable>)}
            </View>
          </View>
          <View style={s.card}>
            <Text style={s.h2}>📍 {isWork? 'نقطة تجمع العمال' : eduRole==='parent'? 'منازل الأطفال' : eduRole==='employee'? 'مكان السكن' : 'أحياء التجمع'}</Text>
            {pickups.map((p,i)=> <PointRow key={i} badge={'A'+(i+1)} color="#16a34a" title={'مكان الانطلاق '+(i+1)} label={p.label} set={!!p.ll}
              onPick={()=> openPick('مكان الانطلاق '+(i+1),'green',p.ll,(ll,label)=> setPickups(a=> setAt(a,i,{ll,label})))}
              onRemove={i>0? ()=> setPickups(a=> a.filter((_,idx)=> idx!==i)) : undefined}/>)}
            <Pressable onPress={()=> setPickups(a=> [...a,{ll:null,label:''}])} style={s.addPt}><Text style={s.addPtT}>＋ إضافة مكان انطلاق</Text></Pressable>
            {!isWork && <><Text style={s.label}>ساعة الانطلاق</Text><TextInput value={departTime} onChangeText={setDepartTime} placeholder="07:30" style={s.input}/></>}
          </View>
          <View style={s.card}>
            <Text style={s.h2}>🏫 الوجهات</Text>
            {dests.map((d,i)=> <PointRow key={i} badge={'B'+(i+1)} color="#4F46E5" title={'الوجهة '+(i+1)} label={d.label} set={!!d.ll}
              onPick={()=> openPick('الوجهة '+(i+1),'indigo',d.ll,(ll,label)=> setDests(a=> setAt(a,i,{ll,label})))}
              onRemove={i>0? ()=> setDests(a=> a.filter((_,idx)=> idx!==i)) : undefined}>
              {!isWork && <TextInput value={d.rt} onChangeText={v=> setDests(a=> setAt(a,i,{rt:v}))} placeholder="ساعة العودة 14:00" style={[s.input,{height:34,marginTop:6,fontSize:12}]}/>}
            </PointRow>)}
            <Pressable onPress={()=> setDests(a=> [...a,{ll:null,label:'',rt:''}])} style={s.addPt}><Text style={s.addPtT}>＋ إضافة وجهة</Text></Pressable>
            {!isWork && <><Text style={s.label}>ساعة العودة</Text><TextInput value={returnTime} onChangeText={setReturnTime} placeholder="14:00" style={s.input}/></>}
          </View>
          {isWork && (
            <View style={s.card}>
              <Text style={s.h2}>⏰ نظام الورديات</Text>
              <View style={s.row}>
                {[
                  ['morning','صباحية'],['evening','مسائية'],['night','ليلية'],['two_shifts','ورديتين'],['three_shifts','3 ورديات'],['custom','مخصص']
                ].map(([k,l])=> <Pressable key={k} onPress={()=> setShiftType(k)} style={[s.chipSmall, shiftType===k && s.chipActive]}><Text style={[s.chipT, shiftType===k && s.chipTActive]}>{l}</Text></Pressable>)}
              </View>
            </View>
          )}
          {!isWork && (
            <View style={s.card}>
              <Text style={s.h2}>🔁 التنزيل</Text>
              <View style={s.row}>
                <Pressable onPress={()=> setDropSame('same')} style={[s.chipSmall, dropSame==='same'&&s.chipActive]}><Text style={[s.chipT, dropSame==='same'&&s.chipTActive]}>نفس الانطلاق</Text></Pressable>
                <Pressable onPress={()=> setDropSame('different')} style={[s.chipSmall, dropSame==='different'&&s.chipActive]}><Text style={[s.chipT, dropSame==='different'&&s.chipTActive]}>مختلف</Text></Pressable>
              </View>
              {dropSame==='different' && drops.map((d,i)=> <PointRow key={i} badge={'C'+(i+1)} color="#dc2626" title={'مكان التنزيل '+(i+1)} label={d.label} set={!!d.ll}
                onPick={()=> openPick('مكان التنزيل '+(i+1),'red',d.ll,(ll,label)=> setDrops(a=> setAt(a,i,{ll,label})))}
                onRemove={i>0? ()=> setDrops(a=> a.filter((_,idx)=> idx!==i)) : undefined}/>)}
              {dropSame==='different' && <Pressable onPress={()=> setDrops(a=> [...a,{ll:null,label:''}])} style={s.addPt}><Text style={s.addPtT}>＋ إضافة مكان تنزيل</Text></Pressable>}
            </View>
          )}
          {segments.length>0 && (
            <View style={s.card}>
              <Text style={s.h2}>🛣️ مسار الرحلة</Text>
              <TripRouteMap segments={segments} markers={markers} onResult={setRouteInfo}/>
            </View>
          )}
          <View style={s.card}>
            <Text style={s.h2}>📅 أيام الدوام</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
              {[ [6,'سبت'],[0,'أحد'],[1,'إثن'],[2,'ثلا'],[3,'أرب'],[4,'خميس'],[5,'جمعة']].map(([v,l])=> <Pressable key={v} onPress={()=> toggleDay(v as number)} style={[s.day, days.has(v as number)&&s.dayActive]}><Text style={[s.dayT, days.has(v as number)&&s.dayTActive]}>{l as string}</Text></Pressable>)}
            </View>
          </View>
          <View style={s.card}>
            <Text style={s.h2}>⏳ نوع العقد ومدته</Text>
            <View style={s.row}>
              {CT_UNITS.map(u=> <Pressable key={u.k} onPress={()=>{ setUnit(u.k); setUnitCount(u.quick[0]); }} style={[s.chip, unit===u.k&&s.chipActive]}><Text style={[s.chipT, unit===u.k&&s.chipTActive]}>{u.label}</Text></Pressable>)}
            </View>
            <View style={[s.stepRow,{marginTop:10}]}>
              <Text style={{fontWeight:'800'}}>عدد {U.many}</Text>
              <View style={s.stepper}>
                <Pressable onPress={()=> setUnitCount(c=> Math.max(1,c-1))} style={s.stepBtn}><Text>−</Text></Pressable>
                <TextInput value={String(unitCount)} keyboardType="number-pad" maxLength={3} style={s.numIn}
                  onChangeText={t=>{ const d=Number(t.replace(/[^0-9]/g,'')); setUnitCount(Math.min(366,Math.max(1,d||1))); }}/>
                <Pressable onPress={()=> setUnitCount(c=> Math.min(366,c+1))} style={s.stepBtn}><Text>＋</Text></Pressable>
              </View>
            </View>
            <View style={[s.row,{marginTop:8}]}>
              {U.quick.map(n=> <Pressable key={n} onPress={()=> setUnitCount(n)} style={[s.chipSmall, unitCount===n&&s.chipActive]}><Text style={[s.chipT, unitCount===n&&s.chipTActive]}>{durText(unit,n)}</Text></Pressable>)}
            </View>
            <Text style={s.label}>تاريخ البداية</Text>
            <Pressable onPress={()=> setDateOpen(true)} style={[s.input,{justifyContent:'center'}]}>
              <Text style={{fontWeight:'800', color: startDate? '#0f172a':'#94a3b8', textAlign:'right'}}>📅 {startDate || 'اختر التاريخ'}</Text>
            </Pressable>
            {!!endDate && <View style={s.quoteBox}><Text style={{fontWeight:'900'}}>{durText(unit,unitCount)} • من {startDate} إلى {endDate}</Text></View>}
          </View>
          <View style={s.card}>
            <Text style={s.h2}>🚌 المركبات</Text>
            {vehList.map(v=> <View key={v.key} style={s.veh}><View><Text style={{fontWeight:'800', fontSize:13}}>{v.name}</Text><Text style={{fontSize:11,color:'#64748b'}}>{v.seats} مقاعد • {counts[v.key]||0}</Text></View><View style={s.stepper}><Pressable onPress={()=> chg(v.key,-1)} style={s.stepBtn}><Text>−</Text></Pressable><Text style={s.stepVal}>{counts[v.key]||0}</Text><Pressable onPress={()=> chg(v.key,1)} style={s.stepBtn}><Text>＋</Text></Pressable></View></View>)}
            <View style={[s.total, (totalSeats>=people && totalSeats>0)? s.totalOk: s.totalWarn]}><Text style={{fontWeight:'900',textAlign:'center'}}>{totalSeats} / {people}</Text></View>
            {eduRole==='institution' && <Pressable onPress={()=> setNeedSup(v=> !v)} style={{flexDirection:'row',gap:6,marginTop:8}}><Text>{needSup?'☑':'☐'}</Text><Text>مشرف/ة</Text></Pressable>}
          </View>
          <View style={s.card}>
            <Text style={s.h2}>📝 ملاحظات</Text><TextInput value={notes} onChangeText={setNotes} placeholder="..." style={[s.input,{height:80,textAlignVertical:'top',paddingTop:8}]} multiline/>
          </View>
          <Pressable onPress={handlePublish} disabled={!canPublish || loading} style={[s.publish, (!canPublish||loading)&&{backgroundColor:'#cbd5e1'}]}><Text style={s.publishT}>{loading? 'جاري النشر...' : '📢 نشر الطلب واستقبال العروض'}</Text></Pressable>
        </>
      )}
    
      <DatePicker visible={dateOpen} value={startDate} minDate={new Date()} title="تاريخ بداية العقد" onClose={()=> setDateOpen(false)} onPick={setStartDate}/>
      <PointPicker visible={!!picker} title={picker?.title||''} color={picker?.color} initial={picker?.initial}
        onClose={()=> setPicker(null)} onConfirm={(ll,label)=>{ picker?.apply(ll,label); setPicker(null); }}/>
    </ScrollView>
    {toast.node}
    </View>
  )
}
const s=StyleSheet.create({
  addPt:{marginTop:8, height:38, borderRadius:12, borderWidth:1.5, borderStyle:'dashed', borderColor:'#c7d2fe', backgroundColor:'#f8faff', alignItems:'center', justifyContent:'center'},
  addPtT:{color:'#4F46E5', fontWeight:'900', fontSize:12},
  page:{flex:1,backgroundColor:'#f8fafc'},h1:{fontSize:18,fontWeight:'900',textAlign:'center',marginTop:8},sub:{fontSize:12,color:'#64748b',textAlign:'center',marginBottom:8},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e2e8f0',borderRadius:16,padding:12,marginBottom:12},h2:{fontSize:14,fontWeight:'900',marginBottom:6},
  row:{flexDirection:'row',flexWrap:'wrap',gap:8},stepRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  cat:{flexBasis:'30%',flexGrow:1,borderWidth:1.5,borderColor:'#e2e8f0',borderRadius:14,padding:10,alignItems:'center',backgroundColor:'#fff'},catActive:{borderColor:'#4F46E5',backgroundColor:'#eef2ff'},catT:{fontSize:12,fontWeight:'800',marginTop:4},catTActive:{color:'#4F46E5'},
  chip:{paddingHorizontal:12,paddingVertical:8,borderRadius:999,borderWidth:1.5,borderColor:'#e2e8f0',backgroundColor:'#fff'},chipSmall:{paddingHorizontal:10,paddingVertical:6,borderRadius:999,borderWidth:1.5,borderColor:'#e2e8f0',backgroundColor:'#fff'},chipActive:{backgroundColor:'#4F46E5',borderColor:'#4F46E5'},chipT:{fontSize:13,fontWeight:'800'},chipTActive:{color:'#fff'},
  input:{borderWidth:1.5,borderColor:'#e2e8f0',borderRadius:12,height:44,paddingHorizontal:12,backgroundColor:'#fff',marginTop:4},label:{fontSize:12,fontWeight:'800',marginTop:8},
  stepper:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#f1f5f9',borderRadius:999,padding:4},stepBtn:{width:32,height:32,borderRadius:999,borderWidth:1,borderColor:'#e2e8f0',backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},stepVal:{minWidth:20,textAlign:'center',fontWeight:'900'},
  numIn:{minWidth:52,height:32,textAlign:'center',fontWeight:'900',fontSize:15,backgroundColor:'#fff',borderRadius:10,borderWidth:1,borderColor:'#e2e8f0',paddingVertical:0},
  mini:{paddingHorizontal:10,height:44,borderRadius:12,borderWidth:1,borderColor:'#e2e8f0',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},
  veh:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:'#e2e8f0',borderRadius:12,padding:10,marginTop:8},
  total:{borderRadius:12,padding:10,marginTop:8,borderWidth:1},totalOk:{backgroundColor:'#f0fdf4',borderColor:'#a7f3d0'},totalWarn:{backgroundColor:'#fef2f2',borderColor:'#fecaca'},
  quoteBox:{backgroundColor:'#f0fdf4',borderWidth:1,borderColor:'#a7f3d0',borderRadius:12,padding:10,alignItems:'center',marginTop:8},
  publish:{backgroundColor:'#4F46E5',height:48,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:4},publishT:{color:'#fff',fontWeight:'900',fontSize:15},
  day:{width:44,height:36,borderRadius:999,borderWidth:1.5,borderColor:'#e2e8f0',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},dayActive:{backgroundColor:'#4F46E5',borderColor:'#4F46E5'},dayT:{fontSize:11,fontWeight:'800'},dayTActive:{color:'#fff'},
});
