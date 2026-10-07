-- الدفع وإنهاء التكسي (38 من 39): الدفع من التطبيق
drop function if exists public.pay_from_wallet(text, uuid, int);
drop function if exists public.pay_from_wallet(text, uuid, int, text);
create or replace function public.pay_from_wallet(p_service text, p_ref uuid, p_period int default 1, p_pin text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; v_payee uuid; v_err text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  select x into it from public.my_payables() x
   where x->>'service' = p_service and (x->>'ref_id')::uuid = p_ref and (x->>'period')::int = coalesce(p_period, 1);
  if it is null then
    if exists (select 1 from wallet_payments where service = p_service and ref_id = p_ref and period = coalesce(p_period, 1))
      then raise exception 'ALREADY_PAID'; end if;
    raise exception 'NOT_PAYABLE';
  end if;
  v_err := public._pin_verify(auth.uid(), p_pin);
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  v_payee := public._payable_payee(p_service, p_ref);
  perform public._pay_record(it, auth.uid(), v_payee);
  return jsonb_build_object('paid', (it->>'to_pay')::numeric, 'discount', (it->>'discount')::numeric,
    'balance', (select balance from wallets where user_id = auth.uid()));
end; $$;
grant execute on function public.pay_from_wallet(text, uuid, int, text) to authenticated;
