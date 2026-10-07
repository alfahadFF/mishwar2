import type { SupabaseClient } from '@supabase/supabase-js';

// أنواع مركبات السائق والخدمات المتاحة لكل نوع
export type DriverKind = 'car' | 'van_8' | 'van_11' | 'bus_small_14' | 'bus_mid_18' | 'bus_mid_21' | 'bus_mid_27' | 'bus_large_50';
export const DRIVER_KINDS: { k: DriverKind; name: string; icon: string; seats?: number }[] = [
  { k: 'car', name: 'سيارة', icon: '🚗' },
  { k: 'van_8', name: 'فان 8', icon: '🚐', seats: 8 },
  { k: 'van_11', name: 'فان 11', icon: '🚐', seats: 11 },
  { k: 'bus_small_14', name: 'باص صغير 14', icon: '🚐', seats: 14 },
  { k: 'bus_mid_18', name: 'باص 18', icon: '🚌', seats: 18 },
  { k: 'bus_mid_21', name: 'باص 21', icon: '🚌', seats: 21 },
  { k: 'bus_mid_27', name: 'باص 27', icon: '🚌', seats: 27 },
  { k: 'bus_large_50', name: 'باص 50', icon: '🚌', seats: 50 },
];
export const kindHasTaxi = (k?: string | null) => k === 'car' || k === 'van_8' || k === 'van_11';
export const kindHasWedding = kindHasTaxi;
export const kindHasAirport = (k?: string | null) => kindHasTaxi(k) || k === 'bus_small_14';

export const CAR_CATS = [
  { k: 'ordinary', name: 'قياسية', icon: '🚗' },
  { k: 'economy', name: 'اقتصادية', icon: '⚡' },
  { k: 'luxury', name: 'فاخرة', icon: '✨' },
] as const;

export const FUELS = [
  { k: 'petrol', name: 'بنزين' },
  { k: 'diesel', name: 'مازوت' },
  { k: 'gas', name: 'غاز' },
  { k: 'electric', name: 'كهرباء' },
  { k: 'hybrid', name: 'هايبرد' },
] as const;

// ---------- شاشات حساب العمل ----------
// p: نتيجة my_work_profile
export type WorkTab = 'shared' | 'airport' | 'events' | 'contracts' | 'cargo' | 'rental';
export const TAB_NAME: Record<WorkTab, string> = { shared: 'الرحلات المشتركة', airport: 'المطار', events: 'المناسبات', contracts: 'العقود', cargo: 'النقل', rental: 'التأجير' };

export const isWorkType = (p: any) => ['driver', 'transporter', 'business'].includes(p?.type);
export const isTaxiDriver = (p: any) => p?.type === 'driver' && (kindHasTaxi(p?.kind) || (!p?.kind && !!p?.category));
export const hasRental = (p: any) => p?.type === 'business' || (p?.type === 'driver' && !!p?.rental);
export const hasTravel = (p: any) => !!p?.travel && ['driver', 'business'].includes(p?.type);

// تبويبات «الطلبات» حسب الاختصاص
export function requestTabs(p: any): WorkTab[] {
  const t: WorkTab[] = [];
  if (p?.type === 'driver' && p?.airport) t.push('airport');
  if (p?.type === 'driver' && p?.events) t.push('events');
  if (p?.type === 'driver' && p?.contracts !== false) t.push('contracts');
  if (p?.type === 'transporter') t.push('cargo');
  if (hasRental(p)) t.push('rental');
  return t;
}
// تبويبات «حجوزاتي»: الرحلات المشتركة لسائق التكسي + تبويبات الطلبات
export const bookingTabs = (p: any): WorkTab[] => [...(isTaxiDriver(p) ? ['shared' as WorkTab] : []), ...requestTabs(p)];

// أول شاشة لحساب العمل: سائق التكسي على الخريطة، والبقية على «الطلبات»
export const workHomeOf = (p: any) => (hasTravel(p) ? '/travel-provider' : isTaxiDriver(p) ? '/driver' : '/work');

// شاشة العمل بعد حفظ النموذج لأول مرة
export function workHome(role: 'driver' | 'carrier', kind?: string | null, _events?: boolean, _contracts?: boolean) {
  if (role === 'driver' && kindHasTaxi(kind)) return '/driver';
  return '/work';
}

// رفع صورة: الصور الشخصية وصور المركبة عامة، وصورة الرخصة خاصة (يُحفظ مسارها فقط)
export async function uploadWorkPhoto(client: SupabaseClient, uri: string, slot: 'driver' | 'vehicle' | 'license' | 'cr'): Promise<string> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('NOT_AUTH');
  const body = await (await fetch(uri)).arrayBuffer();
  const path = `${user.id}/${Date.now()}-${slot}.jpg`;
  const priv = slot === 'license' || slot === 'cr';
  const bucket = priv ? 'work-docs' : 'work-photos';
  const { error } = await client.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return priv ? path : client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
