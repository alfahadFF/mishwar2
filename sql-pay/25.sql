-- الدفع وإنهاء التكسي (25 من 39): السائق: بدء الرحلة
create or replace function public.driver_taxi_start(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o taxi_orders;
begin
  select * into o from taxi_orders where id = p_order for update;
  if o.id is null or o.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status not in ('accepted','arrived') then raise exception 'BAD_STEP'; end if;
  update taxi_orders set status = 'in_progress', started_at = now(), arrived_at = coalesce(arrived_at, now()) where id = o.id;
  return jsonb_build_object('status', 'in_progress');
end; $$;
grant execute on function public.driver_taxi_start(uuid) to authenticated;
