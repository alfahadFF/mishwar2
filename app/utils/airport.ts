import { supabase } from './supabase';
import { fmtDateTime } from './events';

export type Airport = { code: string; name: string; country: string; lat: number; lng: number };
export const WAIT_HOURS = [1, 2, 3, 4, 6];
export const AP_KIND: Record<string, string> = { arrival: '🛬 استقبال', departure: '🛫 وداع' };
export const AP_ST: Record<string, [string, any]> = {
  pending: ['بانتظار العروض', 'warn'], accepted: ['تم الاتفاق', 'ok'], completed: ['مكتمل', 'mute'], cancelled: ['ملغى', 'err'],
};
export const hoursText = (h: number) => (h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${h} ساعات`);

let cache: Airport[] | null = null;
export async function loadAirports(): Promise<Airport[]> {
  if (cache) return cache;
  // إصدار 1 لسوريا فقط؛ تُضاف الدول الأخرى عند فتحها في إصدار لاحق.
  const { data } = await supabase.from('airports').select('code,name,country,lat,lng').eq('country', 'SY');
  cache = (data || []) as Airport[];
  return cache;
}

// ترتيب المطارات من الأقرب لنقطة الانطلاق (للترتيب فقط، لا تُعرض مسافة)
export function sortByNear(list: Airport[], ll?: number[] | null) {
  if (!ll) return list;
  const d = (a: Airport) => (a.lat - ll[0]) ** 2 + ((a.lng - ll[1]) * Math.cos((ll[0] * Math.PI) / 180)) ** 2;
  return [...list].sort((a, b) => d(a) - d(b));
}

// ملخص الطلب في سطر واحد
export function paxLine(o: any) {
  const p = o.round_trip ? `ذهاب ${o.pax_go} • عودة ${o.pax_back}` : `${o.pax_go} ${o.pax_go === 1 ? 'راكب' : 'ركاب'} • ذهاب فقط`;
  return [p, o.wait_hours ? `انتظار ${hoursText(o.wait_hours)}` : null, o.bags ? `${o.bags} حقائب` : null].filter(Boolean).join(' • ');
}
export const whenLine = (o: any) => fmtDateTime(o.trip_at);
