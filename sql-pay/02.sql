-- الدفع وإنهاء التكسي (2 من 39): صلاحية المدير وتشفير الرمز
create or replace function public._is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or exists (select 1 from profiles where id = auth.uid() and (account_type::text = 'admin' or type::text = 'admin'));
$$;

create or replace function public._pin_hash(p_user uuid, p_pin text, p_salt text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p_user::text || ':' || p_pin || ':' || p_salt, 'UTF8')), 'hex');
$$;
revoke all on function public._pin_hash(uuid, text, text) from public, anon, authenticated;
grant execute on function public._is_admin() to authenticated;
