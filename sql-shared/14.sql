-- الرحلة المشتركة (14 من 22): السائق: ركاب الرحلة (بدون اسم)
drop function if exists public.driver_shared_passengers(uuid);
create or replace function public.driver_shared_passengers(p_trip uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('request_id', r.id, 'seats', r.seats_requested, 'extra_fee', r.extra_fee,
           'fare', t.price_per_seat * r.seats_requested + coalesce(r.extra_fee, 0),
           'pickup', jsonb_build_array(r.pickup_lat, r.pickup_lng), 'dropoff', jsonb_build_array(r.dropoff_lat, r.dropoff_lng),
           'phone', p.phone,
           'paid', exists (select 1 from wallet_payments w where w.service = 'taxi_shared' and w.ref_id = r.id))
    from taxi_shared_requests r join taxi_shared_trips t on t.id = r.trip_id left join profiles p on p.id = r.passenger_id
   where r.trip_id = p_trip and t.driver_id = auth.uid() and r.status = 'confirmed'
   order by r.created_at;
$$;
grant execute on function public.driver_shared_passengers(uuid) to authenticated;
