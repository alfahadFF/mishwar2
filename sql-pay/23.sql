-- الدفع وإنهاء التكسي (23 من 39): قبول السائق
drop function if exists public.driver_accept_taxi(uuid);
create or replace function public.driver_accept_taxi(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o taxi_orders; v_phone text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_BLOCKED'; end if;
  if exists (select 1 from taxi_orders where driver_id = auth.uid() and status in ('accepted','arrived','in_progress')) then
    raise exception 'HAS_ACTIVE_TRIP';
  end if;
  update taxi_orders set status = 'accepted', driver_id = auth.uid(), accepted_at = now()
   where id = p_order and status in ('pending','searching') and driver_id is null and user_id is distinct from auth.uid()
   returning * into o;
  if o.id is null then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  select phone into v_phone from profiles where id = o.user_id;
  insert into user_notifications(user_id, kind, title, body, data)
  values (o.user_id, 'taxi_accepted', 'تم قبول طلبك', 'السائق في الطريق إليك', jsonb_build_object('order_id', o.id));
  return jsonb_build_object('id', o.id, 'fare', o.estimated_fare, 'customer_phone', v_phone);
end; $$;
grant execute on function public.driver_accept_taxi(uuid) to authenticated;
