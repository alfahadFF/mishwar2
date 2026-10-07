-- الدفع وإنهاء التكسي (3 من 39): التحقق من الرمز السري
create or replace function public._pin_verify(p_user uuid, p_pin text)
returns text language plpgsql security definer set search_path = public as $$
declare s wallet_security;
begin
  select * into s from wallet_security where user_id = p_user for update;
  if s.user_id is null or s.pin_hash is null then return 'PIN_REQUIRED'; end if;
  if s.locked_until is not null and s.locked_until > now() then return 'PIN_LOCKED'; end if;
  if nullif(btrim(coalesce(p_pin, '')), '') is null then return 'PIN_ENTER'; end if;   -- بلا رمز: لا تُحسب محاولة
  if coalesce(p_pin, '') !~ '^\d{4}$' or public._pin_hash(p_user, p_pin, s.pin_salt) <> s.pin_hash then
    update wallet_security set failed = failed + 1,
           locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' end, updated_at = now()
     where user_id = p_user;
    return case when s.failed + 1 >= 5 then 'PIN_LOCKED' else 'PIN_WRONG' end;
  end if;
  update wallet_security set failed = 0, locked_until = null where user_id = p_user and (failed > 0 or locked_until is not null);
  return null;
end; $$;
revoke all on function public._pin_verify(uuid, text) from public, anon, authenticated;
