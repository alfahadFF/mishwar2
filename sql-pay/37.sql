-- الدفع وإنهاء التكسي (37 من 39): تسجيل الدفعة
-- تسجيل الدفعة وخصمها من الراكب ثم تحويلها للسائق
create or replace function public._pay_record(it jsonb, p_payer uuid, p_payee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_a numeric; v_paid numeric := (it->>'to_pay')::numeric;
begin
  insert into wallets(user_id) values (p_payer), (p_payee) on conflict (user_id) do nothing;
  perform 1 from wallets where user_id in (p_payer, p_payee) order by user_id for update;
  if (select balance from wallets where user_id = p_payer) < v_paid then raise exception 'INSUFFICIENT_BALANCE'; end if;
  insert into wallet_payments(service, ref_id, period, payer, payee, gross, discount_pct, discount, paid)
  values (it->>'service', (it->>'ref_id')::uuid, (it->>'period')::int, p_payer, p_payee, (it->>'gross')::numeric,
          (it->>'discount_pct')::numeric, (it->>'discount')::numeric, v_paid);
  update wallets set balance = balance - v_paid, updated_at = now() where user_id = p_payer returning balance into v_a;
  perform public._pay_credit(it->>'service', (it->>'ref_id')::uuid, p_payer, p_payee, v_a, (it->>'gross')::numeric,
          v_paid, (it->>'discount')::numeric, (it->>'discount_pct')::numeric, it->>'title');
end; $$;
revoke all on function public._pay_record(jsonb, uuid, uuid) from public, anon, authenticated;
