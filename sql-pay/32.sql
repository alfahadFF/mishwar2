-- الدفع وإنهاء التكسي (32 من 39): بانتظار الدفع: العقود
create or replace function public._pay_items_b()
returns table(service text, ref_id uuid, period int, payee uuid, gross numeric, title text, done_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'contracts'::text, f.id, 1, f.driver_id, public._ct_total(f.offered_price, o.id)::numeric, 'عقد نقل',
         coalesce(f.ended_at, o.end_date::timestamptz)
    from contract_offers f join contract_orders o on o.id = f.contract_order_id
   where o.user_id = auth.uid() and f.status = 'accepted' and o.contract_unit in ('day','week')
     and (f.ended_at is not null or o.end_date < current_date) and f.offered_price > 0
  union all
  select 'contracts', f.id, k, f.driver_id, f.offered_price::numeric, 'عقد نقل • الشهر ' || k,
         (o.start_date + make_interval(months => k))::timestamptz
    from contract_offers f join contract_orders o on o.id = f.contract_order_id
    cross join lateral generate_series(1, o.unit_count) k
   where o.user_id = auth.uid() and f.status = 'accepted' and o.contract_unit = 'month'
     and o.start_date is not null and f.offered_price > 0
     and ((o.start_date + make_interval(months => k))::date <= current_date
          or (f.ended_at is not null and k <= greatest(f.months_charged, 1)));
$$;
