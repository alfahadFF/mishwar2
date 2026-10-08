import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import * as Location from 'expo-location';
import { placeName } from '../utils/geocode';
import { MapView, UrlTile, Marker } from './OpenMapView';

export type PickedPoint={ ll:number[]|null; label:string };
type Props={ visible:boolean; title:string; color?:string; initial?:number[]|null; onClose:()=>void; onConfirm:(ll:number[], label:string)=>void };

// يبدأ الاختيار من النقطة الحالية/الممررة، ولا يضع المستخدم على دمشق افتراضياً.
export default function PointPicker({visible,title,color='#4F46E5',initial,onClose,onConfirm}:Props){
  const [ll,setLl]=useState<number[]|null>(null);
  const [center,setCenter]=useState<number[]|null>(null);
  const [label,setLabel]=useState('');
  const [loading,setLoading]=useState(false);
  const [locating,setLocating]=useState(false);
  const [locationError,setLocationError]=useState(false);
  const mapRef=useRef<any>(null); const req=useRef(0); const centerReq=useRef(0);

  const resolve=async(p:number[])=>{
    const my=++req.current; setLoading(true);
    const n=await placeName(p); if(my!==req.current) return;
    setLabel(n); setLoading(false);
  };
  const setPoint=(p:number[])=>{ setLl(p); resolve(p); };
  const animateTo=(p:number[],delta=0.02)=>mapRef.current?.animateToRegion?.({latitude:p[0],longitude:p[1],latitudeDelta:delta,longitudeDelta:delta});

  const locate=async(selectPoint=false)=>{
    const my=++centerReq.current;
    setLocating(true); setLocationError(false);
    try{
      const { status }=await Location.requestForegroundPermissionsAsync();
      if(status!=='granted') throw new Error('LOCATION_PERMISSION');
      const last=await Location.getLastKnownPositionAsync({maxAge:60_000,requiredAccuracy:1500}).catch(()=>null);
      if(last && my===centerReq.current){
        const p=[last.coords.latitude,last.coords.longitude];
        setCenter(p); animateTo(p);
        if(selectPoint) setPoint(p);
      }
      const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      if(my!==centerReq.current) return;
      const p=[pos.coords.latitude,pos.coords.longitude];
      setCenter(p); animateTo(p);
      if(selectPoint) setPoint(p);
    }catch{
      if(my===centerReq.current) setLocationError(true);
    }finally{
      if(my===centerReq.current) setLocating(false);
    }
  };

  useEffect(()=>{
    if(!visible){ centerReq.current++; req.current++; return; }
    setLl(initial||null); setLabel(''); setLocationError(false);
    if(initial && initial.length>=2 && initial.every(Number.isFinite)){
      setCenter(initial); animateTo(initial,0.01); resolve(initial);
    }else{
      setCenter(null); setLoading(false); void locate(false);
    }
    return ()=>{ centerReq.current++; req.current++; };
  },[visible,initial?.[0],initial?.[1]]);

  const region=center?{latitude:center[0],longitude:center[1],latitudeDelta:initial?0.01:0.02,longitudeDelta:initial?0.01:0.02}:undefined;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
        <View style={s.head}><Text style={s.title}>{title}</Text><Pressable onPress={onClose} style={s.close}><Text>✕</Text></Pressable></View>
        <View style={{flex:1}}>
          {center && region ? (
            <>
              <MapView ref={mapRef} style={{flex:1}} initialRegion={region}
                onPress={(e:any)=>{ const c=e.nativeEvent.coordinate; setPoint([c.latitude,c.longitude]); }}>
                <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
                {ll && <Marker coordinate={{latitude:ll[0], longitude:ll[1]}} pinColor={color}/>}
              </MapView>
              <View style={s.hint}><Text style={s.hintT}>اضغط على الخريطة لتحديد الموقع</Text></View>
              <Pressable onPress={()=>locate(true)} disabled={locating} style={s.my}><Text style={{fontWeight:'800', fontSize:12}}>{locating?'⏳ جارٍ تحديد الموقع':'🎯 موقعي'}</Text></Pressable>
              {locationError && <View style={s.locationWarn}><Text style={s.locationWarnT}>تعذر تحديث الموقع؛ يمكنك استخدام آخر نقطة ظاهرة أو إعادة المحاولة.</Text></View>}
            </>
          ) : (
            <View style={s.locationGate}>
              <Text style={s.locationIcon}>{locating?'📡':'📍'}</Text>
              <Text style={s.locationGateT}>{locating?'جارٍ تحديد موقعك لفتح الخريطة بالقرب منك':'تعذر تحديد موقعك؛ فعّل إذن الموقع ثم أعد المحاولة'}</Text>
              {!locating && <Pressable onPress={()=>locate(false)} style={s.retry}><Text style={s.retryT}>إعادة تحديد موقعي</Text></Pressable>}
            </View>
          )}
        </View>
        <View style={s.bar}>
          <Text style={[s.label, !ll && {color:'#94a3b8'}]} numberOfLines={2}>{!ll? 'لم يتم تحديد موقع بعد' : loading? '⏳ جاري تحديد اسم المكان...' : '📍 '+label}</Text>
          <Pressable disabled={!ll || loading} onPress={()=> ll && onConfirm(ll, label||'موقع محدد على الخريطة')} style={[s.confirm, (!ll||loading) && {backgroundColor:'#cbd5e1'}]}>
            <Text style={s.confirmT}>تأكيد الموقع</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
const s=StyleSheet.create({
  head:{flexDirection:'row-reverse', justifyContent:'space-between', alignItems:'center', padding:12, borderBottomWidth:1, borderColor:'#e2e8f0'},
  title:{fontSize:15, fontWeight:'900'},
  close:{width:34, height:34, borderRadius:10, borderWidth:1, borderColor:'#e2e8f0', alignItems:'center', justifyContent:'center'},
  hint:{position:'absolute', top:10, alignSelf:'center', backgroundColor:'rgba(15,23,42,.85)', paddingHorizontal:12, paddingVertical:6, borderRadius:999},
  hintT:{color:'#fff', fontSize:11, fontWeight:'800'},
  my:{position:'absolute', bottom:12, left:12, minHeight:40, paddingHorizontal:12, borderRadius:12, backgroundColor:'#fff', borderWidth:1, borderColor:'#e2e8f0', justifyContent:'center'},
  bar:{padding:14, borderTopWidth:1, borderColor:'#e2e8f0'},
  label:{fontSize:13, fontWeight:'800', textAlign:'right', minHeight:20},
  confirm:{height:46, borderRadius:12, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center', marginTop:10},
  confirmT:{color:'#fff', fontWeight:'900', fontSize:14},
  locationGate:{flex:1, alignItems:'center', justifyContent:'center', padding:28, gap:12, backgroundColor:'#f8fafc'},
  locationIcon:{fontSize:38},
  locationGateT:{fontSize:14, lineHeight:22, fontWeight:'800', color:'#334155', textAlign:'center'},
  retry:{height:44, paddingHorizontal:20, borderRadius:12, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center', marginTop:4},
  retryT:{color:'#fff', fontWeight:'900'},
  locationWarn:{position:'absolute',top:48,alignSelf:'center',backgroundColor:'#fff7ed',borderWidth:1,borderColor:'#fed7aa',borderRadius:10,padding:8,marginHorizontal:14},
  locationWarnT:{fontSize:11,color:'#9a3412',fontWeight:'700',textAlign:'center'},
});
