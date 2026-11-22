-- الدفع وإنهاء التكسي (44): إخفاء الرحلة من «الطلب الحالي» بعد تأكيد الدفع النقدي.
-- تبقى الرحلة وسجل الدفع محفوظين، لكن شاشة إنشاء الطلب تعود للحالة الافتراضية.
create or replace function public.my_taxi_active()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
      'id', o.id,
      'status', o.status,
      'fare', coalesce(o.final_fare, o.estimated_fare),
      'fare_local', o.fare_local,
      'local_currency', o.local_currency,
      'pricing_exchange_rate', o.pricing_exchange_rate,
      'commission_rate', o.commission_rate,
      'commission_local', o.commission_local,
      'driver_net_local', o.driver_net_local,
      'distance_km', o.distance_km,
      'duration_min', o.duration_min,
      'search_radius_km', o.search_radius_km,
      'category', o.vehicle_category,
      'pickup', jsonb_build_array(o.pickup_lat, o.pickup_lng),
      'dropoff', jsonb_build_array(o.dropoff_lat, o.dropoff_lng),
      'driver_name', case when o.status in ('accepted','arrived','in_progress') then p.full_name end,
      'vehicle_model', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_model end,
      'vehicle_color', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_color end,
      'vehicle_plate', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_plate end,
      'discount_pct', public._wallet_discount_pct(),
      'completed_at', o.completed_at,
      'cash_paid_at', o.cash_paid_at,
      'payment_method', case when o.cash_paid_at is not null then 'cash' end)
    from public.taxi_orders o
    left join public.profiles p on p.id = o.driver_id
   where o.user_id = auth.uid()
     and (o.status in ('pending','searching','accepted','arrived','in_progress')
          or (o.status = 'completed'
              and o.completed_at > now() - interval '1 day'
              and o.cash_paid_at is null
              and not exists (
                select 1 from public.wallet_payments w
                 where w.service = 'taxi' and w.ref_id = o.id
              )))
   order by o.created_at desc
   limit 1;
$$;
grant execute on function public.my_taxi_active() to authenticated;

notify pgrst, 'reload schema';
