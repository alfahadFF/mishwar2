-- الدفع وإنهاء التكسي (24 من 39): السائق: وصلت
drop function if exists public.driver_taxi_step(uuid, text);
drop function if exists public.driver_taxi_arrived(uuid);
create or replace function public.driver_taxi_arrived(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o taxi_orders;
begin
  select * into o from taxi_orders where id = p_order for update;
  if o.id is null or o.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status <> 'accepted' then raise exception 'BAD_STEP'; end if;
  update taxi_orders set status = 'arrived', arrived_at = now() where id = o.id;
  insert into user_notifications(user_id, kind, title, body, data)
  values (o.user_id, 'taxi_arrived', 'وصل السائق', 'السائق بانتظارك عند نقطة الانطلاق', jsonb_build_object('order_id', o.id));
  return jsonb_build_object('status', 'arrived');
end; $$;
grant execute on function public.driver_taxi_arrived(uuid) to authenticated;
