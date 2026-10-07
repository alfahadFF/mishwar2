-- نهاية الفترة المجانية = تاريخ التسجيل + عدد الأيام المجانية
create or replace function public.free_until(p_user uuid)
returns timestamptz language sql stable security definer set search_path = public, auth as $$
  select u.created_at + make_interval(days => coalesce((select value::int from public.app_settings where key = 'free_days'), 0))
    from auth.users u where u.id = p_user;
$$;
revoke all on function public.free_until(uuid) from public, anon, authenticated;
