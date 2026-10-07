-- تكسي المطار (2 من 8): الزبون — إنشاء الطلب وتعديله وإلغاؤه
create or replace function public._ap_check(p jsonb)
returns void language plpgsql stable set search_path = public as $$
begin
  if p->>'kind' not in ('arrival', 'departure') then raise exception 'AP_KIND'; end if;
  if not exists (select 1 from airports where code = p->>'airport') then raise exception 'AP_AIRPORT'; end if;
  if nullif(p->>'lat', '') is null or nullif(p->>'lng', '') is null then raise exception 'AP_POINT'; end if;
  if nullif(p->>'trip_at', '') is null or (p->>'trip_at')::timestamptz < now() + interval '30 minutes' then raise exception 'AP_TIME'; end if;
  if coalesce((p->>'pax_go')::int, 0) not between 1 and 60 then raise exception 'AP_PAX'; end if;
  if coalesce((p->>'round_trip')::boolean, false) and coalesce((p->>'pax_back')::int, 0) not between 1 and 60 then raise exception 'AP_PAX'; end if;
  if nullif(p->>'wait_hours', '') is not null and (p->>'wait_hours')::int not in (1, 2, 3, 4, 6) then raise exception 'AP_WAIT'; end if;
end; $$;

create or replace function public.create_airport_order(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rt boolean := coalesce((p->>'round_trip')::boolean, false);
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  perform public._ap_check(p);
  insert into airport_orders(user_id, kind, airport_code, pickup_lat, pickup_lng, pickup_label, trip_at, round_trip,
                             pax_go, pax_back, wait_hours, bags, notes)
  values (auth.uid(), p->>'kind', p->>'airport', (p->>'lat')::float8, (p->>'lng')::float8, nullif(btrim(p->>'label'), ''),
          (p->>'trip_at')::timestamptz, v_rt, (p->>'pax_go')::int, case when v_rt then (p->>'pax_back')::int end,
          nullif(p->>'wait_hours', '')::int, nullif(p->>'bags', '')::int, nullif(btrim(p->>'notes'), ''))
  returning id into v_id;
  return v_id;
end; $$;

-- قبل اختيار عرض: تعديل كل شيء. بعده: الموعد والملاحظات فقط، ويصل إشعار للسائق
create or replace function public.edit_airport_order(p_order uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o airport_orders; v_rt boolean := coalesce((p->>'round_trip')::boolean, false); v_f text[] := '{}';
begin
  select * into o from airport_orders where id = p_order and user_id = auth.uid() for update;
  if not found or o.status not in ('pending', 'accepted') then raise exception 'ORDER_CLOSED'; end if;
  if o.status = 'pending' then
    perform public._ap_check(p);
    update airport_orders set kind = p->>'kind', airport_code = p->>'airport', pickup_lat = (p->>'lat')::float8,
      pickup_lng = (p->>'lng')::float8, pickup_label = nullif(btrim(p->>'label'), ''), trip_at = (p->>'trip_at')::timestamptz,
      round_trip = v_rt, pax_go = (p->>'pax_go')::int, pax_back = case when v_rt then (p->>'pax_back')::int end,
      wait_hours = nullif(p->>'wait_hours', '')::int, bags = nullif(p->>'bags', '')::int, notes = nullif(btrim(p->>'notes'), '')
    where id = o.id;
    return;
  end if;
  if (p->>'trip_at')::timestamptz is distinct from o.trip_at then
    if (p->>'trip_at')::timestamptz < now() + interval '30 minutes' then raise exception 'AP_TIME'; end if;
    v_f := v_f || 'trip_at'::text;
  end if;
  if nullif(btrim(p->>'notes'), '') is distinct from o.notes then v_f := v_f || 'notes'::text; end if;
  if cardinality(v_f) = 0 then return; end if;
  update airport_orders set trip_at = coalesce((p->>'trip_at')::timestamptz, trip_at), notes = nullif(btrim(p->>'notes'), ''),
    edited_at = now(), edited_fields = v_f where id = o.id;
  insert into user_notifications(user_id, kind, title, body, data)
  values (o.driver_id, 'airport_edited', '✏️ عدّل الزبون طلب المطار',
          case when 'trip_at' = any(v_f) then 'تغيّر الموعد، افتح «حجوزاتي» للاطلاع' else 'تغيّرت الملاحظات، افتح «حجوزاتي» للاطلاع' end,
          jsonb_build_object('service', 'airport', 'order_id', o.id));
end; $$;

create or replace function public.cancel_airport_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update airport_orders set status = 'cancelled' where id = p_order and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'ORDER_CLOSED'; end if;
  update airport_offers set status = 'rejected', reason = 'cancelled' where order_id = p_order and status = 'pending';
end; $$;

revoke execute on function public._ap_check(jsonb) from public, anon, authenticated;
revoke execute on function public.create_airport_order(jsonb), public.edit_airport_order(uuid, jsonb), public.cancel_airport_order(uuid) from public, anon;
grant execute on function public.create_airport_order(jsonb), public.edit_airport_order(uuid, jsonb), public.cancel_airport_order(uuid) to authenticated;
