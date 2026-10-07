-- ---------- 8) الزبون: طلباتي والعروض والقبول والرفض ----------
drop function if exists public.my_event_orders();
create or replace function public.my_event_orders()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) || jsonb_build_object('items', public._ev_items_left(o.id))
    from event_orders o where o.user_id = auth.uid() order by o.created_at desc;
$$;

drop function if exists public.customer_event_offers(uuid);
create or replace function public.customer_event_offers(p_order uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'item_type', f.item_type, 'vehicle', f.vehicle, 'price', f.offered_price,
           'message', f.message, 'status', f.status, 'reason', f.reason, 'created_at', f.created_at, 'accepted_at', f.accepted_at,
           'driver_name', case when f.status = 'accepted' then p.full_name end,
           'driver_phone', case when f.status = 'accepted' then p.phone end)
    from event_offers f
    join event_orders o on o.id = f.event_order_id
    left join profiles p on p.id = f.driver_id
   where o.id = p_order and o.user_id = auth.uid() and f.status not in ('withdrawn','cancelled')
   order by (f.status = 'accepted') desc, f.offered_price;
$$;
