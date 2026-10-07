-- الأمان والطوارئ (5 من 9): الطلب الشغّال + إنشاء رابط المشاركة + إرسال الموقع
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
  return null;
end; $$;
revoke execute on function public._my_active_ctx(uuid) from public, anon, authenticated;

create or replace function public.create_trip_share(p_service text, p_ref uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; v_token text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if p_service not in ('taxi','taxi_shared','cargo','events','contracts') then raise exception 'NOT_ALLOWED'; end if;
  c := public._share_ctx(p_service, p_ref);
  if c is null or (c->>'customer')::uuid is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if not (c->>'active')::boolean then raise exception 'SHARE_INACTIVE'; end if;
  insert into live_shares(user_id, service, ref_id) values (auth.uid(), p_service, p_ref)
  on conflict (user_id, service, ref_id) do update set created_at = live_shares.created_at
  returning token into v_token;
  return jsonb_build_object('token', v_token);
end; $$;
grant execute on function public.create_trip_share(text, uuid) to authenticated;

-- يُستدعى كل 30 ثانية: يُحفظ الموقع فقط إذا عنده خدمة شغّالة أو حالة طوارئ
create or replace function public.live_ping(p_lat double precision, p_lng double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_case uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  select id into v_case from sos_cases where user_id = auth.uid() and ended_at is null;
  if v_case is null and not public._live_duty(auth.uid()) then
    return jsonb_build_object('tracking', false, 'sos', false);
  end if;
  insert into live_positions(user_id, lat, lng, updated_at) values (auth.uid(), p_lat, p_lng, now())
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
  if v_case is not null then
    update sos_cases set lat = p_lat, lng = p_lng, pos_at = now() where id = v_case;
    insert into sos_points(case_id, lat, lng) values (v_case, p_lat, p_lng);
  end if;
  return jsonb_build_object('tracking', true, 'sos', v_case is not null);
end; $$;
grant execute on function public.live_ping(double precision, double precision) to authenticated;
