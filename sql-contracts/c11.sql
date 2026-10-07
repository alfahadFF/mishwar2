-- القبول: اليومي/الأسبوعي على كامل العقد • الشهري على الشهر الأول
drop function if exists public.accept_contract_offer(uuid);
create or replace function public.accept_contract_offer(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f contract_offers%rowtype; o contract_orders%rowtype; v_left int; v_fee numeric; v_gross numeric; p profiles%rowtype;
begin
  select * into f from contract_offers where id = p_offer_id;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into o from contract_orders where id = f.contract_order_id for update;
  if o.user_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status <> 'pending' then raise exception 'ORDER_CLOSED'; end if;
  select * into f from contract_offers where id = p_offer_id for update;
  if f.status <> 'pending' then raise exception 'OFFER_NOT_AVAILABLE'; end if;
  select (it->>'left')::int into v_left from jsonb_array_elements(public._ct_items_left(o.id)) it where it->>'type' = f.item_type;
  if coalesce(v_left, 0) < 1 then raise exception 'ITEM_FILLED'; end if;

  v_gross := case when o.contract_unit = 'month' then f.offered_price else public._ct_total(f.offered_price, o.id) end;
  v_fee := public._wallet_charge(f.driver_id, 'contracts', o.id, v_gross);
  update contract_offers set status = 'accepted', accepted_at = now(), commission = v_fee, commission_total = v_fee,
         months_charged = case when o.contract_unit = 'month' then 1 else 0 end
   where id = f.id;
  if v_left = 1 then
    update contract_offers set status = 'rejected', reason = 'filled'
     where contract_order_id = o.id and item_type = f.item_type and status = 'pending';
  end if;
  if not exists (select 1 from jsonb_array_elements(public._ct_items_left(o.id)) it where (it->>'left')::int > 0) then
    update contract_orders set status = 'accepted' where id = o.id;
    update contract_offers set status = 'rejected', reason = 'filled' where contract_order_id = o.id and status = 'pending';
  end if;
  select * into p from profiles where id = f.driver_id;
  return jsonb_build_object('commission', v_fee, 'driver_name', p.full_name, 'driver_phone', p.phone,
                            'order_status', (select status from contract_orders where id = o.id));
end; $$;
