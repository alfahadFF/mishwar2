import { Share } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { errMsg } from './errors';

// صفحة التتبّع (GitHub Pages) — يتغيّر الرابط من app.json › extra.trackUrl
const extra: any = (Constants.expoConfig as any)?.extra || {};
export const TRACK_URL: string = extra.trackUrl || 'https://USERNAME.github.io/mishwar/track.html';
export const trackLink = (token: string) => `${TRACK_URL}?t=${token}`;

// مشاركة الرحلة (كل الخدمات ما عدا التأجير): يعيد رسالة خطأ أو null
export async function shareTrip(service: 'taxi' | 'taxi_shared' | 'cargo' | 'events' | 'contracts' | 'airport', ref: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_trip_share', { p_service: service, p_ref: ref });
  if (error) return errMsg(error, 'تعذرت المشاركة');
  const url = trackLink((data as any).token);
  try { await Share.share({ message: `📍 تابع رحلتي مباشرة (موقع السيارة وبيانات السائق):\n${url}` }); } catch {}
  return null;
}

// رقم سوري محلي 09.. ← 9639.. (لواتساب)
export function waPhone(p: string) {
  let d = (p || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '963' + d.slice(1);
  return d;
}
