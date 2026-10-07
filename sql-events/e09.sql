-- قبول عرض: خصم العمولة (أو الفترة المجانية)، وإغلاق النوع المكتمل، واكتمال الطلب
create or replace function public.accept_event_offer(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f event_offers%rowtype; o event_orders%rowtype; v_left int; v_fee numeric; p profiles%rowtype;
begin
  select * into f from event_offers where id = p_offer_id;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into o from event_orders where id = f.event_order_id for update;
  if o.user_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status <> 'pending' then raise exception 'ORDER_CLOSED'; end if;
  select * into f from event_offers where id = p_offer_id for update;
  if f.status <> 'pending' then raise exception 'OFFER_NOT_AVAILABLE'; end if;
  select (it->>'left')::int into v_left from jsonb_array_elements(public._ev_items_left(o.id)) it where it->>'type' = f.item_type;
  if coalesce(v_left, 0) < 1 then raise exception 'ITEM_FILLED'; end if;

  v_fee := public._wallet_charge(f.driver_id, 'events', o.id, f.offered_price);
  update event_offers set status = 'accepted', accepted_at = now(), commission = v_fee where id = f.id;
  if v_left = 1 then
    update event_offers set status = 'rejected', reason = 'filled'
     where event_order_id = o.id and item_type = f.item_type and status = 'pending';
  end if;
  if not exists (select 1 from jsonb_array_elements(public._ev_items_left(o.id)) it where (it->>'left')::int > 0) then
    update event_orders set status = 'accepted' where id = o.id;
    update event_offers set status = 'rejected', reason = 'filled' where event_order_id = o.id and status = 'pending';
  end if;
  select * into p from profiles where id = f.driver_id;
  return jsonb_build_object('commission', v_fee, 'driver_name', p.full_name, 'driver_phone', p.phone,
                            'order_status', (select status from event_orders where id = o.id));
end; $$;
