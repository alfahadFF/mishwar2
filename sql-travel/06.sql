-- السفريات (6 من 7): اختيار عرض واحد وإغلاق الطلب أمام بقية مقدمي الخدمة.
-- تُطبّق عمولة السائق بعد تأكيد الحجز عبر المشغّل المضاف في الجزء 08.
create or replace function public.travel_choose_offer(p_offer uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o public.travel_offers%rowtype; r public.travel_requests%rowtype; v_booking uuid;
begin
  if me is null then raise exception 'NOT_AUTH'; end if;
  select * into o from public.travel_offers where id=p_offer;
  if not found then raise exception 'TRAVEL_OFFER_NOT_FOUND'; end if;
  select * into r from public.travel_requests where id=o.request_id for update;
  if not found then raise exception 'TRAVEL_REQUEST_CLOSED'; end if;
  select * into o from public.travel_offers where id=p_offer for update;
  if not found or r.passenger_id<>me or r.status<>'open' or o.status<>'pending' then raise exception 'TRAVEL_REQUEST_CLOSED'; end if;
  if not public._travel_provider_allowed(o.provider_id) or public.wallet_blocked(o.provider_id) then raise exception 'TRAVEL_PROVIDER_INACTIVE'; end if;
  update public.travel_requests set status='accepted',chosen_offer_id=o.id,accepted_at=now() where id=r.id;
  update public.travel_offers set status=case when id=o.id then 'accepted' else 'rejected' end
   where request_id=r.id and status='pending';
  insert into public.travel_bookings(request_id,offer_id,passenger_id,provider_id,pickup_lat,pickup_lng,
    pickup_label,destination,passengers,bags,has_luggage,notes,fare_per_passenger,total)
  values (r.id,o.id,r.passenger_id,o.provider_id,r.pickup_lat,r.pickup_lng,r.pickup_label,r.destination,
    r.passengers,r.bags,r.has_luggage,r.notes,o.fare_per_passenger,round(o.fare_per_passenger*r.passengers,2))
  returning id into v_booking;
  insert into public.user_notifications(user_id,kind,title,body,data)
  values (o.provider_id,'travel_accepted','تم قبول عرضك','اختار الراكب عرضك؛ بيانات التواصل متاحة في الحجوزات.',jsonb_build_object('booking_id',v_booking));
  return jsonb_build_object('booking_id',v_booking,'status','confirmed');
end; $$;

revoke execute on function public.travel_choose_offer(uuid) from public, anon;
grant execute on function public.travel_choose_offer(uuid) to authenticated;
