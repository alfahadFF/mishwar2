-- ---------- 5) دوال مساعدة ----------
-- المتبقي من كل نوع مركبة في الطلب
create or replace function public._ev_items_left(p_order uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(v.item || jsonb_build_object('left', greatest(0, coalesce((v.item->>'count')::int, 0) - (
           select count(*) from event_offers f
            where f.event_order_id = p_order and f.item_type = v.item->>'type' and f.status = 'accepted')::int))
         order by v.ord), '[]'::jsonb)
    from event_orders o, jsonb_array_elements(coalesce(o.vehicles, '[]'::jsonb)) with ordinality v(item, ord)
   where o.id = p_order;
$$;
-- الباصات والفانات: أي سائق باص/فان • سيارة الزفاف: من فعّل خدمة الزفاف
create or replace function public._ev_can_serve(p_item text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case when p_item = 'wedding_car' then p.svc_wedding and p.event_vehicle_type is not null
                               else p.svc_events and p.event_vehicle_type in
                                    ('bus_large_50','bus_mid_27','bus_mid_21','bus_mid_18','bus_small_14','van_11','van_8') end
                     from profiles p where p.id = p_user), false);
$$;
revoke all on function public._ev_items_left(uuid) from public, anon, authenticated;
revoke all on function public._ev_can_serve(text, uuid) from public, anon, authenticated;
