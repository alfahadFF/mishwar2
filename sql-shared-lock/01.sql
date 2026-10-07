-- قفل تعديل الرحلة المشتركة بعد انضمام ركاب (قسم واحد)
create or replace function public._shared_has_riders(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from taxi_shared_requests r where r.trip_id = p_trip
                  and r.status in ('pending','counter','accepted','confirmed'));
$$;
revoke execute on function public._shared_has_riders(uuid) from public, anon;
grant execute on function public._shared_has_riders(uuid) to authenticated;

-- بدون security definer عمداً: حتى نعرف إذا التعديل جاي مباشرة من المستخدم أو من دالة رسمية
create or replace function public._shared_trip_lock()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.price_per_seat, new.departure_time, new.pickup_lat, new.pickup_lng, new.pickup_text,
          new.dropoff_lat, new.dropoff_lng, new.dropoff_text, new.route, new.route_polyline, new.duration_min,
          new.vehicle_category, new.currency, new.total_seats, new.available_seats)
         is distinct from
         (old.price_per_seat, old.departure_time, old.pickup_lat, old.pickup_lng, old.pickup_text,
          old.dropoff_lat, old.dropoff_lng, old.dropoff_text, old.route, old.route_polyline, old.duration_min,
          old.vehicle_category, old.currency, old.total_seats, old.available_seats)
     and public._shared_has_riders(old.id) then
    raise exception 'TRIP_LOCKED';
  end if;
  return new;
end; $$;
drop trigger if exists trg_shared_trip_lock on public.taxi_shared_trips;
create trigger trg_shared_trip_lock before update on public.taxi_shared_trips
  for each row execute function public._shared_trip_lock();

select case when exists (select 1 from pg_trigger where tgname = 'trg_shared_trip_lock') then 'تم ✓' else 'ناقص' end as النتيجة;
