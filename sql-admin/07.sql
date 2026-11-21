-- الإدارة (7): تبديل نوع حساب الأدمن نفسه للاختبار فقط.
-- لا يقبل معرف مستخدم مستهدف، ولا يغيّر صلاحيات is_admin/account_type أو بيانات العمل.
create or replace function public.admin_test_set_my_account_type(p_type text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'NOT_AUTH'; end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = me
       and (p.is_admin or p.account_type::text = 'admin' or p.type::text = 'admin')
  ) then
    raise exception 'NOT_ALLOWED';
  end if;
  if coalesce(p_type, '') not in ('personal', 'driver', 'transporter', 'business') then
    raise exception 'BAD_TYPE';
  end if;
  update public.profiles
     set type = p_type::public.user_type, updated_at = now()
   where id = me;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  return jsonb_build_object('type', p_type);
end; $$;

revoke execute on function public.admin_test_set_my_account_type(text) from public, anon;
grant execute on function public.admin_test_set_my_account_type(text) to authenticated;
