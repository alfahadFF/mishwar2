import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
type Props={ badge:string; color:string; title:string; label?:string; set:boolean; optional?:boolean; onPick:()=>void; onRemove?:()=>void; children?:React.ReactNode };
// بطاقة نقطة: الاسم المستخرج من الخريطة + زر التحديد/التغيير
export default function PointRow({badge,color,title,label,set,optional,onPick,onRemove,children}:Props){
  return (
    <View style={s.row}>
      <View style={[s.badge,{backgroundColor:color}]}><Text style={s.badgeT}>{badge}</Text></View>
      <View style={{flex:1}}>
        <Text style={s.title}>{title}</Text>
        <Text style={[s.label, !set && {color:'#94a3b8'}]} numberOfLines={1}>{set? label : optional? 'اختياري — لم تُحدد' : 'لم تُحدد بعد'}</Text>
        {children}
      </View>
      <Pressable onPress={onPick} style={[s.btn, set && s.btnHas]}><Text style={[s.btnT, set && {color:'#4F46E5'}]}>{set? '✏️ تغيير' : '📍 حدد على الخريطة'}</Text></Pressable>
      {onRemove && <Pressable onPress={onRemove} style={s.x}><Text style={{color:'#991b1b'}}>✕</Text></Pressable>}
    </View>
  );
}
const s=StyleSheet.create({
  row:{flexDirection:'row-reverse', alignItems:'center', gap:8, borderWidth:1.5, borderColor:'#e2e8f0', borderRadius:14, padding:10, backgroundColor:'#fff', marginTop:8},
  badge:{minWidth:30, height:30, borderRadius:999, alignItems:'center', justifyContent:'center', paddingHorizontal:4},
  badgeT:{color:'#fff', fontWeight:'900', fontSize:12},
  title:{fontSize:12, fontWeight:'900', textAlign:'right'},
  label:{fontSize:11, color:'#334155', marginTop:2, textAlign:'right'},
  btn:{height:36, paddingHorizontal:10, borderRadius:10, borderWidth:1.5, borderStyle:'dashed', borderColor:'#cbd5e1', justifyContent:'center'},
  btnHas:{borderStyle:'solid', borderColor:'#c7d2fe', backgroundColor:'#eef2ff'},
  btnT:{fontSize:11, fontWeight:'800'},
  x:{width:30, height:30, borderRadius:999, borderWidth:1, borderColor:'#fecaca', alignItems:'center', justifyContent:'center'},
});
