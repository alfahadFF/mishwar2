import { supabase } from './supabase';
import { DRIVER_KINDS, CAR_CATS, FUELS } from './work';
import { vName } from './vehicles';

export const TYPE_NAME: Record<string, string> = {
  personal: 'شخصي', driver: 'سائق', transporter: 'ناقل', business: 'مكتب تأجير', special_driver: 'سائق', admin: 'إدارة',
};
export const SERVICE_NAME: Record<string, string> = {
  taxi: 'التكسي', taxi_shared: 'الرحلات المشتركة', cargo: 'نقل البضائع', events: 'المناسبات', contracts: 'العقود',
  rental: 'التأجير', airport: 'المطار', travel: 'السفريات',
};
export const SETTINGS: { k: string; label: string; unit: string; hint?: string }[] = [
  { k: 'free_days', label: 'الأيام المجانية لمقدّم الخدمة الجديد', unit: 'يوم' },
  { k: 'wallet_pay_discount_pct', label: 'خصم الدفع من التطبيق', unit: '%' },
  { k: 'wallet_daily_transfer_limit', label: 'حد التحويل اليومي بالمحفظة', unit: '$' },
  { k: 'economy_max_cc', label: 'حد الفئة الاقتصادية', unit: 'CC', hint: 'حتى هذا الرقم اقتصادية' },
  { k: 'ordinary_max_cc', label: 'حد الفئة العادية', unit: 'CC', hint: 'فوقه فاخرة' },
];
export const REJECT_REASONS = [
  'صورة الرخصة غير واضحة', 'صورة المركبة غير واضحة', 'البيانات لا تطابق الصور', 'الرخصة منتهية', 'صورة السجل التجاري غير واضحة',
];

export const kindName = (k?: string | null) => DRIVER_KINDS.find(x => x.k === k)?.name || '';
export const catName = (k?: string | null) => (CAR_CATS as readonly any[]).find(x => x.k === k)?.name || '';
export const fuelName = (k?: string | null) => (FUELS as readonly any[]).find(x => x.k === k)?.name || '';
export const cargoName = (k?: string | null) => (k ? vName(k) : '');

// صور الرخص والسجلات خاصة: رابط مؤقت لمدة 10 دقائق
export async function docUrl(path?: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:/.test(path)) return path;
  const { data } = await supabase.storage.from('work-docs').createSignedUrl(path, 600);
  return data?.signedUrl || null;
}
export const fmtD = (v?: string | null) => (v ? String(v).slice(0, 10) : '—');
