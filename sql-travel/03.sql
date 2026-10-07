-- السفريات (3 من 7): التحقق والبحث وبيانات الطرفين.
create or replace function public._travel_provider_allowed(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.type::text in ('driver','business') and coalesce(p.svc_travel,false)
      and p.work_registered_at is not null from public.profiles p where p.id = p_user), false);
$$;
revoke all on function public._travel_provider_allowed(uuid) from public, anon, authenticated;

-- بحث عام بلا أرقام تواصل؛ تظهر الرحلات المتاحة فقط.
create or replace function public.travel_search()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id',l.id,'provider_name',coalesce(nullif(p.office_name,''),p.full_name),
    'provider_type',p.type::text,'destination',l.destination,'departure_at',l.departure_at,
    'seats_total',l.seats_total,'seats_left',l.seats_left,'fare_per_passenger',l.fare_per_passenger,
    'baggage_limit',l.baggage_limit,'notes',l.notes,'security_approval',l.security_approval)
  from public.travel_listings l join public.profiles p on p.id = l.provider_id
  where l.status = 'active' and l.seats_left > 0 and l.departure_at > now()
    and public._travel_provider_allowed(l.provider_id) and not public.wallet_blocked(l.provider_id)
  order by l.departure_at limit 200;
$$;

create or replace function public.travel_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); result jsonb;
begin
  if me is null then raise exception 'NOT_AUTH'; end if;
  select jsonb_build_object(
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'destination',r.destination,
      'pickup_label',r.pickup_label,'passengers',r.passengers,'bags',r.bags,'has_luggage',r.has_luggage,
      'notes',r.notes,'status',r.status,'close_reason',r.close_reason,'created_at',r.created_at,
      'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'fare_per_passenger',o.fare_per_passenger,
        'notes',o.notes,'status',o.status,'provider_name',coalesce(nullif(p.office_name,''),p.full_name),
        'provider_phone',case when r.status='accepted' and o.status='accepted' then p.phone end)
        order by o.created_at) from public.travel_offers o join public.profiles p on p.id=o.provider_id where o.request_id=r.id),'[]'::jsonb))
      order by r.created_at desc) from public.travel_requests r where r.passenger_id=me),'[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'destination',b.destination,
      'departure_at',b.departure_at,'pickup_label',b.pickup_label,'passengers',b.passengers,'bags',b.bags,
      'has_luggage',b.has_luggage,'fare_per_passenger',b.fare_per_passenger,'total',b.total,'status',b.status,
      'provider_name',coalesce(nullif(p.office_name,''),p.full_name),
      'provider_phone',case when b.status='confirmed' then p.phone end) order by b.created_at desc)
      from public.travel_bookings b join public.profiles p on p.id=b.provider_id where b.passenger_id=me),'[]'::jsonb))
  into result;
  return result;
end; $$;

create or replace function public.travel_provider_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); result jsonb;
begin
  if me is null or not public._travel_provider_allowed(me) then raise exception 'TRAVEL_PROVIDER'; end if;
  select jsonb_build_object(
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'destination',l.destination,
      'departure_at',l.departure_at,'seats_total',l.seats_total,'seats_left',l.seats_left,
      'fare_per_passenger',l.fare_per_passenger,'baggage_limit',l.baggage_limit,'notes',l.notes,
      'security_approval',l.security_approval,'status',l.status) order by l.departure_at desc)
      from public.travel_listings l where l.provider_id=me),'[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'destination',r.destination,
      'pickup_label',r.pickup_label,'passengers',r.passengers,'bags',r.bags,'has_luggage',r.has_luggage,
      'notes',r.notes,'created_at',r.created_at,'my_offer_id',(select o.id from public.travel_offers o
        where o.request_id=r.id and o.provider_id=me)) order by r.created_at desc)
      from public.travel_requests r where r.status='open' and r.passenger_id<>me),'[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'destination',r.destination,
      'fare_per_passenger',o.fare_per_passenger,'notes',o.notes,'status',o.status,
      'passenger_phone',case when o.status='accepted' then passenger.phone end) order by o.created_at desc)
      from public.travel_offers o join public.travel_requests r on r.id=o.request_id
      join public.profiles passenger on passenger.id=r.passenger_id where o.provider_id=me),'[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'destination',b.destination,
      'departure_at',b.departure_at,'pickup_label',b.pickup_label,'passengers',b.passengers,'bags',b.bags,
      'has_luggage',b.has_luggage,'total',b.total,'status',b.status,
      'passenger_phone',case when b.status='confirmed' then passenger.phone end) order by b.created_at desc)
      from public.travel_bookings b join public.profiles passenger on passenger.id=b.passenger_id where b.provider_id=me),'[]'::jsonb))
  into result;
  return result;
end; $$;

revoke execute on function public.travel_search() from public;
revoke execute on function public.travel_my_data() from public, anon;
revoke execute on function public.travel_provider_data() from public, anon;
grant execute on function public.travel_search() to anon, authenticated;
grant execute on function public.travel_my_data() to authenticated;
grant execute on function public.travel_provider_data() to authenticated;
