// فئات المركبات للنقل — التطابق: الفئة نفسها والأكبر منها ضمن نفس المجموعة
export type VehicleClass = 'pk800'|'pk1200'|'pk1500'|'pk2000'|'md3'|'md4'|'md5'|'md6'|'md7'|'truck';
export const VGROUPS = [
  { g: 'pickup', name: 'بيك آب صغير', icon: '🛻' },
  { g: 'medium', name: 'متوسط', icon: '🚚' },
  { g: 'truck',  name: 'شاحنة', icon: '🚛' },
] as const;
export const VCLASS: { k: VehicleClass; g: string; r: number; short: string }[] = [
  { k: 'pk800', g: 'pickup', r: 1, short: '800 كغ' },
  { k: 'pk1200', g: 'pickup', r: 2, short: '1200 كغ' },
  { k: 'pk1500', g: 'pickup', r: 3, short: '1500 كغ' },
  { k: 'pk2000', g: 'pickup', r: 4, short: '2000 كغ' },
  { k: 'md3', g: 'medium', r: 1, short: '3 طن' },
  { k: 'md4', g: 'medium', r: 2, short: '4 طن' },
  { k: 'md5', g: 'medium', r: 3, short: '5 طن' },
  { k: 'md6', g: 'medium', r: 4, short: '6 طن' },
  { k: 'md7', g: 'medium', r: 5, short: '7 طن' },
  { k: 'truck', g: 'truck', r: 1, short: 'شاحنة' },
];
export const vOf = (k?: string | null) => VCLASS.find(v => v.k === k);
export const vehicleFits = (orderK?: string | null, carrierK?: string | null) => {
  const o = vOf(orderK), c = vOf(carrierK);
  return !!(o && c && o.g === c.g && c.r >= o.r);
};
export const vName = (k?: string | null) => {
  const v = vOf(k); if (!v) return '—';
  const g = VGROUPS.find(x => x.g === v.g)!;
  return v.g === 'truck' ? `${g.icon} شاحنة` : `${g.icon} ${g.name} ${v.short}`;
};
