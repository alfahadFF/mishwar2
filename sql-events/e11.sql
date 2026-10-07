-- ---------- 9) السائق: عروضي وأعمالي وإتمام المناسبة ----------
drop function if exists public.driver_my_event_offers();
create or replace function public.driver_my_event_offers()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'order_id', o.id, 'item_type', f.item_type, 'price', f.offered_price,
           'status', f.status, 'reason', f.reason, 'created_at', f.created_at, 'order_status', o.status,
           'event_type', o.event_type, 'event_type_other', o.event_type_other,
           'gathering_point', o.gathering_point, 'gathering_time', o.gathering_time)
    from event_offers f join event_orders o on o.id = f.event_order_id
   where f.driver_id = auth.uid() and f.status in ('pending','rejected')
   order by f.created_at desc;
$$;

drop function if exists public.driver_event_jobs();
create or replace function public.driver_event_jobs()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' - 'driver_id' - 'budget_type' - 'budget_from' - 'budget_to'
         || jsonb_build_object('offer_id', f.id, 'item_type', f.item_type, 'price', f.offered_price,
              'commission', f.commission, 'accepted_at', f.accepted_at, 'completed_at', f.completed_at,
              'customer_name', p.full_name, 'customer_phone', p.phone)
    from event_offers f
    join event_orders o on o.id = f.event_order_id
    left join profiles p on p.id = o.user_id
   where f.driver_id = auth.uid() and f.status = 'accepted'
   order by f.accepted_at desc;
$$;

create or replace function public.driver_complete_event(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  update event_offers set completed_at = now()
   where id = p_offer and driver_id = auth.uid() and status = 'accepted' and completed_at is null
  returning event_order_id into v_order;
  if v_order is null then raise exception 'NOT_ALLOWED'; end if;
  -- عندما يُتم كل السائقين، يكتمل الطلب
  if not exists (select 1 from event_offers where event_order_id = v_order and status = 'accepted' and completed_at is null)
     and (select status from event_orders where id = v_order) = 'accepted' then
    update event_orders set status = 'completed' where id = v_order;
  end if;
end; $$;
