-- الرحلة المشتركة (10 من 22): السائق: بدء الرحلة المشتركة
drop function if exists public.driver_start_shared_trip(uuid);
create or replace function public.driver_start_shared_trip(p_trip uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t taxi_shared_trips; v_n int := 0; v_fee numeric := 0; r record;
begin
  select * into t from taxi_shared_trips where id = p_trip for update;
  if t.id is null or t.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if t.status not in ('pending','full') or t.started_at is not null then raise exception 'BAD_STEP'; end if;
  perform set_config('app.shared_rpc', '1', true);
  update taxi_shared_trips set started_at = now() where id = t.id;
  for r in select id, passenger_id from taxi_shared_requests where trip_id = t.id and status = 'confirmed' loop
    v_fee := v_fee + public._shared_charge(r.id); v_n := v_n + 1;
    insert into user_notifications(user_id, kind, title, body, data)
    values (r.passenger_id, 'shared_started', 'انطلقت الرحلة', 'السائق بدأ الرحلة المشتركة', jsonb_build_object('trip_id', t.id));
  end loop;
  return jsonb_build_object('started', true, 'passengers', v_n, 'commission', v_fee);
end; $$;
grant execute on function public.driver_start_shared_trip(uuid) to authenticated;
