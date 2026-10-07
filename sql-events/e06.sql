-- ---------- 6) السائق: الطلبات ضمن 10 كم ----------
drop function if exists public.driver_events_feed(double precision, double precision, double precision);
create or replace function public.driver_events_feed(p_lat double precision, p_lng double precision, p_radius_km double precision default 10)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' - 'driver_id' - 'budget_type' - 'budget_from' - 'budget_to'
         || jsonb_build_object('distance_km', round(d.dist::numeric, 2), 'items', public._ev_items_left(o.id),
              'my_offer', (select jsonb_build_object('id', f.id, 'price', f.offered_price, 'item_type', f.item_type)
                             from event_offers f where f.event_order_id = o.id and f.driver_id = auth.uid() and f.status = 'pending'))
    from event_orders o
    cross join lateral (select 2 * 6371 * asin(sqrt(
             power(sin(radians((o.gathering_lat - p_lat) / 2)), 2) +
             cos(radians(p_lat)) * cos(radians(o.gathering_lat)) *
             power(sin(radians((o.gathering_lng - p_lng) / 2)), 2))) as dist) d
   where auth.uid() is not null
     and o.status = 'pending' and o.gathering_lat is not null and o.user_id <> auth.uid()
     and d.dist <= least(coalesce(p_radius_km, 10), 10)
     and not public.wallet_blocked(auth.uid())
     and not exists (select 1 from event_offers f where f.event_order_id = o.id and f.driver_id = auth.uid() and f.status = 'accepted')
     and exists (select 1 from jsonb_array_elements(public._ev_items_left(o.id)) it
                  where (it->>'left')::int > 0 and public._ev_can_serve(it->>'type', auth.uid()))
   order by d.dist;
$$;
