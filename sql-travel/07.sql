-- السفريات (7 من 7): حجز رحلة منشورة وتحديث المقاعد وإخفاء الطلب المطابق.
create or replace function public.travel_book_listing(
  p_listing uuid, p_pickup_lat double precision, p_pickup_lng double precision, p_pickup_label text,
  p_passengers int, p_bags int default 0, p_has_luggage boolean default false, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l public.travel_listings%rowtype; v_booking uuid; v_total numeric;

begin
  if me is null then raise exception 'NOT_AUTH'; end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180 then raise exception 'TRAVEL_PICKUP'; end if;
  if coalesce(length(btrim(p_pickup_label)),0)=0 or p_passengers not between 1 and 50 or coalesce(p_bags,0) not between 0 and 30 then raise exception 'TRAVEL_COUNT'; end if;
  select * into l from public.travel_listings where id=p_listing for update;
  if not found or l.status<>'active' or l.departure_at<=now() or l.seats_left<p_passengers then raise exception 'TRAVEL_LISTING_UNAVAILABLE'; end if;
  if l.provider_id=me then raise exception 'TRAVEL_SELF_BOOK'; end if;
  if not public._travel_provider_allowed(l.provider_id) or public.wallet_blocked(l.provider_id) then raise exception 'TRAVEL_PROVIDER_INACTIVE'; end if;
  if l.baggage_limit is not null and p_bags>l.baggage_limit then raise exception 'TRAVEL_BAGS'; end if;
  v_total := round(l.fare_per_passenger*p_passengers,2);
  insert into public.travel_bookings(listing_id,passenger_id,provider_id,pickup_lat,pickup_lng,pickup_label,
    destination,departure_at,passengers,bags,has_luggage,notes,fare_per_passenger,total)
  values (l.id,me,l.provider_id,p_pickup_lat,p_pickup_lng,btrim(p_pickup_label),l.destination,l.departure_at,
    p_passengers,coalesce(p_bags,0),coalesce(p_has_luggage,false),nullif(btrim(p_notes),''),l.fare_per_passenger,v_total)
  returning id into v_booking;
  update public.travel_listings set seats_left=seats_left-p_passengers,
    status=case when seats_left-p_passengers=0 then 'full' else status end where id=l.id;
  with closed as (
    update public.travel_requests set status='closed',close_reason='booked_listing',accepted_at=now()
    where passenger_id=me and status='open' and lower(btrim(destination))=lower(btrim(l.destination)) returning id)
  update public.travel_offers o set status='rejected' from closed c where o.request_id=c.id and o.status='pending';
  insert into public.user_notifications(user_id,kind,title,body,data)
  values (l.provider_id,'travel_booking','حجز جديد لرحلتك','تم تأكيد حجز مقاعد في رحلتك.',jsonb_build_object('booking_id',v_booking));
  return jsonb_build_object('booking_id',v_booking,'total',v_total,'status','confirmed');
end; $$;

revoke execute on function public.travel_book_listing(uuid,double precision,double precision,text,int,int,boolean,text) from public, anon;
grant execute on function public.travel_book_listing(uuid,double precision,double precision,text,int,int,boolean,text) to authenticated;
