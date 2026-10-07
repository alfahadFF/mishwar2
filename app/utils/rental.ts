import { supabase } from './supabase';
import { guestBlocked } from './guest';

export type Unit = 'hour' | 'day' | 'week' | 'month';
export const UNITS: Unit[] = ['hour', 'day', 'week', 'month'];
export const UNIT: Record<Unit, { n: string; many: string; per: string; max: number }> = {
  hour: { n: 'ساعة', many: 'ساعات', per: '/ساعة', max: 72 },
  day: { n: 'يوم', many: 'أيام', per: '/يوم', max: 90 },
  week: { n: 'أسبوع', many: 'أسابيع', per: '/أسبوع', max: 26 },
  month: { n: 'شهر', many: 'أشهر', per: '/شهر', max: 12 },
};
const DUAL: Record<Unit, string> = { hour: 'ساعتين', day: 'يومين', week: 'أسبوعين', month: 'شهرين' };
export const unitCount = (u: Unit, n: number) => (n === 2 ? DUAL[u] : n >= 3 && n <= 10 ? `${n} ${UNIT[u].many}` : `${n} ${UNIT[u].n}`);
export const CONDITIONS: { k: string; l: string }[] = [
  { k: 'license', l: '🪪 رخصة قيادة سارية' },
  { k: 'id', l: '🛂 هوية أو جواز سفر' },
  { k: 'deposit', l: '💵 تأمين نقدي مسترد' },
  { k: 'age21', l: '🎂 العمر 21 عاماً فأكثر' },
  { k: 'fuel_same', l: '⛽ نفس مستوى الوقود' },
  { k: 'no_smoking', l: '🚭 ممنوع التدخين' },
  { k: 'contract', l: '📄 عقد إيجار عند الاستلام' },
];
export const condLabel = (k: string) => CONDITIONS.find(c => c.k === k)?.l || k;
export const TRANS: Record<string, string> = { auto: 'أوتوماتيك', manual: 'عادي' };
export const FUEL: Record<string, string> = { petrol: 'بنزين', diesel: 'ديزل', electric: 'كهرباء', hybrid: 'هايبرد' };
export const PHOTO_SLOTS: { k: 'front' | 'back' | 'side'; l: string }[] = [
  { k: 'front', l: 'أمامية' }, { k: 'back', l: 'خلفية' }, { k: 'side', l: 'جانبية' },
];
export const specsLine = (l: any) => [l.year, TRANS[l.transmission], l.seats ? `${l.seats} مقاعد` : null, l.color, FUEL[l.fuel], l.ac ? 'مكيّف' : null].filter(Boolean).join(' • ');
export const priceLine = (l: any) => {
  const p = (l.units || []).filter((u: Unit) => l.prices?.[u]).map((u: Unit) => `$${Number(l.prices[u])}${UNIT[u].per}`);
  return p.length ? p.join(' • ') : 'السعر حسب العرض';
};
export const fmtDT = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// رفع صورة للتخزين وإرجاع رابطها العام
export async function uploadRentalPhoto(uri: string, slot: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { guestBlocked(); throw new Error('NOT_AUTH'); }
  const body = await (await fetch(uri)).arrayBuffer();
  const path = `${user.id}/${Date.now()}-${slot}.jpg`;
  const { error } = await supabase.storage.from('rental-photos').upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from('rental-photos').getPublicUrl(path).data.publicUrl;
}
