-- إلغاءات السائق (7 من 16): السائق يلغي رحلة مشتركة
drop function if exists public.driver_cancel_shared_trip(uuid, text, text);
create or replace function public.driver_cancel_shared_trip(p_trip uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t taxi_shared_trips; r jsonb := jsonb_build_object('counted', false);
begin
  select * into t from taxi_shared_trips where id = p_trip for update;
  if t.id is null or t.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if t.status not in ('pending','full') then raise exception 'BAD_STEP'; end if;
  if exists (select 1 from taxi_shared_requests where trip_id = t.id and status = 'confirmed') then
    r := public._register_cancel(auth.uid(), 'shared', t.id, p_reason, p_note) || jsonb_build_object('counted', true);
    insert into user_notifications(user_id, kind, title, body, data)
    select passenger_id, 'shared_trip_cancelled', 'أُلغيت الرحلة المشتركة', 'السائق ألغى الرحلة', jsonb_build_object('trip_id', t.id)
      from taxi_shared_requests where trip_id = t.id and status = 'confirmed';
  end if;
  perform set_config('app.shared_cancel', '1', true);
  update taxi_shared_requests set status = 'cancelled', updated_at = now() where trip_id = t.id and status in ('pending','counter','confirmed');
  update taxi_shared_trips set status = 'cancelled' where id = t.id;
  return r;
end; $$;
grant execute on function public.driver_cancel_shared_trip(uuid, text, text) to authenticated;
