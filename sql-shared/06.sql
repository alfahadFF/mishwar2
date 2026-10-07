-- الرحلة المشتركة (6 من 22): شروط نشر رحلة جديدة
create or replace function public._shared_publish_check(n taxi_shared_trips)
returns void language plpgsql security definer set search_path = public as $$
declare d date := (n.departure_time at time zone 'Asia/Damascus')::date;
begin
  if public._taxi_suspended(n.driver_id) then raise exception 'TAXI_SUSPENDED'; end if;
  perform public._shared_auto_close(n.driver_id);
  if exists (select 1 from taxi_shared_trips where driver_id = n.driver_id and status in ('pending','full')
              and started_at is null and departure_time < now()) then raise exception 'SHARED_NOT_STARTED'; end if;
  if (select count(*) from taxi_shared_trips where driver_id = n.driver_id and status <> 'cancelled'
       and (departure_time at time zone 'Asia/Damascus')::date = d) >= 4 then raise exception 'SHARED_DAILY_LIMIT'; end if;
  if exists (select 1 from taxi_shared_trips t where t.driver_id = n.driver_id and t.status in ('pending','full')
              and n.departure_time < t.departure_time + make_interval(mins => coalesce(t.duration_min, 60))
              and t.departure_time < n.departure_time + make_interval(mins => coalesce(n.duration_min, 60)))
    then raise exception 'SHARED_OVERLAP'; end if;
end; $$;
revoke all on function public._shared_publish_check(taxi_shared_trips) from public, anon, authenticated;
