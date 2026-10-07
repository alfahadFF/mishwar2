-- تكسي المطار (7 من 8): موقع السائق قبل الموعد بثلاث ساعات + زر الطوارئ + المشاركة
create or replace function public._live_duty(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from taxi_orders where driver_id = p_uid and status in ('accepted','arrived','in_progress'))
      or exists (select 1 from taxi_shared_trips where driver_id = p_uid and started_at is not null
                   and status not in ('completed','cancelled'))
      or exists (select 1 from cargo_orders where carrier_id = p_uid and status in ('accepted','in_progress'))
      or exists (select 1 from event_offers where driver_id = p_uid and status = 'accepted' and completed_at is null)
      or exists (select 1 from contract_offers where driver_id = p_uid and status = 'accepted' and ended_at is null)
      or exists (select 1 from airport_orders where driver_id = p_uid and status = 'accepted'
                   and now() > trip_at - interval '3 hours');
$$;

create or replace function public._my_active_ctx(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from taxi_orders where (user_id = p_uid or driver_id = p_uid) and status in ('accepted','arrived','in_progress')
   order by case status when 'in_progress' then 0 when 'arrived' then 1 else 2 end, accepted_at limit 1;
  if v is not null then return jsonb_build_object('service', 'taxi', 'ref', v); end if;
  select id into v from taxi_shared_trips where driver_id = p_uid and started_at is not null
     and status not in ('completed','cancelled') order by started_at desc limit 1;
  if v is not null then return jsonb_build_object('service', 'taxi_shared_trip', 'ref', v); end if;
  select q.id into v from taxi_shared_requests q join taxi_shared_trips t on t.id = q.trip_id
   where q.passenger_id = p_uid and q.status = 'confirmed' and t.status not in ('completed','cancelled')
   order by t.started_at desc nulls last, t.departure_time limit 1;
  if v is not null then return jsonb_build_object('service', 'taxi_shared', 'ref', v); end if;
  select id into v from cargo_orders where (customer_id = p_uid or carrier_id = p_uid) and status in ('accepted','in_progress')
   order by updated_at desc limit 1;
  if v is not null then return jsonb_build_object('service', 'cargo', 'ref', v); end if;
  select f.id into v from event_offers f join event_orders o on o.id = f.event_order_id
   where (o.user_id = p_uid or f.driver_id = p_uid) and f.status = 'accepted' and f.completed_at is null
   order by f.accepted_at desc limit 1;
  if v is not null then return jsonb_build_object('service', 'events', 'ref', v); end if;
  select f.id into v from contract_offers f join contract_orders o on o.id = f.contract_order_id
   where (o.user_id = p_uid or f.driver_id = p_uid) and f.status = 'accepted' and f.ended_at is null
   order by f.accepted_at desc limit 1;
  if v is not null then return jsonb_build_object('service', 'contracts', 'ref', v); end if;
  select id into v from airport_orders where (user_id = p_uid or driver_id = p_uid) and status = 'accepted'
     and now() > trip_at - interval '3 hours' order by trip_at limit 1;
  if v is not null then return jsonb_build_object('service', 'airport', 'ref', v); end if;
  return null;
end; $$;
revoke execute on function public._my_active_ctx(uuid) from public, anon, authenticated;

create or replace function public.create_trip_share(p_service text, p_ref uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; v_token text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if p_service not in ('taxi','taxi_shared','cargo','events','contracts','airport') then raise exception 'NOT_ALLOWED'; end if;
  c := public._share_ctx(p_service, p_ref);
  if c is null or (c->>'customer')::uuid is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if not (c->>'active')::boolean then raise exception 'SHARE_INACTIVE'; end if;
  insert into live_shares(user_id, service, ref_id) values (auth.uid(), p_service, p_ref)
  on conflict (user_id, service, ref_id) do update set created_at = live_shares.created_at
  returning token into v_token;
  return jsonb_build_object('token', v_token);
end; $$;
grant execute on function public.create_trip_share(text, uuid) to authenticated;
