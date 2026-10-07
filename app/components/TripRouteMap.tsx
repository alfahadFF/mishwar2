import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getRoute, fmtMin } from '../utils/route';
import { MapView, UrlTile, Marker, Polyline } from './OpenMapView';

export type Segment={ key:string; name:string; icon:string; color:string; ret?:boolean; pts:number[][] };
export type TripMarker={ ll:number[]; txt:string; color:string };
type Result={ key:string; ok:boolean; km?:number; min?:number; path?:any[] };
// خريطة ملخص الرحلة: المسار الفعلي للذهاب/العودة — معلومة فقط، لا تدخل في أي سعر
export default function TripRouteMap({segments, markers, onResult}:{segments:Segment[]; markers:TripMarker[]; onResult?:(r:{name:string,km?:number,min?:number}[])=>void}){
  const [results,setResults]=useState<Result[]|null>(null);
  const sig=JSON.stringify(segments.map(s=> s.pts));
  useEffect(()=>{
    if(!segments.length || segments[0].pts.length<2){ setResults(null); return; }
    let alive=true; setResults(null);
    Promise.all(segments.map(s=> getRoute(s.pts))).then(rs=>{
      if(!alive) return;
      const out=rs.map((r,i)=> r.ok? {key:segments[i].key, ok:true, km:r.km, min:r.min, path:r.path} : {key:segments[i].key, ok:false});
      setResults(out);
      onResult?.(out.map(o=> ({name:o.key, km:o.km!=null? Number(o.km.toFixed(2)):undefined, min:o.min!=null? Math.round(o.min):undefined})));
    });
    return ()=>{ alive=false; };
  },[sig]);
  if(!segments.length || segments[0].pts.length<2) return null;
  const all=markers.map(m=> m.ll);
  const lats=all.map(p=>p[0]), lngs=all.map(p=>p[1]);
  const region={ latitude:(Math.min(...lats)+Math.max(...lats))/2, longitude:(Math.min(...lngs)+Math.max(...lngs))/2,
    latitudeDelta:Math.max(0.02,(Math.max(...lats)-Math.min(...lats))*1.6), longitudeDelta:Math.max(0.02,(Math.max(...lngs)-Math.min(...lngs))*1.6) };
  return (
    <View>
      <View style={s.map}>
        <MapView key={sig} style={{flex:1}} initialRegion={region} scrollEnabled={false} zoomEnabled={false}>
          <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
          {results?.map((r,i)=> r.ok? <Polyline key={r.key} coordinates={r.path} strokeColor={segments[i].color} strokeWidth={segments[i].ret?4:5} lineDashPattern={segments[i].ret?[8,6]:undefined}/> : null)}
          {markers.map((m,i)=> <Marker key={i} coordinate={{latitude:m.ll[0], longitude:m.ll[1]}} pinColor={m.color} title={m.txt}/>)}
        </MapView>
      </View>
      <View style={{gap:6, marginTop:8}}>
        {segments.map((sg,i)=>{
          const r=results?.[i];
          const txt=!results? `⏳ ${sg.name}: جاري حساب المسار...` : r?.ok? `${sg.icon} ${sg.name}: ${r.km!.toFixed(1)} كم على الطريق • ${fmtMin(r.min!)}` : `⚠️ ${sg.name}: تعذر حساب المسار`;
          return <View key={sg.key} style={[s.info, sg.ret && s.infoRet, results && !r?.ok && s.infoErr]}><Text style={[s.infoT, sg.ret && {color:'#065f46'}, results && !r?.ok && {color:'#991b1b'}]}>{txt}</Text></View>;
        })}
      </View>
    </View>
  );
}
const s=StyleSheet.create({
  map:{height:220, borderRadius:12, overflow:'hidden', borderWidth:1.5, borderColor:'#e2e8f0', marginTop:10},
  info:{backgroundColor:'#eef2ff', borderWidth:1, borderColor:'#c7d2fe', borderRadius:10, padding:8},
  infoRet:{backgroundColor:'#f0fdf4', borderColor:'#a7f3d0'},
  infoErr:{backgroundColor:'#fef2f2', borderColor:'#fecaca'},
  infoT:{color:'#3730a3', fontSize:12, fontWeight:'900', textAlign:'center'},
});
