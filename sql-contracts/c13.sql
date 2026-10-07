-- ---------- 8) السائق: عروضي وعقودي ----------
drop function if exists public.driver_my_contract_offers();
create or replace function public.driver_my_contract_offers()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'order_id', o.id, 'item_type', f.item_type, 'price', f.offered_price,
           'unit', o.contract_unit, 'unit_count', o.unit_count, 'total', public._ct_total(f.offered_price, o.id),
           'status', f.status, 'reason', f.reason, 'created_at', f.created_at, 'order_status', o.status,
           'contract_category', o.contract_category, 'start_date', o.start_date, 'pickup_points', o.pickup_points)
    from contract_offers f join contract_orders o on o.id = f.contract_order_id
   where f.driver_id = auth.uid() and f.status in ('pending','rejected')
   order by f.created_at desc;
$$;

drop function if exists public.driver_contract_jobs();
create or replace function public.driver_contract_jobs()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' - 'driver_id' - 'budget_type' - 'budget_from' - 'budget_to' - 'budget_period'
         || jsonb_build_object('offer_id', f.id, 'item_type', f.item_type, 'price', f.offered_price,
              'total', public._ct_total(f.offered_price, o.id), 'commission', f.commission,
              'commission_total', f.commission_total, 'months_charged', f.months_charged,
              'accepted_at', f.accepted_at, 'ended_at', f.ended_at,
              'next_due', case when o.contract_unit = 'month' and f.ended_at is null and f.months_charged < o.unit_count
                               then (o.start_date + make_interval(months => f.months_charged))::date end,
              'active', f.ended_at is null and (o.end_date is null or o.end_date >= current_date),
              'customer_name', p.full_name, 'customer_phone', p.phone)
    from contract_offers f
    join contract_orders o on o.id = f.contract_order_id
    left join profiles p on p.id = o.user_id
   where f.driver_id = auth.uid() and f.status = 'accepted'
   order by f.accepted_at desc;
$$;
