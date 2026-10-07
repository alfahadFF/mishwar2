import React from 'react';
import { View } from 'react-native';
import TripRouteMap, { Segment, TripMarker } from './TripRouteMap';
import { evName } from '../utils/events';

// النقطة الأخيرة تُحفظ نصاً (JSON) — قراءة آمنة
export function parseFinal(v: any): { label: string; lat?: number; lng?: number } | null {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { const j = JSON.parse(v); if (j && typeof j === 'object') return j; } catch {}
  return { label: String(v) };
}
export const dests = (o: any) => ((o?.destinations || []) as any[]).filter(d => d && d.lat != null);
export const gatherLL = (o: any) => (o?.gathering_lat != null ? [Number(o.gathering_lat), Number(o.gathering_lng)] : null);
export const tripLLs = (o: any) => { const g = gatherLL(o); return g ? [g, ...dests(o).map(d => [Number(d.lat), Number(d.lng)])] : []; };
export function vehicleLine(v: any) {
  if (!v) return '—';
  const t = v.type || v.event_vehicle_type;
  const base = t === 'car' ? '🚘 سيارة' : evName(t);
  return [base, v.model || v.vehicle_model, v.year || v.vehicle_year, v.color || v.vehicle_color].filter(Boolean).join(' • ');
}


export function EventMap({ o }: { o: any }) {
  const g = gatherLL(o);
  const D = dests(o);
  if (!g || !D.length) return null;
  const fin = parseFinal(o.final_point);
  const finLL = fin?.lat != null ? [Number(fin.lat), Number(fin.lng)] : g;
  const DL = D.map(d => [Number(d.lat), Number(d.lng)]);
  const segments: Segment[] = [
    { key: 'outbound', name: 'الذهاب', icon: '🛣️', color: '#4F46E5', pts: [g, ...DL] },
    { key: 'return', name: 'العودة', icon: '↩️', color: '#16a34a', ret: true, pts: [DL[DL.length - 1], finLL] },
  ];
  const markers: TripMarker[] = [
    { ll: g, txt: 'نقطة التجمع', color: 'green' },
    ...DL.map((ll, i) => ({ ll, txt: `الوجهة ${i + 1}`, color: 'indigo' })),
    ...(fin?.lat != null ? [{ ll: finLL, txt: 'الوصول الأخير', color: 'red' }] : []),
  ];
  return <View style={{ marginBottom: 8 }}><TripRouteMap segments={segments} markers={markers} /></View>;
}
