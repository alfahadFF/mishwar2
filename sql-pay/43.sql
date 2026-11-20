-- الدفع وإنهاء التكسي (43): التحقق من أن الرحلة قابلة للدفع النقدي فعلاً.
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
  if o.status <> 'completed'
     or o.driver_id is null
     or o.accepted_at is null
     or coalesce(o.final_fare, o.estimated_fare) <= 0 then
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
