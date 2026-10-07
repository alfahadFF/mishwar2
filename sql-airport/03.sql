-- تكسي المطار (3 من 8): الزبون — طلباتي والعروض والاختيار
create or replace function public.my_airport_orders()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' || jsonb_build_object('airport_name', a.name,
           'offers', (select count(*) from airport_offers f where f.order_id = o.id and f.status = 'pending'),
           'driver_name', case when o.status in ('accepted', 'completed') then coalesce(p.full_name, p.wallet_id) end,
           'driver_phone', case when o.status = 'accepted' then p.phone end)
    from airport_orders o join airports a on a.code = o.airport_code left join profiles p on p.id = o.driver_id
   where o.user_id = auth.uid() order by o.created_at desc limit 50;
$$;

-- العروض: المركبة والصور والتقييم ظاهرة، والاسم والهاتف بعد الاختيار فقط
create or replace function public.customer_airport_offers(p_order uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'price', f.price, 'message', f.message, 'status', f.status, 'created_at', f.created_at,
           'vehicle', f.vehicle, 'driver_photo', p.avatar_url, 'rating', public._provider_rating(f.driver_id),
           'driver_name', case when f.status = 'accepted' then coalesce(p.full_name, p.wallet_id) end,
           'driver_phone', case when f.status = 'accepted' then p.phone end)
    from airport_offers f join airport_orders o on o.id = f.order_id left join profiles p on p.id = f.driver_id
   where o.id = p_order and o.user_id = auth.uid() and f.status in ('pending', 'accepted')
   order by (f.status = 'accepted') desc, f.price;
$$;

create or replace function public.accept_airport_offer(p_offer uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f airport_offers; o airport_orders; v_fee numeric; p profiles;
begin
  select * into f from airport_offers where id = p_offer;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into o from airport_orders where id = f.order_id for update;
  if o.user_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status <> 'pending' then raise exception 'ORDER_CLOSED'; end if;
  select * into f from airport_offers where id = p_offer for update;
  if f.status <> 'pending' then raise exception 'OFFER_NOT_AVAILABLE'; end if;
  v_fee := public._wallet_charge(f.driver_id, 'airport', o.id, f.price);
  update airport_offers set status = 'accepted', accepted_at = now() where id = f.id;
  update airport_offers set status = 'rejected', reason = 'filled' where order_id = o.id and status = 'pending';
  update airport_orders set status = 'accepted', driver_id = f.driver_id, agreed_price = f.price, commission = v_fee, accepted_at = now()
   where id = o.id;
  select * into p from profiles where id = f.driver_id;
  return jsonb_build_object('commission', v_fee, 'driver_name', coalesce(p.full_name, p.wallet_id), 'driver_phone', p.phone);
end; $$;

create or replace function public.reject_airport_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update airport_offers f set status = 'rejected', reason = 'customer'
   where f.id = p_offer and f.status = 'pending'
     and exists (select 1 from airport_orders o where o.id = f.order_id and o.user_id = auth.uid());
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;

revoke execute on function public.my_airport_orders(), public.customer_airport_offers(uuid), public.accept_airport_offer(uuid),
  public.reject_airport_offer(uuid) from public, anon;
grant execute on function public.my_airport_orders(), public.customer_airport_offers(uuid), public.accept_airport_offer(uuid),
  public.reject_airport_offer(uuid) to authenticated;
