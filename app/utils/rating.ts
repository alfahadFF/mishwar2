import { supabase } from './supabase';

export type Rating = { avg: number | null; n: number; level?: string };
export const LEVELS: Record<string, { n: string; e: string; c: string; bg: string; rank: number }> = {
  bronze: { n: 'برونزي', e: '🥉', c: '#9a3412', bg: '#fff7ed', rank: 0 },
  silver: { n: 'فضي', e: '🥈', c: '#475569', bg: '#f1f5f9', rank: 1 },
  gold: { n: 'ذهبي', e: '🥇', c: '#a16207', bg: '#fefce8', rank: 2 },
  diamond: { n: 'ماسي', e: '💎', c: '#0e7490', bg: '#ecfeff', rank: 3 },
};
export const levelRank = (r?: Rating | null) => LEVELS[r?.level || 'bronze']?.rank || 0;
// الأعلى مستوى أولاً (مع الحفاظ على الترتيب الأصلي داخل نفس المستوى)
export function sortByLevel<T extends { rating?: Rating }>(rows: T[], bucket?: (r: T) => number): T[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) =>
    (bucket ? bucket(a.r) - bucket(b.r) : 0) || levelRank(b.r.rating) - levelRank(a.r.rating) || a.i - b.i).map(x => x.r);
}
export const TAGS: Record<string, { l: string; pos: boolean }> = {
  safe_driving: { l: '🚗 قيادة آمنة', pos: true }, on_time: { l: '⏱️ ملتزم بالوقت', pos: true }, clean: { l: '✨ السيارة نظيفة', pos: true },
  polite: { l: '😊 أسلوب محترم', pos: true }, knows_route: { l: '🗺️ يعرف الطريق', pos: true }, careful_goods: { l: '📦 حريص على الأغراض', pos: true },
  as_listed: { l: '🔑 السيارة مطابقة للإعلان', pos: true },
  reckless: { l: '⚠️ قيادة متهورة', pos: false }, late: { l: '⌛ تأخّر', pos: false }, dirty: { l: '🧹 السيارة غير نظيفة', pos: false },
  rude: { l: '😠 أسلوب سيء', pos: false }, overcharge: { l: '💵 طلب مبلغاً زائداً', pos: false }, damaged_goods: { l: '📦 ضرر بالأغراض', pos: false },
  not_as_listed: { l: '🔑 السيارة غير مطابقة', pos: false },
};
// الأزرار المناسبة لكل خدمة
const DRIVE = ['safe_driving', 'on_time', 'clean', 'polite', 'knows_route', 'reckless', 'late', 'dirty', 'rude', 'overcharge'];
export const SERVICE_TAGS: Record<string, string[]> = {
  taxi: DRIVE, taxi_shared: DRIVE, events: DRIVE, contracts: DRIVE,
  cargo: ['safe_driving', 'on_time', 'polite', 'careful_goods', 'knows_route', 'reckless', 'late', 'rude', 'overcharge', 'damaged_goods'],
  rental: ['on_time', 'clean', 'polite', 'as_listed', 'late', 'dirty', 'rude', 'overcharge', 'not_as_listed'],
};
export const SERVICE_LABEL: Record<string, string> = {
  taxi: 'رحلة التكسي', taxi_shared: 'الرحلة المشتركة', cargo: 'النقل', events: 'المناسبة', contracts: 'العقد', rental: 'الإيجار',
};

// نجوم مقدم الخدمة للعروض (بدون كشف الهوية)
export type RatingKind = 'rental_listing' | 'cargo_offer' | 'event_offer' | 'contract_offer' | 'shared_trip' | 'taxi_order';
export async function fetchRatings(kind: RatingKind, ids: string[]): Promise<Record<string, Rating>> {
  const u = Array.from(new Set(ids.filter(Boolean))).slice(0, 200);
  if (!u.length) return {};
  const { data, error } = await supabase.rpc('rating_badges', { p_kind: kind, p_ids: u });
  return error || !data ? {} : (data as any);
}
export async function attachRatings<T extends { id: string }>(kind: RatingKind, rows: T[]): Promise<(T & { rating?: Rating })[]> {
  const m = await fetchRatings(kind, rows.map(r => r.id));
  return sortByLevel(rows.map(r => ({ ...r, rating: m[r.id] })));
}
