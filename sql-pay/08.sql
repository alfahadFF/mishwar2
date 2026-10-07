-- الدفع وإنهاء التكسي (8 من 39): التحويل بين المستخدمين
drop function if exists public.wallet_transfer(text, numeric, text);
drop function if exists public.wallet_transfer(text, numeric, text, text);
create or replace function public.wallet_transfer(p_to text, p_amount numeric, p_note text default null, p_pin text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_to uuid := public._wallet_lookup(p_to); v_from_after numeric; v_amt numeric;
        v_err text; v_lim jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if v_to is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_to = auth.uid() then raise exception 'SELF_TRANSFER'; end if;
  v_amt := round(coalesce(p_amount, 0), 2);
  if v_amt <= 0 then raise exception 'BAD_AMOUNT'; end if;
  v_err := public._pin_verify(auth.uid(), p_pin);
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  v_lim := public._transfer_limit_check(auth.uid(), v_amt);
  if v_lim is not null then return v_lim; end if;
  v_from_after := public._transfer_move(auth.uid(), v_to, v_amt, p_note);
  return jsonb_build_object('amount', v_amt, 'balance', v_from_after);
end; $$;
grant execute on function public.wallet_transfer(text, numeric, text, text) to authenticated;
