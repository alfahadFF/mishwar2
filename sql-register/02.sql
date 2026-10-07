-- التسجيل (2 من 4): إنشاء الملف الشخصي تلقائياً عند التسجيل + رمز الدعوة
create or replace function public._on_auth_user_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare v jsonb; v_inviter uuid; v_code text; v_ours boolean;
begin
  v_ours := lower(split_part(coalesce(new.email, ''), '@', 2)) = 'users.mishwar.app';
  if v_ours then
    v := public._parse_phone('+' || split_part(new.email, '@', 1));
    if v is null then raise exception 'BAD_PHONE'; end if;
    if coalesce(new.raw_user_meta_data->>'terms', '') <> 'true' then raise exception 'TERMS_REQUIRED'; end if;
  end if;
  insert into profiles(id, phone, country, terms_accepted_at)
  values (new.id, v->>'phone', v->>'country', case when v_ours then now() end)
  on conflict (id) do nothing;
  v_code := regexp_replace(coalesce(new.raw_user_meta_data->>'invite', ''), '\D', '', 'g');
  if v_code <> '' then
    select id into v_inviter from profiles where wallet_id = v_code and id <> new.id;
    if v_inviter is not null then
      insert into loyalty_accounts(user_id, invited_by) values (new.id, v_inviter) on conflict (user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public._on_auth_user_created() from public, anon, authenticated;
drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function public._on_auth_user_created();

-- فحص رمز الدعوة قبل إنشاء الحساب
create or replace function public.invite_code_valid(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where wallet_id = regexp_replace(coalesce(p_code, ''), '\D', '', 'g'));
$$;
grant execute on function public.invite_code_valid(text) to anon, authenticated;
