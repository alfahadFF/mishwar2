-- الدفع وإنهاء التكسي (14 من 39): المدير: التقرير
drop function if exists public.admin_wallet_report(date, date);
create or replace function public.admin_wallet_report(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return (
    select jsonb_build_object(
      'from', f::date, 'to', (t - interval '1 day')::date,
      'commissions', coalesce(-sum(amount) filter (where kind = 'commission'), 0),
      'card_topups', coalesce(sum(amount) filter (where kind in ('card_topup','topup')), 0),
      'payments', coalesce(sum(gross_amount) filter (where kind = 'payment_in'), 0),
      'discounts', coalesce(sum(discount) filter (where kind = 'payment_out'), 0),  -- التكسي: الخصم مسجل كتخفيض عمولة
      'transfers', coalesce(sum(amount) filter (where kind = 'transfer_in'), 0),
      'adjustments', coalesce(sum(amount) filter (where kind = 'adjustment'), 0),
      'net_revenue', coalesce(-sum(amount) filter (where kind = 'commission'), 0)
                     - coalesce(sum(discount) filter (where kind = 'payment_out' and coalesce(service, '') <> 'taxi'), 0),
      'total_balances', (select coalesce(sum(balance), 0) from wallets),
      'total_debt', (select coalesce(-sum(balance) filter (where balance < 0), 0) from wallets))
    from wallet_transactions where created_at >= f and created_at < t);
end; $$;
grant execute on function public.admin_wallet_report(date, date) to authenticated;
