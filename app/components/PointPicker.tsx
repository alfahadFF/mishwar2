import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import * as Location from 'expo-location';
import { placeName } from '../utils/geocode';
import { MapView, UrlTile, Marker } from './OpenMapView';

export type PickedPoint={ ll:number[]|null; label:string };
type Props={ visible:boolean; title:string; color?:string; initial?:number[]|null; onClose:()=>void; onConfirm:(ll:number[], label:string)=>void };
const CENTER=[33.5138,36.2765];

// نافذة كاملة: الضغط على الخريطة يحدد النقطة ويظهر اسم المكان تلقائياً
export default function PointPicker({visible,title,color='#4F46E5',initial,onClose,onConfirm}:Props){
  const [ll,setLl]=useState<number[]|null>(null);
  const [label,setLabel]=useState('');
  const [loading,setLoading]=useState(false);
  const mapRef=useRef<any>(null); const req=useRef(0);
  useEffect(()=>{ if(visible){ setLl(initial||null); setLabel(''); if(initial) resolve(initial); } },[visible]);
  const resolve=async(p:number[])=>{
    const my=++req.current; setLoading(true);
    const n=await placeName(p); if(my!==req.current) return;
    setLabel(n); setLoading(false);
  };
  const setPoint=(p:number[])=>{ setLl(p); resolve(p); };
  const myLocation=async()=>{
    const { status }=await Location.requestForegroundPermissionsAsync(); if(status!=='granted') return;
    const loc=await Location.getCurrentPositionAsync({}); const p=[loc.coords.latitude, loc.coords.longitude];
    setPoint(p); mapRef.current?.animateToRegion?.({latitude:p[0], longitude:p[1], latitudeDelta:0.01, longitudeDelta:0.01});
  };
  const start=initial||CENTER;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
        <View style={s.head}><Text style={s.title}>{title}</Text><Pressable onPress={onClose} style={s.close}><Text>✕</Text></Pressable></View>
        <View style={{flex:1}}>
          <MapView ref={mapRef} style={{flex:1}} initialRegion={{latitude:start[0], longitude:start[1], latitudeDelta:initial?0.01:0.06, longitudeDelta:initial?0.01:0.06}}
            onPress={(e:any)=>{ const c=e.nativeEvent.coordinate; setPoint([c.latitude,c.longitude]); }}>
            <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
            {ll && <Marker coordinate={{latitude:ll[0], longitude:ll[1]}} pinColor={color}/>}
          </MapView>
          <View style={s.hint}><Text style={s.hintT}>اضغط على الخريطة لتحديد الموقع</Text></View>
          <Pressable onPress={myLocation} style={s.my}><Text style={{fontWeight:'800', fontSize:12}}>🎯 موقعي</Text></Pressable>
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
  my:{position:'absolute', bottom:12, left:12, height:40, paddingHorizontal:12, borderRadius:12, backgroundColor:'#fff', borderWidth:1, borderColor:'#e2e8f0', justifyContent:'center'},
  bar:{padding:14, borderTopWidth:1, borderColor:'#e2e8f0'},
  label:{fontSize:13, fontWeight:'800', textAlign:'right', minHeight:20},
  confirm:{height:46, borderRadius:12, backgroundColor:'#4F46E5', alignItems:'center', justifyContent:'center', marginTop:10},
  confirmT:{color:'#fff', fontWeight:'900', fontSize:14},
});
