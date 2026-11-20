-- الدفع وإنهاء التكسي (41): الدفع النقدي للراكب دون خصم من المحفظة.
-- يسجل هذا الإجراء إقرار الراكب بأنه سلّم الأجرة نقداً للسائق؛ لا ينشئ حركة مالية في المحفظة.

alter table public.taxi_orders
  add column if not exists cash_paid_at timestamptz;

create or replace function public.customer_taxi_cash_paid(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.taxi_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;

  select * into o
    from public.taxi_orders
   where id = p_order
   for update;

  if not found or o.user_id is distinct from auth.uid() then
    raise exception 'NOT_ALLOWED';
  end if;
  if o.status <> 'completed' or o.driver_id is null then
    raise exception 'NOT_PAYABLE';
  end if;
  if exists (
    select 1 from public.wallet_payments w
     where w.service = 'taxi' and w.ref_id = o.id and w.period = 1
  ) then
    raise exception 'ALREADY_PAID';
  end if;

  if o.cash_paid_at is not null then
    return jsonb_build_object('paid', true, 'payment_method', 'cash', 'cash_paid_at', o.cash_paid_at);
  end if;

  update public.taxi_orders
     set cash_paid_at = now()
   where id = o.id
   returning * into o;

  return jsonb_build_object('paid', true, 'payment_method', 'cash', 'cash_paid_at', o.cash_paid_at);
end;
$$;
revoke all on function public.customer_taxi_cash_paid(uuid) from public, anon;
grant execute on function public.customer_taxi_cash_paid(uuid) to authenticated;

-- لا تظهر الرحلات التي أقرّ الراكب بأنه دفعها نقداً ضمن مستحقات المحفظة.
create or replace function public._pay_items_c()
returns table(service text, ref_id uuid, period int, payee uuid, gross numeric, title text, done_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'taxi'::text, o.id, 1, o.driver_id,
         coalesce(o.final_fare, o.estimated_fare)::numeric,
         'رحلة تكسي', o.completed_at
    from public.taxi_orders o
   where o.user_id = auth.uid()
     and o.status = 'completed'
     and o.driver_id is not null
     and o.accepted_at is not null
     and coalesce(o.final_fare, o.estimated_fare) > 0
     and o.cash_paid_at is null;
$$;

-- إعادة تفاصيل الرحلة الحالية لعرض حالة «دُفع نقداً» بعد العودة إلى الشاشة.
create or replace function public.my_taxi_active()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
      'id', o.id,
      'status', o.status,
      'fare', coalesce(o.final_fare, o.estimated_fare),
      'fare_local', o.fare_local,
      'local_currency', o.local_currency,
      'pricing_exchange_rate', o.pricing_exchange_rate,
      'commission_rate', o.commission_rate,
      'commission_local', o.commission_local,
      'driver_net_local', o.driver_net_local,
      'distance_km', o.distance_km,
      'duration_min', o.duration_min,
      'search_radius_km', o.search_radius_km,
      'category', o.vehicle_category,
      'pickup', jsonb_build_array(o.pickup_lat, o.pickup_lng),
      'dropoff', jsonb_build_array(o.dropoff_lat, o.dropoff_lng),
      'driver_name', case when o.status in ('accepted','arrived','in_progress') then p.full_name end,
      'vehicle_model', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_model end,
      'vehicle_color', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_color end,
      'vehicle_plate', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_plate end,
      'discount_pct', public._wallet_discount_pct(),
      'completed_at', o.completed_at,
      'cash_paid_at', o.cash_paid_at,
      'payment_method', case when o.cash_paid_at is not null then 'cash' end)
    from public.taxi_orders o
    left join public.profiles p on p.id = o.driver_id
   where o.user_id = auth.uid()
     and (o.status in ('pending','searching','accepted','arrived','in_progress')
          or (o.status = 'completed'
              and o.completed_at > now() - interval '1 day'
              and not exists (
                select 1 from public.wallet_payments w
                 where w.service = 'taxi' and w.ref_id = o.id
              )))
   order by o.created_at desc
   limit 1;
$$;
