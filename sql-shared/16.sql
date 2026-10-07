-- الرحلة المشتركة (16 من 22): بانتظار الدفع: الرحلة المشتركة
create or replace function public._pay_items_d()
returns table(service text, ref_id uuid, period int, payee uuid, gross numeric, title text, done_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'taxi_shared'::text, r.id, 1, t.driver_id,
         (t.price_per_seat * r.seats_requested + coalesce(r.extra_fee, 0))::numeric, 'رحلة مشتركة',
         coalesce(t.completed_at, t.started_at, r.updated_at)
    from taxi_shared_requests r join taxi_shared_trips t on t.id = r.trip_id
   where r.passenger_id = auth.uid() and r.status = 'confirmed' and t.status <> 'cancelled'
     and t.price_per_seat * r.seats_requested + coalesce(r.extra_fee, 0) > 0;
$$;
