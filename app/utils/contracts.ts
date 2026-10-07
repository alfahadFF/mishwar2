import { EV_TYPES } from './events';
// العقود: يومي / أسبوعي / شهري
export type CtUnit = 'day' | 'week' | 'month';
export const CT_UNITS: { k: CtUnit; label: string; one: string; many: string; per: string; quick: number[] }[] = [
  { k: 'day', label: 'يومي', one: 'يوم', many: 'أيام', per: 'لليوم', quick: [5, 10, 20, 30] },
  { k: 'week', label: 'أسبوعي', one: 'أسبوع', many: 'أسابيع', per: 'للأسبوع', quick: [1, 2, 4, 8] },
  { k: 'month', label: 'شهري', one: 'شهر', many: 'أشهر', per: 'للشهر', quick: [1, 3, 6, 9, 12] },
];
export const unitOf = (k?: string | null) => CT_UNITS.find(u => u.k === k) || CT_UNITS[2];
export const durText = (k?: string | null, n?: number | null) => { const u = unitOf(k); if (!n) return '—'; if (n === 1) return `${u.one} واحد`; if (n === 2) return u.one + 'ان'; return `${n} ${n <= 10 ? u.many : u.one}`; };
export const CT_CATS: Record<string, string> = { school: '🏫 مدارس', kindergarten: '🧸 روضة', university: '🎓 جامعات', factory: '🏭 مصانع', company: '🏢 شركة', workers: '👷 عمال' };
export const ctVehName = (t?: string | null) => (t === 'car' ? '🚗 سيارة 4' : t && EV_TYPES[t] ? EV_TYPES[t].icon + ' ' + EV_TYPES[t].name : '—');
export const DAY_NAMES = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const daysText = (d?: number[] | null) => (d && d.length ? [0, 1, 2, 3, 4, 5, 6].filter(x => d.includes(x)).map(x => DAY_NAMES[x]).join('، ') : '—');
// هل يخدم السائق هذا البند؟ الباصات والفانات لأي صاحب باص/فان، والسيارة لأصحاب السيارات
const BUSVAN = ['van_8', 'van_11', 'bus_small_14', 'bus_mid_18', 'bus_mid_21', 'bus_mid_27', 'bus_large_50'];
export const ctCanServe = (item: string, vehicleType?: string | null) =>
  item === 'car' ? vehicleType === 'car' : BUSVAN.includes(item) && BUSVAN.includes(vehicleType || '');
// تاريخ النهاية (للعرض — نفس حساب قاعدة البيانات). الأيام: 0 = الأحد
export function ctEndDate(start: string | null, unit: CtUnit, n: number, days: number[]): string | null {
  if (!start || !n) return null;
  const [y, m, d] = start.split('-').map(Number);
  const s = new Date(y, m - 1, d);
  let e: Date;
  if (unit === 'week') e = new Date(y, m - 1, d + 7 * n - 1);
  else if (unit === 'month') e = new Date(y, m - 1 + n, d - 1);
  else {
    let c = 0; e = new Date(s);
    for (let i = 0; i < 800; i++) { const x = new Date(y, m - 1, d + i); if (!days.length || days.includes(x.getDay())) { c++; if (c === n) { e = x; break; } } }
  }
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
}
