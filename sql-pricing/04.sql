-- تسعير التكسي (4 من 4): عرض العملة المحلية في بيانات الرحلة والإشعارات
create or replace function public.my_taxi_active()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',o.id,'status',o.status,'fare',coalesce(o.final_fare,o.estimated_fare),
    'fare_local',o.fare_local,'local_currency',o.local_currency,'pricing_exchange_rate',o.pricing_exchange_rate,
    'commission_rate',o.commission_rate,'commission_local',o.commission_local,'driver_net_local',o.driver_net_local,
    'distance_km',o.distance_km,'category',o.vehicle_category,
    'pickup',jsonb_build_array(o.pickup_lat,o.pickup_lng),'dropoff',jsonb_build_array(o.dropoff_lat,o.dropoff_lng),
    'driver_name',p.full_name,'vehicle_model',p.vehicle_model,'vehicle_color',p.vehicle_color,
    'discount_pct',public._wallet_discount_pct(),'completed_at',o.completed_at)
  from public.taxi_orders o left join public.profiles p on p.id=o.driver_id
  where o.user_id=auth.uid()
    and (o.status in ('pending','searching','accepted','arrived','in_progress')
      or (o.status='completed' and o.completed_at>now()-interval '1 day'
        and not exists(select 1 from public.wallet_payments w where w.service='taxi' and w.ref_id=o.id)))
  order by o.created_at desc limit 1;
$$;
grant execute on function public.my_taxi_active() to authenticated;

create or replace function public._taxi_driver_json(o public.taxi_orders)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_free boolean:=now()<coalesce(public.free_until(auth.uid()),'-infinity'::timestamptz);
begin
  return jsonb_build_object('id',o.id,'status',o.status,'fare',o.estimated_fare,
    'fare_local',o.fare_local,'local_currency',o.local_currency,
    'commission_rate',case when v_free then 0 else o.commission_rate end,
    'commission_local',case when v_free then 0 else o.commission_local end,
    'driver_net_local',case when v_free then o.fare_local else o.driver_net_local end,
    'commission_waived',v_free,'distance_km',o.distance_km,
    'pickup',jsonb_build_array(o.pickup_lat,o.pickup_lng),'dropoff',jsonb_build_array(o.dropoff_lat,o.dropoff_lng),
    'customer_phone',(select phone from public.profiles where id=o.user_id));
end; $$;
revoke all on function public._taxi_driver_json(public.taxi_orders) from public,anon,authenticated;

drop function if exists public.driver_taxi_active();
create function public.driver_taxi_active()
returns jsonb language sql stable security definer set search_path=public as $$
  with a as (
    select o,row_number() over(order by case o.status when 'in_progress' then 0 when 'arrived' then 1 else 2 end,o.accepted_at) rn
    from public.taxi_orders o where o.driver_id=auth.uid() and o.status in ('accepted','arrived','in_progress'))
  select public._taxi_driver_json(c.o)
    || jsonb_build_object('next',(select public._taxi_driver_json(n.o) from a n where n.rn=2))
  from a c where c.rn=1;
$$;
grant execute on function public.driver_taxi_active() to authenticated;

create or replace function public.driver_taxi_complete(p_order uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.taxi_orders; v_fare numeric; v_pct numeric:=public._wallet_discount_pct(); v_fee numeric; v_local_fee numeric; v_rate numeric;
begin
  select * into o from public.taxi_orders where id=p_order for update;
  if o.id is null or o.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status not in ('arrived','in_progress') then raise exception 'BAD_STEP'; end if;
  v_fare:=o.estimated_fare;
  update public.taxi_orders set status='completed',completed_at=now(),final_fare=v_fare,
    started_at=coalesce(started_at,now()) where id=o.id;
  v_fee:=public._wallet_charge(auth.uid(),'taxi',o.id,v_fare);
  select rate into v_rate from public.service_commissions where service='taxi';
  v_local_fee:=case when v_fee=0 then 0 else round(o.fare_local*coalesce(v_rate,o.commission_rate),2) end;
  insert into public.user_notifications(user_id,kind,title,body,data)
  values(o.user_id,'taxi_completed','انتهت الرحلة',
    'الأجرة '||public._amt(coalesce(o.fare_local,v_fare))||' '||coalesce(o.local_currency,'USD')
      ||case when v_pct>0 then ' • من المحفظة '||public._amt(v_fare-round(v_fare*v_pct/100,2))||' USD' else '' end,
    jsonb_build_object('order_id',o.id,'service','taxi'));
  return jsonb_build_object('status','completed','fare',v_fare,'fare_local',o.fare_local,
    'local_currency',o.local_currency,'commission',v_fee,'commission_local',v_local_fee,
    'driver_net_local',o.fare_local-v_local_fee);
end; $$;
grant execute on function public.driver_taxi_complete(uuid) to authenticated;

create or replace function public._push_on_taxi_new()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_users uuid[];
begin
  if new.status<>'pending' or new.driver_id is not null then return new; end if;
  select array_agg(d.driver_id) into v_users from public.taxi_driver_positions d
   where d.updated_at>now()-interval '30 minutes' and d.category=new.vehicle_category
    and d.driver_id<>new.user_id and public._push_km(new.pickup_lat,new.pickup_lng,d.lat,d.lng)<=coalesce(new.search_radius_km,5)
    and public._push_new_orders_ok(d.driver_id) and not public._taxi_suspended(d.driver_id);
  if v_users is not null then
    perform public._push_send(v_users,'🚕 طلب تكسي جديد',
      '📏 '||coalesce(round(new.distance_km::numeric,1)::text,'?')||' كم • '
       ||coalesce(public._amt(new.fare_local),'?')||' '||coalesce(new.local_currency,'SYP'),
      jsonb_build_object('order_id',new.id),'taxi_new');
  end if;
  return new;
end; $$;
drop trigger if exists trg_push_taxi_new on public.taxi_orders;
create trigger trg_push_taxi_new after insert on public.taxi_orders
for each row execute function public._push_on_taxi_new();
