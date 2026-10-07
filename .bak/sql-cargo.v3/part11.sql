-- الجزء 11 من 14 — الدوال

create or replace function public.carrier_send_cargo_offer(p_order uuid, p_price numeric, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o cargo_orders; v_class text; v_id uuid;
begin
  select * into o from cargo_orders where id = p_order;
  if o.id is null or o.status <> 'open' then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  select vehicle_class into v_class from profiles where id = auth.uid();
  if not public.cargo_vehicle_fits(o.vehicle_class, v_class) then raise exception 'VEHICLE_NOT_SUITABLE'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_NEGATIVE'; end if;
  if p_price is null or p_price <= 0 then raise exception 'BAD_PRICE'; end if;
  if o.budget_type = 'fixed' and (p_price < o.budget_from or p_price > o.budget_to) then raise exception 'PRICE_OUT_OF_RANGE'; end if;
  insert into cargo_offers(cargo_order_id, driver_id, offered_price, message, status)
  values (o.id, auth.uid(), p_price, nullif(btrim(p_message), ''), 'pending')
  on conflict (cargo_order_id, driver_id) do update
    set offered_price = excluded.offered_price, message = excluded.message, status = 'pending', updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.carrier_withdraw_cargo_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update cargo_offers set status = 'withdrawn', updated_at = now()
   where id = p_offer and driver_id = auth.uid() and status = 'pending';
  if not found then raise exception 'OFFER_NOT_PENDING'; end if;
end; $$;
