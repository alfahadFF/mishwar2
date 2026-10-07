-- السفريات (4 من 7): نشر الرحلات وطلبات الركاب وإدارتها.
create or replace function public.travel_create_listing(
  p_destination text, p_departure_at timestamptz, p_seats int, p_fare_per_passenger numeric,
  p_baggage_limit int default null, p_notes text default null, p_security_approval boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid;
begin
  if me is null or not public._travel_provider_allowed(me) then raise exception 'TRAVEL_PROVIDER'; end if;
  if public.wallet_blocked(me) then raise exception 'WALLET_BLOCKED'; end if;
  if coalesce(length(btrim(p_destination)),0) not between 1 and 120 then raise exception 'TRAVEL_DESTINATION'; end if;
  if p_departure_at is null or p_departure_at <= now() then raise exception 'TRAVEL_DEPARTURE'; end if;
  if p_seats not between 1 and 50 or p_fare_per_passenger is null or p_fare_per_passenger <= 0 then raise exception 'TRAVEL_PRICE'; end if;
  if p_baggage_limit is not null and p_baggage_limit < 0 then raise exception 'TRAVEL_BAGS'; end if;
  insert into public.travel_listings(provider_id,destination,departure_at,seats_total,seats_left,
    fare_per_passenger,baggage_limit,notes,security_approval)
  values (me,btrim(p_destination),p_departure_at,p_seats,p_seats,round(p_fare_per_passenger,2),
    p_baggage_limit,nullif(btrim(p_notes),''),coalesce(p_security_approval,false)) returning id into v_id;
  return jsonb_build_object('id',v_id,'status','active');
end; $$;

create or replace function public.travel_listing_action(p_listing uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_status text;
begin
  if me is null or not public._travel_provider_allowed(me) then raise exception 'TRAVEL_PROVIDER'; end if;
  if p_action='pause' then update public.travel_listings set status='paused' where id=p_listing and provider_id=me and status='active' returning status into v_status;
  elsif p_action='resume' then update public.travel_listings set status='active' where id=p_listing and provider_id=me and status='paused' and departure_at>now() and seats_left>0 returning status into v_status;
  elsif p_action='cancel' then update public.travel_listings set status='cancelled' where id=p_listing and provider_id=me and status in ('active','paused') returning status into v_status;
  else raise exception 'TRAVEL_ACTION'; end if;
  if v_status is null then raise exception 'TRAVEL_LISTING_STATE'; end if;
  return jsonb_build_object('status',v_status);
end; $$;

create or replace function public.travel_post_request(
  p_pickup_lat double precision, p_pickup_lng double precision, p_pickup_label text,
  p_destination text, p_passengers int, p_bags int default 0, p_has_luggage boolean default false, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid;
begin
  if me is null then raise exception 'NOT_AUTH'; end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180 then raise exception 'TRAVEL_PICKUP'; end if;
  if coalesce(length(btrim(p_pickup_label)),0)=0 or coalesce(length(btrim(p_destination)),0) not between 1 and 120 then raise exception 'TRAVEL_DESTINATION'; end if;
  if p_passengers not between 1 and 50 or coalesce(p_bags,0) not between 0 and 30 then raise exception 'TRAVEL_COUNT'; end if;
  insert into public.travel_requests(passenger_id,pickup_lat,pickup_lng,pickup_label,destination,passengers,bags,has_luggage,notes)
  values (me,p_pickup_lat,p_pickup_lng,btrim(p_pickup_label),btrim(p_destination),p_passengers,coalesce(p_bags,0),coalesce(p_has_luggage,false),nullif(btrim(p_notes),'')) returning id into v_id;
  insert into public.user_notifications(user_id,kind,title,body,data)
  select p.id,'travel_request','طلب سفر جديد','وصل طلب سفر مفتوح.',jsonb_build_object('request_id',v_id)
  from public.profiles p where p.id<>me and p.type::text in ('driver','business') and coalesce(p.svc_travel,false)
    and p.work_registered_at is not null and not public.wallet_blocked(p.id);
  return jsonb_build_object('id',v_id,'status','open');
end; $$;

create or replace function public.travel_cancel_request(p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'NOT_AUTH'; end if;
  update public.travel_requests set status='cancelled',close_reason='passenger_cancelled'
   where id=p_request and passenger_id=me and status='open';
  if not found then raise exception 'TRAVEL_REQUEST_STATE'; end if;
  update public.travel_offers set status='cancelled' where request_id=p_request and status='pending';
  return jsonb_build_object('status','cancelled');
end; $$;

revoke execute on function public.travel_create_listing(text,timestamptz,int,numeric,int,text,boolean) from public, anon;
revoke execute on function public.travel_listing_action(uuid,text) from public, anon;
revoke execute on function public.travel_post_request(double precision,double precision,text,text,int,int,boolean,text) from public, anon;
revoke execute on function public.travel_cancel_request(uuid) from public, anon;
grant execute on function public.travel_create_listing(text,timestamptz,int,numeric,int,text,boolean) to authenticated;
grant execute on function public.travel_listing_action(uuid,text) to authenticated;
grant execute on function public.travel_post_request(double precision,double precision,text,text,int,int,boolean,text) to authenticated;
grant execute on function public.travel_cancel_request(uuid) to authenticated;
