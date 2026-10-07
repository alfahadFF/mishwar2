-- توفّر التكسي (4 من 5): قبول طلب إضافي واحد + الرحلة الحالية والتالية للسائق
drop function if exists public.driver_accept_taxi(uuid);
create or replace function public.driver_accept_taxi(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o taxi_orders; v_phone text; v_n int;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if public._taxi_suspended(auth.uid()) then perform public._taxi_cancel_undo(auth.uid(), p_order); end if;
  if public._taxi_suspended(auth.uid()) then raise exception 'TAXI_SUSPENDED'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_BLOCKED'; end if;
  select count(*) into v_n from taxi_orders where driver_id = auth.uid() and status in ('accepted','arrived','in_progress');
  if v_n >= 2 then raise exception 'HAS_ACTIVE_TRIP'; end if;
  update taxi_orders set status = 'accepted', driver_id = auth.uid(), accepted_at = now()
   where id = p_order and status in ('pending','searching') and driver_id is null and user_id is distinct from auth.uid()
   returning * into o;
  if o.id is null then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  perform public._taxi_cancel_undo(auth.uid(), o.id);
  select phone into v_phone from profiles where id = o.user_id;
  insert into user_notifications(user_id, kind, title, body, data)
  values (o.user_id, 'taxi_accepted', 'تم قبول طلبك', 'السائق في الطريق إليك', jsonb_build_object('order_id', o.id));
  return jsonb_build_object('id', o.id, 'fare', o.estimated_fare, 'customer_phone', v_phone, 'is_next', v_n = 1);
end; $$;
grant execute on function public.driver_accept_taxi(uuid) to authenticated;

create or replace function public._taxi_driver_json(o taxi_orders)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'status', o.status, 'fare', o.estimated_fare, 'distance_km', o.distance_km,
      'pickup', jsonb_build_array(o.pickup_lat, o.pickup_lng), 'dropoff', jsonb_build_array(o.dropoff_lat, o.dropoff_lng),
      'customer_phone', (select phone from profiles where id = o.user_id));
$$;

drop function if exists public.driver_taxi_active();
create or replace function public.driver_taxi_active()
returns jsonb language sql stable security definer set search_path = public as $$
  with a as (
    select o, row_number() over (order by case o.status when 'in_progress' then 0 when 'arrived' then 1 else 2 end,
                                          o.accepted_at) rn
      from taxi_orders o
     where o.driver_id = auth.uid() and o.status in ('accepted','arrived','in_progress'))
  select public._taxi_driver_json(c.o)
         || jsonb_build_object('next', (select public._taxi_driver_json(n.o) from a n where n.rn = 2))
    from a c where c.rn = 1;
$$;
grant execute on function public.driver_taxi_active() to authenticated;
