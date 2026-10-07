-- الرحلة المشتركة (8 من 22): خصم عمولة راكب
create or replace function public._shared_charge(p_request uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare rq taxi_shared_requests; t taxi_shared_trips; v_gross numeric; v_fee numeric;
begin
  select * into rq from taxi_shared_requests where id = p_request for update;
  if rq.id is null or rq.status <> 'confirmed' or rq.commission_at is not null then return 0; end if;
  select * into t from taxi_shared_trips where id = rq.trip_id;
  if t.started_at is null then return 0; end if;
  v_gross := t.price_per_seat * coalesce(rq.seats_requested, 1) + coalesce(rq.extra_fee, 0);
  v_fee := public._wallet_charge(t.driver_id, 'taxi_shared', rq.id, v_gross);
  update taxi_shared_requests set commission_at = now(), commission = v_fee where id = rq.id;
  return v_fee;
end; $$;
revoke all on function public._shared_charge(uuid) from public, anon, authenticated;
