-- توفّر التكسي (1 من 5): فئة سيارة السائق + حالة السائق
alter table public.profiles add column if not exists taxi_category text;
alter table public.profiles drop constraint if exists profiles_taxi_category_check;
alter table public.profiles add constraint profiles_taxi_category_check
  check (taxi_category is null or taxi_category in ('ordinary','economy','luxury','van_8','van_11'));

create or replace function public._taxi_category(p_driver uuid)
returns text language sql stable security definer set search_path = public as $$
  select taxi_category from profiles where id = p_driver;
$$;
grant execute on function public._taxi_category(uuid) to authenticated;

drop function if exists public.my_driver_status();
create or replace function public.my_driver_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'taxi_suspended', coalesce(p.taxi_suspended, false),
    'message', case when p.taxi_suspended then 'تم إيقاف استقبال الطلبات بسبب كثرة الإلغاءات، تواصل مع الإدارة' end,
    'cancel_count', public._taxi_cancel_count(auth.uid()),
    'next_suspend_at', coalesce(p.taxi_cancel_base, 0) + 10,
    'taxi_category', p.taxi_category)
  from profiles p where p.id = auth.uid();
$$;
grant execute on function public.my_driver_status() to authenticated;
