-- الحوافز (6 من 7): أولوية طلبات التكسي حسب المستوى
-- كم ثانية لازم ينطر هالسائق قبل ما يقبل الطلب (0 = فوراً)
create or replace function public._taxi_priority_wait(p_order uuid, p_driver uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare o record; v_mine int; v_best int;
begin
  select pickup_lat, pickup_lng, vehicle_category, coalesce(search_radius_km, 5) rad into o from taxi_orders where id = p_order;
  if o.pickup_lat is null then return 0; end if;
  v_mine := public._level_delay(public._provider_level(p_driver));
  if v_mine = 0 then return 0; end if;
  select min(public._level_delay(public._provider_level(d.driver_id))) into v_best
    from taxi_driver_positions d
   where d.driver_id <> p_driver and d.updated_at > now() - interval '3 minutes'
     and d.category = o.vehicle_category
     and 6371 * 2 * asin(sqrt(power(sin(radians(d.lat - o.pickup_lat) / 2), 2)
         + cos(radians(o.pickup_lat)) * cos(radians(d.lat)) * power(sin(radians(d.lng - o.pickup_lng) / 2), 2))) <= o.rad;
  if v_best is null or v_best >= v_mine then return 0; end if;
  return v_mine - v_best;
end;
$$;
revoke execute on function public._taxi_priority_wait(uuid, uuid) from public, anon, authenticated;

-- للتطبيق: الثواني الباقية قبل ما يطلع الطلب لهالسائق
create or replace function public.taxi_priority_wait(p_order uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, ceil(extract(epoch from (o.created_at + make_interval(secs => public._taxi_priority_wait(o.id, auth.uid())) - now()))))::int
    from taxi_orders o where o.id = p_order and auth.uid() is not null;
$$;
grant execute on function public.taxi_priority_wait(uuid) to authenticated;

-- حماية بالسيرفر: ما بيقدر يقبل قبل دوره
create or replace function public._taxi_priority_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.driver_id is null and new.driver_id is not null and old.status = 'pending'
     and old.created_at + make_interval(secs => public._taxi_priority_wait(new.id, new.driver_id)) > now() then
    raise exception 'TAXI_PRIORITY';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_taxi_priority on public.taxi_orders;
create trigger trg_taxi_priority before update of driver_id on public.taxi_orders
  for each row execute function public._taxi_priority_guard();
