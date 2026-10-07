-- الجزء 12 من 14 — الدوال

create or replace function public.accept_cargo_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f cargo_offers; o cargo_orders; v_fee numeric;
begin
  select * into f from cargo_offers where id = p_offer_id for update;
  if f.id is null or f.status <> 'pending' then raise exception 'OFFER_NOT_AVAILABLE'; end if;
  select * into o from cargo_orders where id = f.cargo_order_id for update;
  if o.customer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status <> 'open' then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  v_fee := public._wallet_charge(f.driver_id, 'cargo', o.id, f.offered_price);
  update cargo_offers set status = 'accepted', accepted_at = now(), updated_at = now() where id = f.id;
  update cargo_offers set status = 'rejected', updated_at = now() where cargo_order_id = o.id and id <> f.id and status = 'pending';
  update cargo_orders set status = 'accepted', carrier_id = f.driver_id, agreed_price = f.offered_price,
         commission_amount = v_fee, accepted_via = 'offer', accepted_at = now(), updated_at = now()
   where id = o.id;
end; $$;

drop function if exists public.accept_cargo_direct(uuid);

drop function if exists public.carrier_my_cargo_jobs();

create or replace function public.carrier_my_cargo_jobs()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'cargo_type', o.cargo_type, 'vehicle_class', o.vehicle_class,
    'pickup_points', o.pickup_points, 'dropoff_points', coalesce(o.dropoff_points, o.delivery_points),
    'route_info', o.route_info, 'timing_type', o.timing_type,
    'scheduled_date', o.scheduled_date, 'scheduled_time', o.scheduled_time,
    'agreed_price', o.agreed_price, 'commission_amount', o.commission_amount, 'accepted_at', o.accepted_at,
    'customer_name', p.full_name, 'customer_phone', p.phone)
  from cargo_orders o left join profiles p on p.id = o.customer_id
  where o.carrier_id = auth.uid() and o.status in ('accepted','completed')
  order by o.accepted_at desc nulls last;
$$;

create or replace function public.carrier_complete_cargo(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update cargo_orders set status = 'completed', completed_at = now(), updated_at = now()
   where id = p_order and carrier_id = auth.uid() and status = 'accepted';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end; $$;
