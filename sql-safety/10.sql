-- الأمان والطوارئ (10): لا تُرجع هوية السائق أو بيانات مركبته قبل قبول طلب التكسي.
-- تحديث آمن لدالة موجودة؛ شغّله بعد sql-safety/08.sql على قاعدة موجودة.
create or replace function public.my_taxi_active()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
      'id', o.id, 'status', o.status,
      'fare', coalesce(o.final_fare, o.estimated_fare),
      'distance_km', o.distance_km, 'category', o.vehicle_category,
      'pickup', jsonb_build_array(o.pickup_lat, o.pickup_lng),
      'dropoff', jsonb_build_array(o.dropoff_lat, o.dropoff_lng),
      'driver_name', case when o.status in ('accepted','arrived','in_progress') then p.full_name end,
      'vehicle_model', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_model end,
      'vehicle_color', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_color end,
      'vehicle_plate', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_plate end,
      'driver_pos', case when o.status in ('accepted','arrived','in_progress') then public._live_pos(o.driver_id) end,
      'discount_pct', public._wallet_discount_pct(),
      'completed_at', o.completed_at)
    from public.taxi_orders o
    left join public.profiles p on p.id = o.driver_id
   where o.user_id = auth.uid()
     and (o.status in ('pending','searching','accepted','arrived','in_progress')
          or (o.status = 'completed' and o.completed_at > now() - interval '1 day'
              and not exists (select 1 from public.wallet_payments w
                               where w.service = 'taxi' and w.ref_id = o.id)))
   order by o.created_at desc
   limit 1;
$$;
grant execute on function public.my_taxi_active() to authenticated;
