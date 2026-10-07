-- =====================================================================
-- دوال قراءة لشاشات التطبيق: طلباتي (نقل) + عروض الناقل + بيانات مركبة السائق
-- آمن للتكرار. لا يغيّر أي جدول.
-- =====================================================================

-- بيانات السائق ومركبته من حسابه
drop function if exists public.my_driver_profile();
create or replace function public.my_driver_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', full_name, 'phone', phone, 'vehicle_class', vehicle_class,
           'event_vehicle_type', event_vehicle_type, 'vehicle_seats', vehicle_seats, 'vehicle_model', vehicle_model,
           'vehicle_year', vehicle_year, 'vehicle_color', vehicle_color, 'vehicle_photo_url', vehicle_photo_url,
           'svc_events', svc_events, 'svc_wedding', svc_wedding)
    from profiles where id = auth.uid();
$$;

-- الزبون: طلبات النقل، وبيانات الناقل بعد الاتفاق فقط
drop function if exists public.my_cargo_orders();
create or replace function public.my_cargo_orders()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'status', o.status, 'created_at', o.created_at, 'cargo_type', o.cargo_type,
           'vehicle_class', o.vehicle_class, 'pickup_points', o.pickup_points,
           'dropoff_points', coalesce(o.dropoff_points, o.delivery_points), 'route_info', o.route_info,
           'timing_type', o.timing_type, 'scheduled_date', o.scheduled_date, 'scheduled_time', o.scheduled_time,
           'budget_type', o.budget_type, 'budget_from', o.budget_from, 'budget_to', o.budget_to,
           'agreed_price', o.agreed_price, 'accepted_via', o.accepted_via, 'accepted_at', o.accepted_at,
           'carrier_name', case when o.status in ('accepted','completed') then p.full_name end,
           'carrier_phone', case when o.status in ('accepted','completed') then p.phone end,
           'carrier_vehicle', p.vehicle_class)
    from cargo_orders o left join profiles p on p.id = o.carrier_id
   where o.customer_id = auth.uid()
   order by o.created_at desc limit 50;
$$;

-- الزبون: عروض الناقلين على طلبه مع فئة المركبة (بدون الهوية)
drop function if exists public.customer_cargo_offers(uuid);
create or replace function public.customer_cargo_offers(p_order uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'price', f.offered_price, 'message', f.message, 'status', f.status,
           'created_at', f.created_at, 'carrier_vehicle', p.vehicle_class)
    from cargo_offers f
    join cargo_orders o on o.id = f.cargo_order_id
    left join profiles p on p.id = f.driver_id
   where o.id = p_order and o.customer_id = auth.uid() and f.status in ('pending','accepted')
   order by f.offered_price;
$$;

-- الناقل: عروضه المعلّقة والمرفوضة
drop function if exists public.carrier_my_cargo_offers();
create or replace function public.carrier_my_cargo_offers()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'order_id', o.id, 'price', f.offered_price, 'status', f.status,
           'created_at', f.created_at, 'order_status', o.status, 'cargo_type', o.cargo_type,
           'pickup_points', o.pickup_points, 'dropoff_points', coalesce(o.dropoff_points, o.delivery_points))
    from cargo_offers f join cargo_orders o on o.id = f.cargo_order_id
   where f.driver_id = auth.uid() and f.status in ('pending','rejected')
   order by f.created_at desc limit 50;
$$;

grant execute on function public.my_driver_profile() to authenticated;
grant execute on function public.my_cargo_orders() to authenticated;
grant execute on function public.customer_cargo_offers(uuid) to authenticated;
grant execute on function public.carrier_my_cargo_offers() to authenticated;
grant execute on function public.carrier_complete_cargo(uuid) to authenticated;

select 'دوال الشاشات' as "الفحص", count(*)::text || ' من 4' as "النتيجة" from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('my_driver_profile','my_cargo_orders','customer_cargo_offers','carrier_my_cargo_offers');
