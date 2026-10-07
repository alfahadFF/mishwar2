-- ---------- 6) السائق: إرسال عرض (سعر الوحدة) وسحبه ----------
create or replace function public.driver_send_contract_offer(p_order uuid, p_item text, p_price numeric, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o contract_orders%rowtype; v_left int; v_id uuid; v_vehicle jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_BLOCKED'; end if;
  if p_price is null or p_price <= 0 then raise exception 'BAD_PRICE'; end if;
  select * into o from contract_orders where id = p_order for update;
  if not found or o.status <> 'pending' then raise exception 'ORDER_CLOSED'; end if;
  if o.user_id = auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if not public._ct_can_serve(p_item, auth.uid()) then raise exception 'VEHICLE_MISMATCH'; end if;
  select (it->>'left')::int into v_left from jsonb_array_elements(public._ct_items_left(p_order)) it where it->>'type' = p_item;
  if coalesce(v_left, 0) < 1 then raise exception 'ITEM_FILLED'; end if;
  if exists (select 1 from contract_offers where contract_order_id = p_order and driver_id = auth.uid() and status in ('pending','accepted')) then
    raise exception 'ALREADY_OFFERED';
  end if;
  select jsonb_build_object('type', event_vehicle_type, 'seats', vehicle_seats, 'model', vehicle_model,
                            'year', vehicle_year, 'color', vehicle_color, 'photo', vehicle_photo_url)
    into v_vehicle from profiles where id = auth.uid();
  insert into contract_offers(contract_order_id, driver_id, offered_price, currency, price_period, message, status, item_type, vehicle)
  values (p_order, auth.uid(), round(p_price, 2), 'USD', o.contract_unit, nullif(trim(p_message), ''), 'pending', p_item, v_vehicle)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.driver_withdraw_contract_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update contract_offers set status = 'withdrawn' where id = p_offer and driver_id = auth.uid() and status = 'pending';
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;
