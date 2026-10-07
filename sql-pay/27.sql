-- الدفع وإنهاء التكسي (27 من 39): الراكب يلغي قبل القبول
drop function if exists public.customer_cancel_taxi(uuid);
create or replace function public.customer_cancel_taxi(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o taxi_orders;
begin
  select * into o from taxi_orders where id = p_order for update;
  if o.id is null or o.user_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status not in ('pending','searching') then raise exception 'TAXI_ACCEPTED'; end if;
  update taxi_orders set status = 'cancelled', cancelled_at = now() where id = o.id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.customer_cancel_taxi(uuid) to authenticated;
