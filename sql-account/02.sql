-- حسابي (2 من 4): بيانات الحساب وتعديل الاسم
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles alter column phone drop not null;
alter table public.profiles alter column email drop not null;

-- بيانات شاشة «حسابي»
create or replace function public.my_account()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('phone', phone, 'wallet_id', wallet_id, 'full_name', full_name,
                            'type', type::text, 'country', country)
    from profiles where id = auth.uid();
$$;

-- الاسم اختياري: الفراغ يمسحه، والحد 40 حرفاً
create or replace function public.set_my_name(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if char_length(v) > 40 then raise exception 'NAME_TOO_LONG'; end if;
  update profiles set full_name = v, updated_at = now() where id = auth.uid();
  return jsonb_build_object('full_name', v);
end; $$;

revoke execute on function public.my_account() from public, anon;
revoke execute on function public.set_my_name(text) from public, anon;
grant execute on function public.my_account() to authenticated;
grant execute on function public.set_my_name(text) to authenticated;
