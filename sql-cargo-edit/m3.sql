-- تعديل طلب النقل (3 من 3): عرض التعديل للناقل والزبون
-- الناقل يرى الملاحظات وآخر تعديل من الزبون
drop function if exists public.carrier_my_cargo_jobs();
create or replace function public.carrier_my_cargo_jobs()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'cargo_type', o.cargo_type, 'vehicle_class', o.vehicle_class,
    'pickup_points', o.pickup_points, 'dropoff_points', coalesce(o.dropoff_points, o.delivery_points),
    'route_info', o.route_info, 'timing_type', o.timing_type,
    'scheduled_date', o.scheduled_date, 'scheduled_time', o.scheduled_time, 'notes', o.notes,
    'edited_at', o.edited_at, 'edited_fields', o.edited_fields,
    'agreed_price', o.agreed_price, 'commission_amount', o.commission_amount, 'accepted_at', o.accepted_at,
    'customer_name', p.full_name, 'customer_phone', p.phone)
  from cargo_orders o left join profiles p on p.id = o.customer_id
  where o.carrier_id = auth.uid() and o.status in ('accepted','completed')
  order by o.accepted_at desc nulls last;
$$;

-- الزبون: طلباته مع الملاحظات
drop function if exists public.my_cargo_orders();
create or replace function public.my_cargo_orders()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'status', o.status, 'created_at', o.created_at, 'cargo_type', o.cargo_type,
           'vehicle_class', o.vehicle_class, 'pickup_points', o.pickup_points,
           'dropoff_points', coalesce(o.dropoff_points, o.delivery_points), 'route_info', o.route_info,
           'timing_type', o.timing_type, 'scheduled_date', o.scheduled_date, 'scheduled_time', o.scheduled_time,
           'notes', o.notes, 'edited_at', o.edited_at,
           'budget_type', o.budget_type, 'budget_from', o.budget_from, 'budget_to', o.budget_to,
           'agreed_price', o.agreed_price, 'accepted_via', o.accepted_via, 'accepted_at', o.accepted_at,
           'carrier_name', case when o.status in ('accepted','completed') then p.full_name end,
           'carrier_phone', case when o.status in ('accepted','completed') then p.phone end,
           'carrier_vehicle', p.vehicle_class)
    from cargo_orders o left join profiles p on p.id = o.carrier_id
   where o.customer_id = auth.uid()
   order by o.created_at desc limit 50;
$$;

grant execute on function public.carrier_my_cargo_jobs() to authenticated;
grant execute on function public.my_cargo_orders() to authenticated;

select 'دوال التعديل' as الفحص,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('edit_cargo_order','cancel_cargo_order','carrier_my_cargo_jobs','my_cargo_orders'))::text || ' من 4' as النتيجة
union all
select 'التعديل المباشر على الطلب',
       case when exists (select 1 from pg_policies where tablename = 'cargo_orders' and cmd in ('UPDATE','DELETE','ALL'))
            then 'ما زال مفتوحاً' else 'مغلق' end
union all
select 'قراءة الطلبات',
       case when exists (select 1 from pg_policies where tablename = 'cargo_orders' and policyname = 'cargo_select_all')
            then 'للجميع' else 'الزبون والناقل فقط' end;
