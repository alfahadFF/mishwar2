-- الجزء 9 من 14 — الدوال

create or replace function public.carrier_cargo_feed(p_lat double precision, p_lng double precision, p_radius_km double precision default 10)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare v_class text;
begin
  select vehicle_class into v_class from profiles where id = auth.uid();
  if v_class is null or public.wallet_blocked(auth.uid()) then return; end if;
  return query
  select jsonb_build_object(
    'id', q.id, 'created_at', q.created_at, 'cargo_type', q.cargo_type, 'weight_kg', q.weight_kg,
    'vehicle_class', q.vehicle_class, 'pickup_points', q.pickup_points,
    'dropoff_points', coalesce(q.dropoff_points, q.delivery_points), 'route_info', q.route_info,
    'need_workers', q.need_workers, 'workers_count', q.workers_count,
    'need_equipment', q.need_equipment, 'equipment_detail', q.equipment_detail,
    'lift_down', q.lift_down, 'floor_from', q.floor_from, 'elevator_from', q.elevator_from,
    'lift_up', q.lift_up, 'floor_to', q.floor_to, 'elevator_to', q.elevator_to, 'floor_note', q.floor_note,
    'timing_type', q.timing_type, 'scheduled_date', q.scheduled_date, 'scheduled_time', q.scheduled_time,
    'budget_type', q.budget_type, 'budget_from', q.budget_from, 'budget_to', q.budget_to,
    'distance_km', round(q.dist::numeric, 2),
    'my_offer_id', q.offer_id, 'my_offer_price', q.offer_price, 'my_offer_status', q.offer_status)
  from (
    select o.*, f.id as offer_id, f.offered_price as offer_price, f.status as offer_status,
           2 * 6371 * asin(sqrt(
             power(sin(radians(((o.pickup_points->0->>'lat')::float8 - p_lat) / 2)), 2) +
             cos(radians(p_lat)) * cos(radians((o.pickup_points->0->>'lat')::float8)) *
             power(sin(radians(((o.pickup_points->0->>'lng')::float8 - p_lng) / 2)), 2))) as dist
    from cargo_orders o
    left join cargo_offers f on f.cargo_order_id = o.id and f.driver_id = auth.uid() and f.status <> 'withdrawn'
    where o.status = 'open'
      and o.pickup_points->0->>'lat' is not null
      and public.cargo_vehicle_fits(o.vehicle_class, v_class)
  ) q
  where q.dist <= p_radius_km
  order by q.dist;
end; $$;
