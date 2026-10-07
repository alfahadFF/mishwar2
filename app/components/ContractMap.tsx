import React from 'react';
import { View } from 'react-native';
import TripRouteMap, { Segment, TripMarker } from './TripRouteMap';

const lls = (a: any[]) => (a || []).filter(p => p && p.lat != null).map(p => [Number(p.lat), Number(p.lng)]);
export const ctFirstLL = (o: any) => lls(o?.pickup_points)[0] || null;
export const ctTripLLs = (o: any) => [...lls(o?.pickup_points), ...lls(o?.destinations)];

// مسار العقد: الانطلاق ← الوجهات، والعودة إلى أماكن التنزيل أو الانطلاق
export default function ContractMap({ o }: { o: any }) {
  const P = lls(o?.pickup_points), D = lls(o?.destinations), R0 = lls(o?.drop_points);
  if (!P.length || !D.length) return null;
  const R = R0.length ? R0 : P.slice().reverse();
  const segments: Segment[] = [
    { key: 'outbound', name: 'الذهاب', icon: '🛣️', color: '#4F46E5', pts: [...P, ...D] },
    { key: 'return', name: 'العودة', icon: '↩️', color: '#16a34a', ret: true, pts: [...D.slice().reverse(), ...R] },
  ];
  const markers: TripMarker[] = [
    ...P.map((ll, i) => ({ ll, txt: `انطلاق ${i + 1}`, color: 'green' })),
    ...D.map((ll, i) => ({ ll, txt: `وجهة ${i + 1}`, color: 'indigo' })),
    ...R0.map((ll, i) => ({ ll, txt: `تنزيل ${i + 1}`, color: 'red' })),
  ];
  return <View style={{ marginBottom: 8 }}><TripRouteMap segments={segments} markers={markers} /></View>;
}
