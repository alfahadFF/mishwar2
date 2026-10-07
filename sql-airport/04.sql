-- تكسي المطار (4 من 8): السائق — الطلبات ضمن 20 كم، والعروض، والحجوزات
create or replace function public._ap_can_serve(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_uid and type::text = 'driver' and coalesce(svc_airport, false))
     and not public.wallet_blocked(p_uid);
$$;

create or replace function public.driver_airport_feed(p_lat double precision, p_lng double precision)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' - 'driver_id' - 'agreed_price' - 'commission'
         || jsonb_build_object('airport_name', a.name, 'airport_lat', a.lat, 'airport_lng', a.lng,
              'my_offer', (select jsonb_build_object('id', f.id, 'price', f.price) from airport_offers f
                            where f.order_id = o.id and f.driver_id = auth.uid() and f.status = 'pending'))
    from airport_orders o join airports a on a.code = o.airport_code
   where public._ap_can_serve(auth.uid()) and o.status = 'pending' and o.user_id <> auth.uid() and o.trip_at > now()
     and public._push_km(o.pickup_lat, o.pickup_lng, p_lat, p_lng) <= 20
   order by o.trip_at;
$$;

create or replace function public.driver_send_airport_offer(p_order uuid, p_price numeric, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o airport_orders; v_id uuid; v_vehicle jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_BLOCKED'; end if;
  if not public._ap_can_serve(auth.uid()) then raise exception 'AP_NOT_ENABLED'; end if;
  if p_price is null or p_price <= 0 then raise exception 'BAD_PRICE'; end if;
  select * into o from airport_orders where id = p_order for update;
  if not found or o.status <> 'pending' then raise exception 'ORDER_CLOSED'; end if;
  if o.user_id = auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if exists (select 1 from airport_offers where order_id = p_order and driver_id = auth.uid() and status in ('pending', 'accepted')) then
    raise exception 'ALREADY_OFFERED'; end if;
  select jsonb_build_object('type', event_vehicle_type, 'seats', vehicle_seats, 'model', vehicle_model, 'year', vehicle_year,
                            'color', vehicle_color, 'photo', vehicle_photo_url)
    into v_vehicle from profiles where id = auth.uid();
  insert into airport_offers(order_id, driver_id, price, message, vehicle)
  values (p_order, auth.uid(), round(p_price, 2), nullif(btrim(p_message), ''), v_vehicle) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.driver_withdraw_airport_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update airport_offers set status = 'withdrawn' where id = p_offer and driver_id = auth.uid() and status = 'pending';
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;

create or replace function public.driver_airport_jobs()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' || jsonb_build_object('airport_name', a.name, 'airport_lat', a.lat, 'airport_lng', a.lng,
           'customer_name', coalesce(p.full_name, p.wallet_id), 'customer_phone', p.phone)
    from airport_orders o join airports a on a.code = o.airport_code left join profiles p on p.id = o.user_id
   where o.driver_id = auth.uid() and o.status in ('accepted', 'completed') order by o.trip_at desc limit 50;
$$;

create or replace function public.driver_complete_airport(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update airport_orders set status = 'completed', completed_at = now()
   where id = p_order and driver_id = auth.uid() and status = 'accepted';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end; $$;

revoke execute on function public._ap_can_serve(uuid) from public, anon, authenticated;
revoke execute on function public.driver_airport_feed(float8, float8), public.driver_send_airport_offer(uuid, numeric, text),
  public.driver_withdraw_airport_offer(uuid), public.driver_airport_jobs(), public.driver_complete_airport(uuid) from public, anon;
grant execute on function public.driver_airport_feed(float8, float8), public.driver_send_airport_offer(uuid, numeric, text),
  public.driver_withdraw_airport_offer(uuid), public.driver_airport_jobs(), public.driver_complete_airport(uuid) to authenticated;
