-- أمان المحفظة (2 من 4): التحويل والدفع بالرمز السري
drop function if exists public.wallet_transfer(text, numeric, text);
drop function if exists public.wallet_transfer(text, numeric, text, text);
create or replace function public.wallet_transfer(p_to text, p_amount numeric, p_note text default null, p_pin text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_to uuid := public._wallet_lookup(p_to); v_bal numeric; v_from_after numeric; v_to_after numeric; v_amt numeric;
        v_err text; v_limit numeric; v_today numeric;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if v_to is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_to = auth.uid() then raise exception 'SELF_TRANSFER'; end if;
  v_amt := round(coalesce(p_amount, 0), 2);
  if v_amt <= 0 then raise exception 'BAD_AMOUNT'; end if;
  v_err := public._pin_verify(auth.uid(), p_pin);
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  v_limit := coalesce((select value::numeric from app_settings where key = 'wallet_daily_transfer_limit'), 0);
  v_today := public._transferred_today(auth.uid());
  if v_limit > 0 and v_today + v_amt > v_limit then
    return jsonb_build_object('error', 'DAILY_LIMIT', 'left', greatest(v_limit - v_today, 0));
  end if;
  insert into wallets(user_id) values (auth.uid()), (v_to) on conflict (user_id) do nothing;
  perform 1 from wallets where user_id in (auth.uid(), v_to) order by user_id for update;
  select balance into v_bal from wallets where user_id = auth.uid();
  if v_bal < v_amt then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update wallets set balance = balance - v_amt, updated_at = now() where user_id = auth.uid() returning balance into v_from_after;
  update wallets set balance = balance + v_amt, updated_at = now() where user_id = v_to returning balance into v_to_after;
  insert into wallet_transactions(user_id, kind, amount, balance_after, counterparty, note)
  values (auth.uid(), 'transfer_out', -v_amt, v_from_after, v_to, nullif(btrim(coalesce(p_note, '')), '')),
         (v_to, 'transfer_in', v_amt, v_to_after, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
  return jsonb_build_object('amount', v_amt, 'balance', v_from_after);
end; $$;

drop function if exists public.pay_from_wallet(text, uuid, int);
drop function if exists public.pay_from_wallet(text, uuid, int, text);
create or replace function public.pay_from_wallet(p_service text, p_ref uuid, p_period int default 1, p_pin text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; v_payee uuid; v_gross numeric; v_disc numeric; v_paid numeric; v_pct numeric; v_bal numeric; v_a numeric; v_b numeric; v_err text;
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
  v_err := public._pin_verify(auth.uid(), p_pin);
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
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

drop function if exists public.my_wallet();
create or replace function public.my_wallet()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'blocked', public.wallet_blocked(auth.uid()),
    'free_until', public.free_until(auth.uid()),
    'free_days_left', greatest(0, ceil(extract(epoch from (public.free_until(auth.uid()) - now())) / 86400))::int,
    'wallet_id', (select wallet_id from profiles where id = auth.uid()),
    'discount_pct', public._wallet_discount_pct(),
    'has_pin', exists (select 1 from wallet_security where user_id = auth.uid() and pin_hash is not null),
    'pin_locked_until', (select locked_until from wallet_security where user_id = auth.uid() and locked_until > now()),
    'transfer_limit', coalesce((select value::numeric from app_settings where key = 'wallet_daily_transfer_limit'), 0),
    'transferred_today', public._transferred_today(auth.uid()),
    'is_admin', auth.uid() is not null and public._is_admin());
$$;

grant execute on function public.wallet_transfer(text, numeric, text, text) to authenticated;
grant execute on function public.pay_from_wallet(text, uuid, int, text) to authenticated;
grant execute on function public.my_wallet() to authenticated;
