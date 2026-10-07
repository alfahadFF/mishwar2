-- الدفع وإنهاء التكسي (4 من 39): إنشاء الرمز السري أو تغييره
drop function if exists public.set_wallet_pin(text, text);
create or replace function public.set_wallet_pin(p_new text, p_old text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_err text; v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if coalesce(p_new, '') !~ '^\d{4}$' then raise exception 'PIN_FORMAT'; end if;
  if p_new in ('0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321') then raise exception 'PIN_WEAK'; end if;
  if exists (select 1 from wallet_security where user_id = auth.uid() and pin_hash is not null) then
    v_err := public._pin_verify(auth.uid(), p_old);
    if v_err is not null then return jsonb_build_object('error', v_err); end if;
  end if;
  insert into wallet_security(user_id, pin_hash, pin_salt, failed, locked_until, updated_at)
  values (auth.uid(), public._pin_hash(auth.uid(), p_new, v_salt), v_salt, 0, null, now())
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt,
       failed = 0, locked_until = null, updated_at = now();
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.set_wallet_pin(text, text) to authenticated;
