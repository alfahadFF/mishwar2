import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
export type Wallet = { balance: number; blocked: boolean; free_until?: string | null; free_days_left?: number | null; wallet_id?: string | null; discount_pct?: number; has_pin?: boolean; pin_locked_until?: string | null; transfer_limit?: number; transferred_today?: number; is_admin?: boolean };
export const COMMISSION = 0.12;
export const money = (n: any) => { const v = Number(n || 0); return (Math.round(v * 100) / 100).toLocaleString('en-US') ; };
export function useWallet() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const refresh = useCallback(async () => {
    // خصم العمولات الشهرية المستحقة (عقود + تأجير)
    await supabase.rpc('settle_all_my_dues').then(() => {}, () => {});
    const { data, error } = await supabase.rpc('my_wallet');
    if (!error && data) setWallet({ balance: Number(data.balance || 0), blocked: !!data.blocked, free_until: data.free_until, free_days_left: data.free_days_left, wallet_id: data.wallet_id, discount_pct: Number(data.discount_pct || 0), has_pin: !!data.has_pin, pin_locked_until: data.pin_locked_until, transfer_limit: Number(data.transfer_limit || 0), transferred_today: Number(data.transferred_today || 0), is_admin: !!data.is_admin });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const isFree = !!wallet && Number(wallet.free_days_left || 0) > 0;
  return { wallet, refresh, isFree };
}

export const SVC_NAME: Record<string, string> = { cargo: 'نقل', events: 'مناسبات', taxi: 'تكسي', taxi_shared: 'تكسي مشترك', rental: 'تأجير', contracts: 'عقود', travel: 'سفريات' };
// عنوان الحركة في سجل المحفظة
export function txLabel(t: any) {
  const svc = SVC_NAME[t.service] || '';
  switch (t.kind) {
    case 'topup': return 'شحن رصيد';
    case 'card_topup': return 'شحن ببطاقة';
    case 'commission': return `عمولة ${svc}`.trim() + (t.is_trial ? ' (مجانية)' : '');
    case 'payment_out': return `دفع ${svc}${t.counterparty ? ` إلى ${t.counterparty}` : ''}`;
    case 'payment_in': return `دفعة ${svc}${t.counterparty ? ` من ${t.counterparty}` : ''}`;
    case 'transfer_out': return `تحويل إلى ${t.counterparty || 'مستخدم'}`;
    case 'transfer_in': return `تحويل من ${t.counterparty || 'مستخدم'}`;
    case 'adjustment': return 'تسوية من الإدارة';
    case 'reward': return `🏆 ${t.note || 'مكافأة شهرية'}`;
    case 'loyalty': return `🎁 ${t.note || 'تحويل نقاط'}`;
    default: return 'تسوية';
  }
}
export const fmtWalletId = (v?: string | null) => (v ? `${v.slice(0, 4)} ${v.slice(4)}` : '—');
export const fmtCard = (v: string) => v.replace(/\D/g, '').slice(0, 14).replace(/(\d{4})(?=\d)/g, '$1 ');
