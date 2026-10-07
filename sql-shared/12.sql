-- الرحلة المشتركة (12 من 22): السائق: تحديث موقعه أثناء الرحلة
drop function if exists public.driver_shared_position(uuid, float8, float8);
create or replace function public.driver_shared_position(p_trip uuid, p_lat float8, p_lng float8)
returns void language plpgsql security definer set search_path = public as $$
begin
  update taxi_shared_trips set driver_lat = p_lat, driver_lng = p_lng, driver_pos_at = now()
   where id = p_trip and driver_id = auth.uid() and started_at is not null and status in ('pending','full');
  if not found then raise exception 'NOT_ALLOWED'; end if;
end; $$;
grant execute on function public.driver_shared_position(uuid, float8, float8) to authenticated;
