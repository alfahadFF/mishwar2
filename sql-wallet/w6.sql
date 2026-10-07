-- المحفظة العامة (6 من 6): الدفع + بيانات المحفظة
-- الدفع: يُخصم من الزبون المبلغ بعد الخصم، ويستلم السائق السعر كاملاً
drop function if exists public.pay_from_wallet(text, uuid, int);
create or replace function public.pay_from_wallet(p_service text, p_ref uuid, p_period int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; v_payee uuid; v_gross numeric; v_disc numeric; v_paid numeric; v_pct numeric; v_bal numeric; v_a numeric; v_b numeric;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  select x into it from public.my_payables() x
   where x->>'service' = p_service and (x->>'ref_id')::uuid = p_ref and (x->>'period')::int = coalesce(p_period, 1);
  if it is null then
    if exists (select 1 from wallet_payments where service = p_service and ref_id = p_ref and period = coalesce(p_period, 1)) then
      raise exception 'ALREADY_PAID';
    end if;
    raise exception 'NOT_PAYABLE';
  end if;
  v_payee := case p_service
    when 'cargo' then (select carrier_id from cargo_orders where id = p_ref)
    when 'events' then (select driver_id from event_offers where id = p_ref)
    when 'contracts' then (select driver_id from contract_offers where id = p_ref) end;
  v_gross := (it->>'gross')::numeric; v_pct := (it->>'discount_pct')::numeric;
  v_disc := (it->>'discount')::numeric; v_paid := (it->>'to_pay')::numeric;

  insert into wallets(user_id) values (auth.uid()), (v_payee) on conflict (user_id) do nothing;
  perform 1 from wallets where user_id in (auth.uid(), v_payee) order by user_id for update;
  select balance into v_bal from wallets where user_id = auth.uid();
  if v_bal < v_paid then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into wallet_payments(service, ref_id, period, payer, payee, gross, discount_pct, discount, paid)
  values (p_service, p_ref, coalesce(p_period, 1), auth.uid(), v_payee, v_gross, v_pct, v_disc, v_paid);
  update wallets set balance = balance - v_paid, updated_at = now() where user_id = auth.uid() returning balance into v_a;
  update wallets set balance = balance + v_gross, updated_at = now() where user_id = v_payee returning balance into v_b;
  insert into wallet_transactions(user_id, kind, amount, balance_after, service, ref_id, gross_amount, counterparty, discount, note)
  values (auth.uid(), 'payment_out', -v_paid, v_a, p_service, p_ref, v_gross, v_payee, nullif(v_disc, 0), it->>'title'),
         (v_payee, 'payment_in', v_gross, v_b, p_service, p_ref, v_gross, auth.uid(), null, it->>'title');
  return jsonb_build_object('paid', v_paid, 'discount', v_disc, 'balance', v_a);
end; $$;

-- بيانات المحفظة
drop function if exists public.my_wallet();
create or replace function public.my_wallet()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'blocked', public.wallet_blocked(auth.uid()),
    'free_until', public.free_until(auth.uid()),
    'free_days_left', greatest(0, ceil(extract(epoch from (public.free_until(auth.uid()) - now())) / 86400))::int,
    'wallet_id', (select wallet_id from profiles where id = auth.uid()),
    'discount_pct', public._wallet_discount_pct());
$$;

-- سجل الحركات مع اسم الطرف الآخر
drop function if exists public.my_wallet_transactions(int);
create or replace function public.my_wallet_transactions(p_limit int default 50)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'kind', t.kind, 'amount', t.amount, 'balance_after', t.balance_after,
           'service', t.service, 'gross', t.gross_amount, 'discount', t.discount, 'note', t.note,
           'is_trial', t.is_trial, 'created_at', t.created_at,
           'counterparty', case when t.counterparty is not null then public._short_name(p.full_name) end)
    from wallet_transactions t left join profiles p on p.id = t.counterparty
   where t.user_id = auth.uid()
   order by t.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

grant execute on function public.pay_from_wallet(text, uuid, int) to authenticated;
grant execute on function public.my_wallet() to authenticated;
grant execute on function public.my_wallet_transactions(int) to authenticated;

select 'دوال المحفظة' as الفحص,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
         ('redeem_topup_card','admin_create_topup_cards','wallet_find_user','wallet_transfer',
          'my_payables','pay_from_wallet','my_wallet','my_wallet_transactions'))::text || ' من 8' as النتيجة
union all
select 'معرّف المحفظة للمستخدمين',
       (select count(*) filter (where wallet_id is not null) || ' من ' || count(*) from public.profiles)
union all
select 'خصم الدفع من التطبيق', (select value || '%' from public.app_settings where key = 'wallet_pay_discount_pct');
