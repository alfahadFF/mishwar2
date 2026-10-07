-- الدفع وإنهاء التكسي (28 من 39): رحلة الراكب الحالية
drop function if exists public.my_taxi_active();
create or replace function public.my_taxi_active()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'status', o.status, 'fare', coalesce(o.final_fare, o.estimated_fare),
      'distance_km', o.distance_km, 'category', o.vehicle_category,
      'pickup', jsonb_build_array(o.pickup_lat, o.pickup_lng), 'dropoff', jsonb_build_array(o.dropoff_lat, o.dropoff_lng),
      'driver_name', p.full_name, 'vehicle_model', p.vehicle_model, 'vehicle_color', p.vehicle_color,
      'discount_pct', public._wallet_discount_pct(), 'completed_at', o.completed_at)
    from taxi_orders o left join profiles p on p.id = o.driver_id
   where o.user_id = auth.uid()
     and (o.status in ('pending','searching','accepted','arrived','in_progress')
          or (o.status = 'completed' and o.completed_at > now() - interval '1 day'
              and not exists (select 1 from wallet_payments w where w.service = 'taxi' and w.ref_id = o.id)))
   order by o.created_at desc limit 1;
$$;
grant execute on function public.my_taxi_active() to authenticated;
