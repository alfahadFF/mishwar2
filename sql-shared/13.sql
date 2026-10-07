-- الرحلة المشتركة (13 من 22): السائق: رحلاتي المشتركة
drop function if exists public.driver_my_shared_trips();
create or replace function public.driver_my_shared_trips()
returns setof jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._shared_auto_close(auth.uid());
  return query
  select to_jsonb(t) - 'route' - 'route_polyline' || jsonb_build_object(
           'passengers', (select count(*) from taxi_shared_requests r where r.trip_id = t.id and r.status = 'confirmed'),
           'overdue', t.started_at is null and t.departure_time < now())
    from taxi_shared_trips t
   where t.driver_id = auth.uid() and t.status in ('pending','full')
   order by t.departure_time;
end; $$;
grant execute on function public.driver_my_shared_trips() to authenticated;
