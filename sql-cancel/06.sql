-- إلغاءات السائق (6 من 16): السائق يلغي رحلة تكسي
drop function if exists public.driver_cancel_taxi(uuid, text, text);
create or replace function public.driver_cancel_taxi(p_order uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o taxi_orders; r jsonb;
begin
  select * into o from taxi_orders where id = p_order for update;
  if o.id is null or o.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status not in ('accepted','arrived') then raise exception 'BAD_STEP'; end if;
  r := public._register_cancel(auth.uid(), 'taxi', o.id, p_reason, p_note);
  update taxi_orders set status = 'pending', driver_id = null, accepted_at = null, arrived_at = null where id = o.id;
  insert into user_notifications(user_id, kind, title, body, data)
  values (o.user_id, 'taxi_driver_cancelled', 'ألغى السائق الرحلة', 'نبحث لك عن سائق آخر', jsonb_build_object('order_id', o.id));
  return r;
end; $$;
grant execute on function public.driver_cancel_taxi(uuid, text, text) to authenticated;
