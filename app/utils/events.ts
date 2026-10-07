// مركبات المناسبات
// الباصات والفانات: كل سائق باص/فان يرى أي طلب باص/فان
// سيارة الزفاف: خدمة يفعّلها السائق في حسابه، وتصلح لها أي سيارة
export const EV_TYPES: Record<string, { name: string; icon: string; seats: number; wedding?: boolean }> = {
  wedding_car: { name: 'سيارة زفاف', icon: '💍', seats: 4, wedding: true },
  bus_large_50: { name: 'باص كبير 50', icon: '🚌', seats: 50 },
  bus_mid_27: { name: 'باص متوسط 27', icon: '🚌', seats: 27 },
  bus_mid_21: { name: 'باص متوسط 21', icon: '🚌', seats: 21 },
  bus_mid_18: { name: 'باص متوسط 18', icon: '🚌', seats: 18 },
  bus_small_14: { name: 'باص صغير 14', icon: '🚐', seats: 14 },
  van_11: { name: 'فان 11', icon: '🚐', seats: 11 },
  van_8: { name: 'فان 8', icon: '🚐', seats: 8 },
};
export const EV_ORDER = Object.keys(EV_TYPES);
export const EVENT_KINDS: Record<string, string> = { wedding: '💍 زفاف', family: '👨‍👩‍👧‍👦 رحلة عائلية', tourist: '🏖️ رحلة سياحية', other: '✨ مناسبة' };
export const evName = (t?: string | null) => (t && EV_TYPES[t] ? EV_TYPES[t].icon + ' ' + EV_TYPES[t].name : t === 'car' ? '🚘 سيارة' : '—');
export const isBusVan = (t?: string | null) => !!t && !!EV_TYPES[t] && !EV_TYPES[t].wedding;
export const eventKind = (o: any) => (o?.event_type === 'other' && o?.event_type_other ? '✨ ' + o.event_type_other : EVENT_KINDS[o?.event_type] || '✨ مناسبة');
export type DriverProfile = {
  name?: string; phone?: string; vehicle_class?: string | null; event_vehicle_type?: string | null; vehicle_seats?: number | null;
  vehicle_model?: string | null; vehicle_year?: number | null; vehicle_color?: string | null; vehicle_photo_url?: string | null;
  svc_events?: boolean; svc_wedding?: boolean;
};
// هل يستطيع السائق خدمة هذا البند؟
export function canServe(itemType: string, p?: DriverProfile | null) {
  if (!p) return false;
  if (EV_TYPES[itemType]?.wedding) return !!p.svc_wedding && !!p.event_vehicle_type;
  return !!p.svc_events && isBusVan(p.event_vehicle_type) && isBusVan(itemType);
}
export const weddingDetails = (it: any) => [it?.style === 'lux' ? 'فاخرة' : it?.style ? 'عادية' : null, it?.deco === true ? 'مع زينة' : it?.deco === false ? 'بدون زينة' : null].filter(Boolean).join(' • ');
export function fmtDateTime(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
