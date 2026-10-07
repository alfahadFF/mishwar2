-- تكسي المطار (6 من 8): رابط مشاركة الرحلة وصفحة الطوارئ تعرف طلب المطار
create or replace function public._share_ctx(p_service text, p_ref uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_service = 'taxi' then
    select jsonb_build_object('customer', user_id, 'driver', driver_id, 'active', status in ('accepted','arrived','in_progress'),
             'from', jsonb_build_array(pickup_lat, pickup_lng), 'to', jsonb_build_array(dropoff_lat, dropoff_lng),
             'from_text', pickup_text, 'to_text', dropoff_text) into r from taxi_orders where id = p_ref;
  elsif p_service = 'taxi_shared' then
    select jsonb_build_object('customer', q.passenger_id, 'driver', t.driver_id,
             'active', q.status = 'confirmed' and t.status not in ('completed','cancelled'),
             'from', jsonb_build_array(coalesce(q.pickup_lat, t.pickup_lat), coalesce(q.pickup_lng, t.pickup_lng)),
             'to', jsonb_build_array(coalesce(q.dropoff_lat, t.dropoff_lat), coalesce(q.dropoff_lng, t.dropoff_lng)),
             'from_text', t.pickup_text, 'to_text', t.dropoff_text)
      into r from taxi_shared_requests q join taxi_shared_trips t on t.id = q.trip_id where q.id = p_ref;
  elsif p_service = 'taxi_shared_trip' then
    select jsonb_build_object('customer', null, 'driver', t.driver_id,
             'active', t.started_at is not null and t.status not in ('completed','cancelled'),
             'from', jsonb_build_array(t.pickup_lat, t.pickup_lng), 'to', jsonb_build_array(t.dropoff_lat, t.dropoff_lng),
             'from_text', t.pickup_text, 'to_text', t.dropoff_text,
             'passengers', (select coalesce(jsonb_agg(jsonb_build_object('phone', p.phone,
                              'from', jsonb_build_array(q.pickup_lat, q.pickup_lng), 'to', jsonb_build_array(q.dropoff_lat, q.dropoff_lng))), '[]'::jsonb)
                              from taxi_shared_requests q left join profiles p on p.id = q.passenger_id
                             where q.trip_id = t.id and q.status = 'confirmed'))
      into r from taxi_shared_trips t where t.id = p_ref;
  elsif p_service = 'cargo' then
    select jsonb_build_object('customer', customer_id, 'driver', carrier_id, 'active', status in ('accepted','in_progress'),
             'from', jsonb_build_array(pickup_points->0->'lat', pickup_points->0->'lng'),
             'to', jsonb_build_array(d->-1->'lat', d->-1->'lng'),
             'from_text', coalesce(pickup_points->0->>'name', pickup_points->0->>'address'),
             'to_text', coalesce(d->-1->>'name', d->-1->>'address'))
      into r from (select *, coalesce(nullif(dropoff_points, '[]'::jsonb), delivery_points) d from cargo_orders where id = p_ref) c;
  elsif p_service = 'events' then
    select jsonb_build_object('customer', o.user_id, 'driver', f.driver_id, 'active', f.status = 'accepted' and f.completed_at is null,
             'from', jsonb_build_array(o.gathering_lat, o.gathering_lng),
             'to', jsonb_build_array(o.destinations->-1->'lat', o.destinations->-1->'lng'),
             'from_text', o.gathering_point, 'to_text', o.destinations->-1->>'name')
      into r from event_offers f join event_orders o on o.id = f.event_order_id where f.id = p_ref;
  elsif p_service = 'contracts' then
    select jsonb_build_object('customer', o.user_id, 'driver', f.driver_id, 'active', f.status = 'accepted' and f.ended_at is null,
             'from', jsonb_build_array(o.pickup_points->0->'lat', o.pickup_points->0->'lng'),
             'to', jsonb_build_array(o.destinations->0->'lat', o.destinations->0->'lng'),
             'from_text', o.pickup_points->0->>'name', 'to_text', o.destinations->0->>'name')
      into r from contract_offers f join contract_orders o on o.id = f.contract_order_id where f.id = p_ref;
  elsif p_service = 'airport' then
    select jsonb_build_object('customer', o.user_id, 'driver', o.driver_id,
             'active', o.status = 'accepted' and now() > o.trip_at - interval '3 hours',
             'from', case when o.kind = 'arrival' then jsonb_build_array(a.lat, a.lng) else jsonb_build_array(o.pickup_lat, o.pickup_lng) end,
             'to', case when o.kind = 'arrival' then jsonb_build_array(o.pickup_lat, o.pickup_lng) else jsonb_build_array(a.lat, a.lng) end,
             'from_text', case when o.kind = 'arrival' then a.name else o.pickup_label end,
             'to_text', case when o.kind = 'arrival' then o.pickup_label else a.name end)
      into r from airport_orders o join airports a on a.code = o.airport_code where o.id = p_ref;
  end if;
  return r;
end; $$;
revoke execute on function public._share_ctx(text, uuid) from public, anon, authenticated;
