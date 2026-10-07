import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { supabase } from '../utils/supabase';
let MapView:any=View, UrlTile:any=View, Marker:any=View;
try{ const M=require('react-native-maps'); MapView=M.default; UrlTile=M.UrlTile; Marker=M.Marker; }catch{}
const CATS=[{k:'school',icon:'🏫',label:'مدارس'},{k:'kindergarten',icon:'🧸',label:'روضة'},{k:'university',icon:'🎓',label:'جامعات'},{k:'factory',icon:'🏭',label:'مصانع'},{k:'company',icon:'🏢',label:'شركة'},{k:'workers',icon:'👷',label:'عمال'}] as const;
const VEH_S=[{key:'car',name:'🚗 سيارة 4',seats:4},{key:'van_8',name:'🚐 فان 8',seats:8},{key:'van_11',name:'🚐 فان 11',seats:11},{key:'bus_small_14',name:'🚐 باص صغير 14',seats:14}] as const;
const VEH_L=[{key:'bus_large_50',name:'🚌 باص كبير 50',seats:50},{key:'bus_mid_27',name:'🚌 باص متوسط 27',seats:27},{key:'bus_mid_21',name:'🚌 باص متوسط 21',seats:21},{key:'bus_mid_18',name:'🚌 باص متوسط 18',seats:18},{key:'bus_small_14',name:'🚐 باص صغير 14',seats:14},{key:'van_11',name:'🚐 فان 11',seats:11}] as const;
export default function ContractsScreen(){
  const [cat,setCat]=useState<string|null>(null);
  const [eduRole,setEduRole]=useState<'parent'|'employee'|'institution'>('parent');
  const [people,setPeople]=useState(3);
  const [pickups,setPickups]=useState(['']); const [departTime,setDepartTime]=useState('');
  const [dests,setDests]=useState([{name:'',rt:''}]); const [returnTime,setReturnTime]=useState('');
  const [dropSame,setDropSame]=useState('same'); const [drops,setDrops]=useState(['']);
  const [days,setDays]=useState<Set<number>>(new Set([0,1,2,3,4])); const [duration,setDuration]=useState('semester');
  const [startDate,setStartDate]=useState(''); const [endDate,setEndDate]=useState('');
  const [shiftType,setShiftType]=useState('morning'); const [needSup,setNeedSup]=useState(false);
  const [counts,setCounts]=useState<Record<string,number>>({}); const [notes,setNotes]=useState('');
  const [budgetType,setBudgetType]=useState<'fixed'|'quote'>('fixed'); const [budgetFrom,setBudgetFrom]=useState(''); const [budgetTo,setBudgetTo]=useState(''); const [budgetPeriod,setBudgetPeriod]=useState<'monthly'|'total'>('monthly'); const [toast,setToast]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const isEdu=cat && ['school','kindergarten','university'].includes(cat); const isWork=cat && ['factory','company','workers'].includes(cat);
  const vehList = isWork ? VEH_L : (eduRole==='institution' ? VEH_L : VEH_S);
  const totalSeats=vehList.reduce((s,v)=> s+(counts[v.key]||0)*v.seats,0);
  const canPublish=!!cat && pickups.some(p=>p.trim()) && dests.some(d=>d.name.trim()) && days.size>0 && totalSeats>0 && (budgetType==='quote' || (budgetFrom && budgetTo && Number(budgetFrom)<=Number(budgetTo))) && (duration!=='custom' || (startDate && endDate && startDate<endDate));
  const toggleDay=(d:number)=> setDays(s=>{ const n=new Set(s); if(n.has(d)) n.delete(d); else n.add(d); return n;});
  const chg=(k:string,d:number)=> setCounts(c=> ({...c,[k]:Math.max(0,(c[k]||0)+d)}));
  const handlePublish=async()=>{
    setLoading(true);
    try{
      const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('سجل دخول');
      const vehicles=vehList.filter(v=> (counts[v.key]||0)>0).map(v=> ({type:v.key,seats:v.seats,count:counts[v.key]}));
      const roleForDB = isEdu ? eduRole : 'business';
      const payload:any={
        user_id:user.id, contract_category:cat, contract_role:roleForDB, num_people:people,
        pickup_points: pickups.filter(x=>x.trim()).map(name=>({name})), departure_time:departTime||null,
        destinations: dests.filter(d=>d.name.trim()).map(d=>({name:d.name, return_time:d.rt||null})), return_time:returnTime||null,
        drop_points: dropSame==='same'? null : drops.filter(x=>x.trim()).map(name=>({name})), days:Array.from(days),
        duration_type:duration, start_date:startDate||null, end_date:endDate||null, shift_type: isWork? shiftType:null,
        need_supervisor:needSup, vehicles, notes:notes.trim()||null, budget_type:budgetType,
        budget_from:budgetType==='fixed'?Number(budgetFrom):null, budget_to:budgetType==='fixed'?Number(budgetTo):null, budget_period:budgetPeriod,
      };
      const {error}=await supabase.from('contract_orders').insert(payload); if(error) throw error;
      showToast(budgetType==='quote'? '📩 طلب عروض':'📢 نشر عقد');
    }catch(e:any){ showToast(e.message)} finally{ setLoading(false)}
  };
  const showToast=(msg:string)=>{ setToast(msg); setTimeout(()=> setToast(null),2500); };
  return (
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
                <Pressable onPress={()=> setPeople(p=> Math.max(1,p-1))} style={s.stepBtn}><Text>−</Text></Pressable><Text style={s.stepVal}>{people}</Text><Pressable onPress={()=> setPeople(p=> Math.min(500,p+1))} style={s.stepBtn}><Text>＋</Text></Pressable>
              </View>
            </View>
          </View>
          <View style={s.card}>
            <Text style={s.h2}>📍 {isWork? 'نقطة تجمع العمال' : eduRole==='parent'? 'منازل الأطفال' : eduRole==='employee'? 'مكان السكن' : 'أحياء التجمع'}</Text>
            {pickups.map((p,i)=> <View key={i} style={{flexDirection:'row',gap:6,marginTop:6}}><TextInput value={p} onChangeText={v=> setPickups(a=> a.map((x,idx)=> idx===i? v:x))} placeholder={`مكان ${i+1}`} style={[s.input,{flex:1}]}/><Pressable onPress={()=> setPickups(a=> a.filter((_,idx)=> idx!==i))} style={s.mini}><Text>✕</Text></Pressable></View>)}
            <Pressable onPress={()=> setPickups(a=> [...a,''])} style={[s.chip,{marginTop:6,alignSelf:'flex-start'}]}><Text style={s.chipT}>＋ إضافة</Text></Pressable>
            <View style={{height:160,borderRadius:12,overflow:'hidden',marginTop:8,borderWidth:1,borderColor:'#e2e8f0'}}>
              <MapView style={{flex:1}} initialRegion={{latitude:33.5138,longitude:36.2765,latitudeDelta:0.06,longitudeDelta:0.06}}>
                <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
                <Marker coordinate={{latitude:33.5138,longitude:36.2765}} draggable onDragEnd={(e:any)=> { const c=e.nativeEvent.coordinate; setPickups(a=> { const n=[...a]; if(n[0]==='') n[0]=`${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`; return n; });}}/>
              </MapView>
            </View>
            {!isWork && <><Text style={s.label}>ساعة الانطلاق</Text><TextInput value={departTime} onChangeText={setDepartTime} placeholder="07:30" style={s.input}/></>}
          </View>
          <View style={s.card}>
            <Text style={s.h2}>🏫 الوجهات</Text>
            {dests.map((d,i)=> <View key={i} style={{flexDirection:'row',gap:6,marginTop:6}}><TextInput value={d.name} onChangeText={v=> setDests(a=> a.map((x,idx)=> idx===i? {...x,name:v}:x))} placeholder={`وجهة ${i+1}`} style={[s.input,{flex:1}]}/>{!isWork && <TextInput value={d.rt} onChangeText={v=> setDests(a=> a.map((x,idx)=> idx===i? {...x,rt:v}:x))} placeholder="عودة" style={[s.input,{width:90}]}/>}<Pressable onPress={()=> setDests(a=> a.filter((_,idx)=> idx!==i))} style={s.mini}><Text>✕</Text></Pressable></View>)}
            <Pressable onPress={()=> setDests(a=> [...a,{name:'',rt:''}])} style={[s.chip,{marginTop:6,alignSelf:'flex-start'}]}><Text style={s.chipT}>＋ وجهة</Text></Pressable>
            <View style={{height:160,borderRadius:12,overflow:'hidden',marginTop:8,borderWidth:1,borderColor:'#e2e8f0'}}>
              <MapView style={{flex:1}} initialRegion={{latitude:33.5138,longitude:36.2765,latitudeDelta:0.12,longitudeDelta:0.12}}><UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/></MapView>
            </View>
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
              {dropSame==='different' && drops.map((d,i)=> <View key={i} style={{flexDirection:'row',gap:6,marginTop:6}}><TextInput value={d} onChangeText={v=> setDrops(a=> a.map((x,idx)=> idx===i? v:x))} placeholder={`تنزيل ${i+1}`} style={[s.input,{flex:1}]}/><Pressable onPress={()=> setDrops(a=> a.filter((_,idx)=> idx!==i))} style={s.mini}><Text>✕</Text></Pressable></View>)}
              {dropSame==='different' && <Pressable onPress={()=> setDrops(a=> [...a,''])} style={[s.chip,{marginTop:6,alignSelf:'flex-start'}]}><Text style={s.chipT}>＋</Text></Pressable>}
            </View>
          )}
          <View style={s.card}>
            <Text style={s.h2}>📅 أيام الدوام</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
              {[ [6,'سبت'],[0,'أحد'],[1,'إثن'],[2,'ثلا'],[3,'أرب'],[4,'خميس'],[5,'جمعة']].map(([v,l])=> <Pressable key={v} onPress={()=> toggleDay(v as number)} style={[s.day, days.has(v as number)&&s.dayActive]}><Text style={[s.dayT, days.has(v as number)&&s.dayTActive]}>{l as string}</Text></Pressable>)}
            </View>
          </View>
          <View style={s.card}>
            <Text style={s.h2}>⏳ مدة التعاقد</Text>
            <View style={s.row}>
              {[ ['month','شهر'],['semester','فصل'],['year','عام'],['custom','مخصص']].map(([k,l])=> <Pressable key={k} onPress={()=> setDuration(k)} style={[s.chipSmall, duration===k&&s.chipActive]}><Text style={[s.chipT, duration===k&&s.chipTActive]}>{l}</Text></Pressable>)}
            </View>
            {duration==='custom' && <View style={{flexDirection:'row',gap:8,marginTop:8}}><TextInput value={startDate} onChangeText={setStartDate} placeholder="من" style={[s.input,{flex:1}]}/><TextInput value={endDate} onChangeText={setEndDate} placeholder="إلى" style={[s.input,{flex:1}]}/></View>}
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
          <View style={[s.card,{borderWidth:2,borderColor:'#4F46E5'}]}>
            <Text style={s.h2}>💰 الميزانية</Text>
            <View style={s.row}>
              <Pressable onPress={()=> setBudgetType('fixed')} style={[s.chip, budgetType==='fixed'&&s.chipActive]}><Text style={[s.chipT, budgetType==='fixed'&&s.chipTActive]}>💰 تحديد</Text></Pressable>
              <Pressable onPress={()=> setBudgetType('quote')} style={[s.chip, budgetType==='quote'&&s.chipActive]}><Text style={[s.chipT, budgetType==='quote'&&s.chipTActive]}>📩 عروض</Text></Pressable>
              <Pressable onPress={()=> setBudgetPeriod('monthly')} style={[s.chipSmall, budgetPeriod==='monthly'&&s.chipActive]}><Text style={[s.chipT, budgetPeriod==='monthly'&&s.chipTActive]}>شهري</Text></Pressable>
              <Pressable onPress={()=> setBudgetPeriod('total')} style={[s.chipSmall, budgetPeriod==='total'&&s.chipActive]}><Text style={[s.chipT, budgetPeriod==='total'&&s.chipTActive]}>إجمالي</Text></Pressable>
            </View>
            {budgetType==='fixed' ? <View style={{flexDirection:'row',gap:8,marginTop:8}}><TextInput value={budgetFrom} onChangeText={setBudgetFrom} placeholder="من" keyboardType="numeric" style={[s.input,{flex:1}]}/><Text style={{alignSelf:'center'}}>—</Text><TextInput value={budgetTo} onChangeText={setBudgetTo} placeholder="إلى" keyboardType="numeric" style={[s.input,{flex:1}]}/></View> : <View style={s.quoteBox}><Text style={{fontWeight:'900'}}>📩 طلب عروض</Text></View>}
          </View>
          <Pressable onPress={handlePublish} disabled={!canPublish || loading} style={[s.publish, (!canPublish||loading)&&{backgroundColor:'#cbd5e1'}]}><Text style={s.publishT}>{loading? 'جاري...': budgetType==='quote'? '📩 طلب عروض':'📢 نشر العقد'}</Text></Pressable>
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
const s=StyleSheet.create({
  page:{flex:1,backgroundColor:'#f8fafc'},h1:{fontSize:18,fontWeight:'900',textAlign:'center',marginTop:8},sub:{fontSize:12,color:'#64748b',textAlign:'center',marginBottom:8},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e2e8f0',borderRadius:16,padding:12,marginBottom:12},h2:{fontSize:14,fontWeight:'900',marginBottom:6},
  row:{flexDirection:'row',flexWrap:'wrap',gap:8},stepRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  cat:{flexBasis:'30%',flexGrow:1,borderWidth:1.5,borderColor:'#e2e8f0',borderRadius:14,padding:10,alignItems:'center',backgroundColor:'#fff'},catActive:{borderColor:'#4F46E5',backgroundColor:'#eef2ff'},catT:{fontSize:12,fontWeight:'800',marginTop:4},catTActive:{color:'#4F46E5'},
  chip:{paddingHorizontal:12,paddingVertical:8,borderRadius:999,borderWidth:1.5,borderColor:'#e2e8f0',backgroundColor:'#fff'},chipSmall:{paddingHorizontal:10,paddingVertical:6,borderRadius:999,borderWidth:1.5,borderColor:'#e2e8f0',backgroundColor:'#fff'},chipActive:{backgroundColor:'#4F46E5',borderColor:'#4F46E5'},chipT:{fontSize:13,fontWeight:'800'},chipTActive:{color:'#fff'},
  input:{borderWidth:1.5,borderColor:'#e2e8f0',borderRadius:12,height:44,paddingHorizontal:12,backgroundColor:'#fff',marginTop:4},label:{fontSize:12,fontWeight:'800',marginTop:8},
  stepper:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#f1f5f9',borderRadius:999,padding:4},stepBtn:{width:32,height:32,borderRadius:999,borderWidth:1,borderColor:'#e2e8f0',backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},stepVal:{minWidth:20,textAlign:'center',fontWeight:'900'},
  mini:{paddingHorizontal:10,height:44,borderRadius:12,borderWidth:1,borderColor:'#e2e8f0',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},
  veh:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:'#e2e8f0',borderRadius:12,padding:10,marginTop:8},
  total:{borderRadius:12,padding:10,marginTop:8,borderWidth:1},totalOk:{backgroundColor:'#f0fdf4',borderColor:'#a7f3d0'},totalWarn:{backgroundColor:'#fef2f2',borderColor:'#fecaca'},
  quoteBox:{backgroundColor:'#f0fdf4',borderWidth:1,borderColor:'#a7f3d0',borderRadius:12,padding:10,alignItems:'center',marginTop:8},
  publish:{backgroundColor:'#4F46E5',height:48,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:4},publishT:{color:'#fff',fontWeight:'900',fontSize:15},
  day:{width:44,height:36,borderRadius:999,borderWidth:1.5,borderColor:'#e2e8f0',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},dayActive:{backgroundColor:'#4F46E5',borderColor:'#4F46E5'},dayT:{fontSize:11,fontWeight:'800'},dayTActive:{color:'#fff'},
});
