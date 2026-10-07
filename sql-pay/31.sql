-- الدفع وإنهاء التكسي (31 من 39): بانتظار الدفع: النقل والمناسبات
create or replace function public._pay_items_a()
returns table(service text, ref_id uuid, period int, payee uuid, gross numeric, title text, done_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'cargo'::text, o.id, 1, o.carrier_id, o.agreed_price::numeric, coalesce(o.cargo_type, 'طلب نقل'), o.completed_at::timestamptz
    from cargo_orders o
   where o.customer_id = auth.uid() and o.status = 'completed' and o.carrier_id is not null and o.agreed_price > 0
  union all
  select 'events', f.id, 1, f.driver_id, f.offered_price::numeric,
         case o.event_type when 'wedding' then 'زفاف' when 'family' then 'رحلة عائلية' when 'tourist' then 'رحلة سياحية' else 'مناسبة' end,
         f.completed_at::timestamptz
    from event_offers f join event_orders o on o.id = f.event_order_id
   where o.user_id = auth.uid() and f.status = 'accepted' and f.completed_at is not null and f.offered_price > 0;
$$;
