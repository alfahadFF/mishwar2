-- الرحلة المشتركة (11 من 22): السائق: إنهاء الرحلة المشتركة
drop function if exists public.driver_complete_shared_trip(uuid);
create or replace function public.driver_complete_shared_trip(p_trip uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t taxi_shared_trips;
begin
  select * into t from taxi_shared_trips where id = p_trip for update;
  if t.id is null or t.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if t.started_at is null or t.status not in ('pending','full') then raise exception 'BAD_STEP'; end if;
  perform set_config('app.shared_rpc', '1', true);
  update taxi_shared_trips set status = 'completed', completed_at = now() where id = t.id;
  update taxi_shared_requests set status = 'cancelled', updated_at = now() where trip_id = t.id and status in ('pending','counter');
  return jsonb_build_object('status', 'completed');
end; $$;
grant execute on function public.driver_complete_shared_trip(uuid) to authenticated;
