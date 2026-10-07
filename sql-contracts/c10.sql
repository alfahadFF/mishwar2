-- ---------- 7) الزبون: عقودي والعروض ----------
drop function if exists public.my_contract_orders();
create or replace function public.my_contract_orders()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) || jsonb_build_object('items', public._ct_items_left(o.id))
    from contract_orders o where o.user_id = auth.uid() order by o.created_at desc;
$$;

drop function if exists public.customer_contract_offers(uuid);
create or replace function public.customer_contract_offers(p_order uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'item_type', f.item_type, 'vehicle', f.vehicle, 'price', f.offered_price,
           'unit', o.contract_unit, 'total', public._ct_total(f.offered_price, o.id),
           'message', f.message, 'status', f.status, 'reason', f.reason, 'created_at', f.created_at,
           'accepted_at', f.accepted_at, 'ended_at', f.ended_at,
           'driver_name', case when f.status = 'accepted' then p.full_name end,
           'driver_phone', case when f.status = 'accepted' then p.phone end)
    from contract_offers f
    join contract_orders o on o.id = f.contract_order_id
    left join profiles p on p.id = f.driver_id
   where o.id = p_order and o.user_id = auth.uid() and f.status not in ('withdrawn','cancelled')
   order by (f.status = 'accepted') desc, f.offered_price;
$$;
