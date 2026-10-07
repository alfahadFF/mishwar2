import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { VGROUPS, VCLASS, vehicleFits, VehicleClass } from '../utils/vehicles';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { guestBlocked } from '../utils/guest';
import PointPicker from '../components/PointPicker';
import PointRow from '../components/PointRow';
import TripRouteMap from '../components/TripRouteMap';

export default function TransportScreen(){
  const router=useRouter();
  const [cargoType,setCargoType]=useState('');
  const [vehicle,setVehicle]=useState<VehicleClass|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  const [weight,setWeight]=useState('');
  const [pickPoints,setPickPoints]=useState([{lat:null as number|null,lng:null as number|null,label:'',detail:''}]);
  const [dropPoints,setDropPoints]=useState([{lat:null as number|null,lng:null as number|null,label:'',detail:''}]);
  const [picker,setPicker]=useState<{title:string,color:string,initial:number[]|null,apply:(ll:number[],label:string)=>void}|null>(null);
  const [routeInfo,setRouteInfo]=useState<any>(null);
  const [needWorkers,setNeedWorkers]=useState(false);
  const [workersCount,setWorkersCount]=useState('2');
  const [needEquip,setNeedEquip]=useState(false);
  const [equipDetail,setEquipDetail]=useState('');
  const [liftUp,setLiftUp]=useState(false);
  const [floorTo,setFloorTo]=useState('');
  const [elevTo,setElevTo]=useState('');
  const [liftDown,setLiftDown]=useState(false);
  const [floorFrom,setFloorFrom]=useState('');
  const [elevFrom,setElevFrom]=useState('');
  const [floorNote,setFloorNote]=useState('');
  const [timing,setTiming]=useState<'urgent'|'scheduled'>('urgent');
  const [schedDate,setSchedDate]=useState('');
  const [schedTime,setSchedTime]=useState('');
  const [budgetType,setBudgetType]=useState<'fixed'|'quote'>('fixed');
  const [budgetFrom,setBudgetFrom]=useState('10');
  const [budgetTo,setBudgetTo]=useState('50');
  const [submitting,setSubmitting]=useState(false);

  const addPick=()=>setPickPoints([...pickPoints,{lat:null,lng:null,label:'',detail:''}]);
  const addDrop=()=>setDropPoints([...dropPoints,{lat:null,lng:null,label:'',detail:''}]);
  const P=pickPoints.filter(p=>p.lat!=null).map(p=>[p.lat!,p.lng!]), Dp=dropPoints.filter(p=>p.lat!=null).map(p=>[p.lat!,p.lng!]);
  const segments= P.length && Dp.length ? [{key:'route', name:'المسافة الفعلية على الطريق', icon:'🛣️', color:'#4F46E5', pts:[...P,...Dp]}] : [];
  const markers=[...pickPoints.flatMap((p,i)=> p.lat!=null? [{ll:[p.lat,p.lng!], txt:'A'+(i+1), color:'green'}]:[]), ...dropPoints.flatMap((p,i)=> p.lat!=null? [{ll:[p.lat,p.lng!], txt:'B'+(i+1), color:'red'}]:[])];

  const canPublish = cargoType.trim().length>0 && !!vehicle && pickPoints.some(p=>p.lat!=null) && dropPoints.some(p=>p.lat!=null) && (budgetType==='quote' || (parseFloat(budgetFrom)>0 && parseFloat(budgetTo)>parseFloat(budgetFrom)));

  const handlePublish=async()=>{
    if(!canPublish) return;
    setSubmitting(true);
    try{
      const { data:{user} } = await supabase.auth.getUser();
      if(!user){ guestBlocked(); return; }
      const payload:any={
        customer_id: user.id,
        client_id: user.id,
        cargo_type: cargoType,
        vehicle_class: vehicle,
        weight: weight || null,
        weight_kg: weight ? parseFloat(weight) || null : null,
        pickup_points: pickPoints,
        delivery_points: dropPoints,
        dropoff_points: dropPoints,
        route_info: routeInfo, // معلومة فقط — لا تدخل في السعر
        timing_type: timing,
        scheduled_date: timing==='scheduled' ? schedDate || null : null,
        scheduled_time: timing==='scheduled' ? schedTime || null : null,
        budget_type: budgetType,
        budget_from: budgetType==='fixed' ? parseFloat(budgetFrom) : null,
        budget_to: budgetType==='fixed' ? parseFloat(budgetTo) : null,
        client_budget_usd: budgetType==='fixed' ? parseFloat(budgetTo) : 0,
        is_urgent: timing==='urgent',
        need_workers: needWorkers,
        workers_count: needWorkers ? parseInt(workersCount) : null,
        need_equipment: needEquip,
        equipment_detail: needEquip ? equipDetail : null,
        lift_up: liftUp,
        floor_to: liftUp ? parseInt(floorTo) : null,
        elevator_to: liftUp ? elevTo || null : null,
        lift_down: liftDown,
        floor_from: liftDown ? parseInt(floorFrom) : null,
        elevator_from: liftDown ? elevFrom || null : null,
        floor_note: floorNote || null,
        notes: equipDetail || floorNote || null,
      };
      const { error } = await supabase.from('cargo_orders').insert(payload);
      if(error) throw error;
      showToast('تم نشر الطلب'); setTimeout(()=> router.replace('/my-orders?tab=cargo' as any), 1200);
    }catch(e:any){
      showToast('تعذر نشر الطلب، حاول مرة أخرى');
    }finally{ setSubmitting(false); }
  };

  const showToast=(msg:string)=>{ setToast(msg); setTimeout(()=> setToast(null),2500); };
  return (
    <View style={s.container}>
      <View style={s.topbar}>
        <Pressable onPress={()=>router.back()} style={s.back}><Text>→</Text></Pressable>
        <View><Text style={s.title}>طلب نقل جديد</Text><Text style={s.sub}>خدمة نقل احترافية</Text></View>
        <View style={s.badge}><Text style={s.badgeText}>🚚 نقل</Text></View>
      </View>
      <ScrollView contentContainerStyle={{padding:12,gap:12}}>
        <View style={s.card}>
          <Text style={s.cardTitle}>📦 نوع الحمولة</Text>
          <View style={s.chips}>
            {['مفروشات','مواد تموينية','أجهزة كهربائية','مواد بناء','أخرى'].map(t=>(
              <Pressable key={t} onPress={()=>setCargoType(t)} style={[s.chip, cargoType===t&&s.chipActive]}><Text style={cargoType===t?s.chipTextActive:s.chipText}>{t}</Text></Pressable>
            ))}
          </View>
          <TextInput value={cargoType} onChangeText={setCargoType} placeholder="مثال: مفروشات..." style={s.input} />
          <Text style={s.label}>الوزن التقريبي <Text style={s.opt}>غير إلزامي</Text></Text>
          <TextInput value={weight} onChangeText={setWeight} placeholder="500 كغ، 2 طن..." style={s.input} />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>🚚 المركبة المطلوبة</Text>
          {VGROUPS.map(g=>(
            <View key={g.g} style={{marginTop:8}}>
              <Text style={s.vGroupT}>{g.icon} {g.name}</Text>
              <View style={s.chips}>
                {VCLASS.filter(v=>v.g===g.g).map(v=>(
                  <Pressable key={v.k} onPress={()=>setVehicle(v.k)} style={[s.vChip, vehicle===v.k&&s.vChipActive]}>
                    <Text style={vehicle===v.k? s.chipTextActive : s.chipText}>{v.short}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {vehicle && (
            <View style={s.vNote}><Text style={s.vNoteT}>
              {(()=>{ const fit=VCLASS.filter(x=>vehicleFits(vehicle,x.k)); return fit.length>1? `يصل طلبك لأصحاب: ${fit.map(x=>x.short).join('، ')}` : `يصل طلبك لأصحاب فئة ${fit[0]?.short}`; })()}
            </Text></View>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>📍 نقاط الاستلام ({pickPoints.length})</Text>
          {pickPoints.map((p,i)=>(
            <View key={i} style={[s.locCard,{backgroundColor:'#F0FDF4',borderColor:'#A7F3D0'}]}>
              <Text style={s.locTitle}>A{i+1} نقطة استلام {i+1}</Text>
              <PointRow badge={'A'+(i+1)} color="#16a34a" title={'موقع الاستلام '+(i+1)} label={p.label} set={p.lat!=null}
                onPick={()=> setPicker({title:'نقطة استلام '+(i+1), color:'green', initial:p.lat!=null?[p.lat,p.lng!]:null, apply:(ll:number[],label:string)=>{ const a=[...pickPoints]; a[i]={...a[i],lat:ll[0],lng:ll[1],label}; setPickPoints(a); }})}/>
              <TextInput value={p.detail} onChangeText={t=>{const a=[...pickPoints];a[i].detail=t;setPickPoints(a)}} placeholder="تفاصيل هذه النقطة: غرفة نوم، خزانة..." style={[s.input,{height:60}]} multiline />
              {pickPoints.length>1 && <Pressable onPress={()=>setPickPoints(pickPoints.filter((_,j)=>j!==i))}><Text style={{color:'#DC2626',textAlign:'center',marginTop:6}}>✕ حذف</Text></Pressable>}
            </View>
          ))}
          <Pressable onPress={addPick} style={s.addBtn}><Text style={s.addText}>+ إضافة نقطة استلام</Text></Pressable>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>🏁 نقاط التسليم ({dropPoints.length})</Text>
          {dropPoints.map((p,i)=>(
            <View key={i} style={[s.locCard,{backgroundColor:'#FEF2F2',borderColor:'#FECACA'}]}>
              <Text style={s.locTitle}>B{i+1} نقطة تسليم {i+1}</Text>
              <PointRow badge={'B'+(i+1)} color="#dc2626" title={'موقع التسليم '+(i+1)} label={p.label} set={p.lat!=null}
                onPick={()=> setPicker({title:'نقطة تسليم '+(i+1), color:'red', initial:p.lat!=null?[p.lat,p.lng!]:null, apply:(ll:number[],label:string)=>{ const a=[...dropPoints]; a[i]={...a[i],lat:ll[0],lng:ll[1],label}; setDropPoints(a); }})}/>
              <TextInput value={p.detail} onChangeText={t=>{const a=[...dropPoints];a[i].detail=t;setDropPoints(a)}} placeholder="تفاصيل التسليم..." style={s.input} />
              {dropPoints.length>1 && <Pressable onPress={()=>setDropPoints(dropPoints.filter((_,j)=>j!==i))}><Text style={{color:'#DC2626',textAlign:'center',marginTop:6}}>✕ حذف</Text></Pressable>}
            </View>
          ))}
          <Pressable onPress={addDrop} style={[s.addBtn,{backgroundColor:'#FEF2F2',borderColor:'#FCA5A5'}]}><Text style={[s.addText,{color:'#DC2626'}]}>+ إضافة نقطة تسليم</Text></Pressable>
        </View>

        {segments.length>0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🛣️ مسار النقل</Text>
            <TripRouteMap segments={segments} markers={markers} onResult={setRouteInfo}/>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.cardTitle}>👷 العمال</Text>
          <View style={s.chips}>
            <Pressable onPress={()=>setNeedWorkers(false)} style={[s.chip, !needWorkers&&s.chipActive]}><Text style={!needWorkers?s.chipTextActive:s.chipText}>بدون عمال</Text></Pressable>
            <Pressable onPress={()=>setNeedWorkers(true)} style={[s.chip, needWorkers&&s.chipActive]}><Text style={needWorkers?s.chipTextActive:s.chipText}>مع عمال 👷</Text></Pressable>
          </View>
          {needWorkers && <View style={{flexDirection:'row',alignItems:'center',gap:10,marginTop:10}}><Pressable onPress={()=>setWorkersCount(String(Math.max(1,parseInt(workersCount||'2')-1)))} style={s.stepBtn}><Text style={s.stepText}>−</Text></Pressable><TextInput value={workersCount} onChangeText={setWorkersCount} keyboardType="numeric" style={[s.input,{flex:1,textAlign:'center',fontWeight:'900'}]} /><Pressable onPress={()=>setWorkersCount(String(Math.min(20,parseInt(workersCount||'2')+1)))} style={[s.stepBtn,{backgroundColor:'#4F46E5',borderColor:'#4F46E5'}]}><Text style={[s.stepText,{color:'#fff'}]}>+</Text></Pressable></View>}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>🔧 المعدات</Text>
          <View style={s.chips}>
            <Pressable onPress={()=>setNeedEquip(false)} style={[s.chip, !needEquip&&s.chipActive]}><Text style={!needEquip?s.chipTextActive:s.chipText}>بدون معدات</Text></Pressable>
            <Pressable onPress={()=>setNeedEquip(true)} style={[s.chip, needEquip&&s.chipActive]}><Text style={needEquip?s.chipTextActive:s.chipText}>مع معدات 🔧</Text></Pressable>
          </View>
          {needEquip && <TextInput value={equipDetail} onChangeText={setEquipDetail} placeholder="مثال: رافعة صغيرة، عربة نقل..." style={[s.input,{height:70}]} multiline />}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>🏢 التوصيل والطوابق</Text>
          <Pressable onPress={()=>setLiftUp(!liftUp)} style={[s.checkRow,{backgroundColor: liftUp?'#FFFBEB':'#fff',borderColor: liftUp?'#FDE68A':'#E5E7EB'}]}><Text style={s.checkBox}>{liftUp?'☑':'☐'}</Text><Text style={s.checkText}>⬆️ رفع إلى طابق معين</Text></Pressable>
          {liftUp && <View style={s.floorBox}><TextInput value={floorTo} onChangeText={setFloorTo} placeholder="إلى طابق رقم" keyboardType="numeric" style={s.input} /><TextInput value={elevTo} onChangeText={setElevTo} placeholder="المصعد: يوجد/لا يوجد/صغير" style={s.input} /></View>}
          <Pressable onPress={()=>setLiftDown(!liftDown)} style={[s.checkRow,{backgroundColor: liftDown?'#FEF2F2':'#fff',borderColor: liftDown?'#FECACA':'#E5E7EB',marginTop:8}]}><Text style={s.checkBox}>{liftDown?'☑':'☐'}</Text><Text style={s.checkText}>⬇️ تنزيل من طابق معين</Text></Pressable>
          {liftDown && <View style={s.floorBox}><TextInput value={floorFrom} onChangeText={setFloorFrom} placeholder="من طابق رقم" keyboardType="numeric" style={s.input} /><TextInput value={elevFrom} onChangeText={setElevFrom} placeholder="المصعد: يوجد/لا يوجد/صغير" style={s.input} /></View>}
          <TextInput value={floorNote} onChangeText={setFloorNote} placeholder="ملاحظات الطوابق (اختياري)" style={s.input} />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>⏰ التوقيت</Text>
          <View style={{flexDirection:'row',gap:10}}>
            <Pressable onPress={()=>setTiming('urgent')} style={[s.timeOpt, timing==='urgent'&&s.timeActive]}><Text style={s.timeB}>⚡ مستعجل</Text><Text style={s.timeS}>أسرع سائق</Text></Pressable>
            <Pressable onPress={()=>setTiming('scheduled')} style={[s.timeOpt, timing==='scheduled'&&s.timeActive]}><Text style={s.timeB}>📅 موعد محدد</Text><Text style={s.timeS}>اختر تاريخ</Text></Pressable>
          </View>
          {timing==='scheduled' && <View style={{flexDirection:'row',gap:8,marginTop:10}}><TextInput value={schedDate} onChangeText={setSchedDate} placeholder="التاريخ YYYY-MM-DD" style={[s.input,{flex:1}]} /><TextInput value={schedTime} onChangeText={setSchedTime} placeholder="الساعة HH:MM" style={[s.input,{flex:1}]} /></View>}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>💰 الميزانية</Text>
          <View style={s.chips}>
            <Pressable onPress={()=>setBudgetType('fixed')} style={[s.chip, budgetType==='fixed'&&s.chipActive]}><Text style={budgetType==='fixed'?s.chipTextActive:s.chipText}>💰 تحديد ميزانية</Text></Pressable>
            <Pressable onPress={()=>setBudgetType('quote')} style={[s.chip, budgetType==='quote'&&s.chipActive]}><Text style={budgetType==='quote'?s.chipTextActive:s.chipText}>📩 طلب عروض أسعار</Text></Pressable>
          </View>
          {budgetType==='fixed' ? (
            <><View style={{flexDirection:'row',gap:8,alignItems:'center',marginTop:10}}><TextInput value={budgetFrom} onChangeText={setBudgetFrom} keyboardType="numeric" style={[s.input,{flex:1,textAlign:'center'}]} placeholder="من" /><Text>—</Text><TextInput value={budgetTo} onChangeText={setBudgetTo} keyboardType="numeric" style={[s.input,{flex:1,textAlign:'center'}]} placeholder="إلى" /></View><Text style={{textAlign:'center',fontSize:11,color:'#6B7280',marginTop:6}}>${budgetFrom} — ${budgetTo} • متوسط ${((parseFloat(budgetFrom)||0)+(parseFloat(budgetTo)||0))/2}</Text></>
          ) : (
            <View style={{backgroundColor:'#F0FDF4',borderWidth:1,borderColor:'#A7F3D0',borderRadius:12,padding:12,marginTop:10,alignItems:'center'}}><Text style={{fontWeight:'800',color:'#065F46'}}>📩 سيقوم السائقون بتقديم عروض أسعار</Text><Text style={{fontSize:11,color:'#047857',textAlign:'center',marginTop:4}}>ستظهر العروض لديك وتختار الأنسب</Text></View>
          )}
        </View>

        <View style={{height:80}} />
      
      <PointPicker visible={!!picker} title={picker?.title||''} color={picker?.color} initial={picker?.initial}
        onClose={()=> setPicker(null)} onConfirm={(ll,label)=>{ picker?.apply(ll,label); setPicker(null); }}/>
      {toast && (
        <View style={{position:'absolute', bottom:20, alignSelf:'center', backgroundColor:'#065f46', paddingHorizontal:20, paddingVertical:12, borderRadius:999, shadowColor:'#000', shadowOpacity:0.2, shadowRadius:8, elevation:5}}>
          <Text style={{color:'#fff', fontWeight:'900', fontSize:13, textAlign:'center'}}>{toast}</Text>
        </View>
      )}
    </ScrollView>
      <View style={s.cta}>
        <Pressable onPress={handlePublish} disabled={!canPublish || submitting} style={[s.publishBtn, (!canPublish||submitting)&&{opacity:0.4}]}><Text style={s.publishText}>{budgetType==='fixed' ? '📢 نشر الطلب' : '📩 طلب عروض أسعار'}</Text></Pressable>
        <Text style={s.note}>التسجيل مطلوب لنشر الطلب</Text>
      </View>
    </View>
  );
}
const s=StyleSheet.create({
  container:{flex:1,backgroundColor:'#F8F9FA'},
  topbar:{height:52,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#F3F4F6'},
  back:{width:36,height:36,borderRadius:10,backgroundColor:'#F3F4F6',alignItems:'center',justifyContent:'center'},
  title:{fontWeight:'800',fontSize:14,color:'#1A1A2E'},
  sub:{fontSize:11,color:'#6B7280'},
  badge:{marginLeft:'auto',backgroundColor:'#EEF2FF',borderWidth:1,borderColor:'#C7D2FE',paddingHorizontal:10,paddingVertical:6,borderRadius:999},
  badgeText:{fontWeight:'800',fontSize:11,color:'#4338CA'},
  card:{backgroundColor:'#fff',borderRadius:16,padding:14,borderWidth:1,borderColor:'#E5E7EB'},
  cardTitle:{fontWeight:'800',fontSize:13,marginBottom:10},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
  vGroupT:{fontSize:11,fontWeight:'800',color:'#475569',marginBottom:6},
  vChip:{paddingHorizontal:12,paddingVertical:9,borderRadius:12,borderWidth:1.5,borderColor:'#E5E7EB',backgroundColor:'#fff',minWidth:70,alignItems:'center'},
  vChipActive:{backgroundColor:'#0f766e',borderColor:'#0f766e'},
  vNote:{marginTop:10,backgroundColor:'#f0fdfa',borderWidth:1,borderColor:'#99f6e4',borderRadius:10,padding:8},
  vNoteT:{fontSize:11,fontWeight:'700',color:'#115e59'},
  chip:{paddingHorizontal:12,paddingVertical:8,borderRadius:999,borderWidth:1.5,borderColor:'#E5E7EB',backgroundColor:'#fff'},
  chipActive:{backgroundColor:'#4F46E5',borderColor:'#4F46E5'},
  chipText:{fontSize:12,fontWeight:'700',color:'#1A1A2E'},
  chipTextActive:{fontSize:12,fontWeight:'700',color:'#fff'},
  input:{borderWidth:1.5,borderColor:'#E5E7EB',borderRadius:12,padding:12,fontSize:13,backgroundColor:'#fff',marginTop:6},
  label:{fontSize:11,fontWeight:'800',color:'#374151',marginTop:10},
  opt:{fontWeight:'600',color:'#9CA3AF',fontSize:10,backgroundColor:'#F3F4F6',paddingHorizontal:6,paddingVertical:2,borderRadius:999},
  locCard:{borderWidth:1.5,borderRadius:14,padding:12,marginBottom:10},
  locTitle:{fontWeight:'800',fontSize:12,marginBottom:8},
  mapPlaceholder:{height:100,borderRadius:10,backgroundColor:'#E5E7EB',alignItems:'center',justifyContent:'center',marginBottom:8,borderWidth:1,borderColor:'#E5E7EB'},
  mapPlaceholderText:{fontSize:11,color:'#6B7280',fontWeight:'700'},
  centerPin:{position:'absolute',top:'50%',left:'50%',marginLeft:-18,marginTop:-18,width:36,height:36,alignItems:'center',justifyContent:'center'},
  pinHead:{width:36,height:36,backgroundColor:'#4F46E5',borderWidth:3,borderColor:'#fff',borderRadius:18,alignItems:'center',justifyContent:'center',transform:[{rotate:'-45deg'}]},
  addBtn:{height:42,borderRadius:12,borderWidth:1.5,borderStyle:'dashed',borderColor:'#818CF8',backgroundColor:'#EEF2FF',alignItems:'center',justifyContent:'center'},
  addText:{color:'#4F46E5',fontWeight:'800',fontSize:12},
  stepBtn:{width:44,height:44,borderRadius:12,borderWidth:1.5,borderColor:'#E5E7EB',backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},
  stepText:{fontWeight:'900',fontSize:18},
  checkRow:{flexDirection:'row',alignItems:'center',gap:8,borderWidth:1.5,borderRadius:12,padding:12},
  checkBox:{fontSize:18},
  checkText:{fontWeight:'800',fontSize:12},
  floorBox:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,padding:10,marginTop:6,gap:6},
  timeOpt:{flex:1,borderWidth:1.5,borderColor:'#E5E7EB',borderRadius:12,padding:12,alignItems:'center',backgroundColor:'#fff'},
  timeActive:{borderColor:'#F59E0B',backgroundColor:'#FFFBEB'},
  timeB:{fontWeight:'800',fontSize:12},
  timeS:{fontSize:11,color:'#6B7280'},
  cta:{backgroundColor:'#fff',padding:12,borderTopWidth:1,borderTopColor:'#E5E7EB'},
  publishBtn:{height:54,borderRadius:14,backgroundColor:'#4F46E5',alignItems:'center',justifyContent:'center'},
  publishText:{color:'#fff',fontWeight:'900',fontSize:15},
  note:{fontSize:10,color:'#6B7280',textAlign:'center',marginTop:6}
});
