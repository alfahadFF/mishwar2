-- المحفظة العامة (5 من 6): الخدمات المكتملة بانتظار الدفع
create or replace function public._wallet_discount_pct()
returns numeric language sql stable security definer set search_path = public as $$
  select least(greatest(coalesce((select value::numeric from app_settings where key = 'wallet_pay_discount_pct'), 0), 0), 100);
$$;

-- الخدمات المكتملة غير المدفوعة للزبون الحالي
drop function if exists public.my_payables();
create or replace function public.my_payables()
returns setof jsonb language sql stable security definer set search_path = public as $$
  with d as (select public._wallet_discount_pct() as pct),
  items as (
    -- النقل: الطلب مكتمل
    select 'cargo'::text as service, o.id as ref_id, 1 as period, o.carrier_id as payee,
           o.agreed_price as gross, coalesce(o.cargo_type, 'طلب نقل') as title, o.completed_at as done_at
      from cargo_orders o
     where o.customer_id = auth.uid() and o.status = 'completed' and o.carrier_id is not null and o.agreed_price > 0
    union all
    -- المناسبات: كل مركبة بعد أن يُتم سائقها الخدمة
    select 'events', f.id, 1, f.driver_id, f.offered_price, case o.event_type when 'wedding' then 'زفاف' when 'family' then 'رحلة عائلية' when 'tourist' then 'رحلة سياحية' else 'مناسبة' end, f.completed_at
      from event_offers f join event_orders o on o.id = f.event_order_id
     where o.user_id = auth.uid() and f.status = 'accepted' and f.completed_at is not null and f.offered_price > 0
    union all
    -- العقود اليومية والأسبوعية: المبلغ كاملاً بعد انتهاء المدة أو إنهاء العقد
    select 'contracts', f.id, 1, f.driver_id, public._ct_total(f.offered_price, o.id), 'عقد نقل',
           coalesce(f.ended_at, o.end_date::timestamptz)
      from contract_offers f join contract_orders o on o.id = f.contract_order_id
     where o.user_id = auth.uid() and f.status = 'accepted' and o.contract_unit in ('day','week')
       and (f.ended_at is not null or o.end_date < current_date) and f.offered_price > 0
    union all
    -- العقود الشهرية: كل شهر بعد انقضائه
    select 'contracts', f.id, k, f.driver_id, f.offered_price, 'عقد نقل • الشهر ' || k,
           (o.start_date + make_interval(months => k))::timestamptz
      from contract_offers f join contract_orders o on o.id = f.contract_order_id
      cross join lateral generate_series(1, o.unit_count) k
     where o.user_id = auth.uid() and f.status = 'accepted' and o.contract_unit = 'month' and o.start_date is not null
       and f.offered_price > 0
       and ((o.start_date + make_interval(months => k))::date <= current_date
            or (f.ended_at is not null and k <= greatest(f.months_charged, 1)))
  )
  select jsonb_build_object('service', i.service, 'ref_id', i.ref_id, 'period', i.period, 'title', i.title,
           'done_at', i.done_at, 'payee_name', p.full_name, 'gross', i.gross, 'discount_pct', d.pct,
           'discount', round(i.gross * d.pct / 100, 2), 'to_pay', i.gross - round(i.gross * d.pct / 100, 2))
    from items i cross join d
    left join profiles p on p.id = i.payee
   where not exists (select 1 from wallet_payments w where w.service = i.service and w.ref_id = i.ref_id and w.period = i.period)
   order by i.done_at desc nulls last;
$$;

grant execute on function public.my_payables() to authenticated;
