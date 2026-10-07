-- إلغاءات السائق (12 من 16): حالة السائق (رسالة الإيقاف)
drop function if exists public.my_driver_status();
create or replace function public.my_driver_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'taxi_suspended', coalesce(p.taxi_suspended, false),
    'message', case when p.taxi_suspended then 'تم إيقاف استقبال الطلبات بسبب كثرة الإلغاءات، تواصل مع الإدارة' end,
    'cancel_count', public._taxi_cancel_count(auth.uid()),
    'next_suspend_at', coalesce(p.taxi_cancel_base, 0) + 10)
  from profiles p where p.id = auth.uid();
$$;
grant execute on function public.my_driver_status() to authenticated;
