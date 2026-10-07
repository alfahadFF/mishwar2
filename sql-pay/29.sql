-- الدفع وإنهاء التكسي (29 من 39): رحلة السائق الحالية
drop function if exists public.driver_taxi_active();
create or replace function public.driver_taxi_active()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'status', o.status, 'fare', o.estimated_fare, 'distance_km', o.distance_km,
      'pickup', jsonb_build_array(o.pickup_lat, o.pickup_lng), 'dropoff', jsonb_build_array(o.dropoff_lat, o.dropoff_lng),
      'customer_phone', p.phone)
    from taxi_orders o left join profiles p on p.id = o.user_id
   where o.driver_id = auth.uid() and o.status in ('accepted','arrived','in_progress')
   order by o.accepted_at desc limit 1;
$$;
grant execute on function public.driver_taxi_active() to authenticated;
