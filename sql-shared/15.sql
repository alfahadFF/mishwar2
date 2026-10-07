-- الرحلة المشتركة (15 من 22): الراكب: رحلاتي المشتركة (بدون اتصال)
drop function if exists public.my_shared_joins();
create or replace function public.my_shared_joins()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('request_id', r.id, 'trip_id', t.id, 'status', r.status, 'trip_status', t.status,
           'started', t.started_at is not null, 'departure_time', t.departure_time, 'seats', r.seats_requested,
           'extra_fee', r.extra_fee, 'fare', t.price_per_seat * r.seats_requested + coalesce(r.extra_fee, 0),
           'pickup_text', t.pickup_text, 'dropoff_text', t.dropoff_text,
           'driver_name', p.full_name, 'vehicle_model', p.vehicle_model, 'vehicle_color', p.vehicle_color,
           'discount_pct', public._wallet_discount_pct(),
           'paid', exists (select 1 from wallet_payments w where w.service = 'taxi_shared' and w.ref_id = r.id))
    from taxi_shared_requests r join taxi_shared_trips t on t.id = r.trip_id left join profiles p on p.id = t.driver_id
   where r.passenger_id = auth.uid() and (t.status in ('pending','full') or t.completed_at > now() - interval '1 day')
   order by t.departure_time desc;
$$;
grant execute on function public.my_shared_joins() to authenticated;
