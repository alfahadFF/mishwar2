-- السفريات (5 من 7): عرض سعر خاص بكل طلب، وليس تعرفة عامة.
create or replace function public.travel_send_offer(p_request uuid, p_fare_per_passenger numeric, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.travel_requests%rowtype; v_id uuid;
begin
  if me is null or not public._travel_provider_allowed(me) then raise exception 'TRAVEL_PROVIDER'; end if;
  if public.wallet_blocked(me) then raise exception 'WALLET_BLOCKED'; end if;
  if p_fare_per_passenger is null or p_fare_per_passenger <= 0 then raise exception 'TRAVEL_PRICE'; end if;
  select * into r from public.travel_requests where id=p_request for update;
  if not found or r.status<>'open' then raise exception 'TRAVEL_REQUEST_CLOSED'; end if;
  if r.passenger_id=me then raise exception 'TRAVEL_SELF_OFFER'; end if;
  insert into public.travel_offers(request_id,provider_id,fare_per_passenger,notes)
  values (p_request,me,round(p_fare_per_passenger,2),nullif(btrim(p_notes),'')) returning id into v_id;
  insert into public.user_notifications(user_id,kind,title,body,data)
  values (r.passenger_id,'travel_offer','عرض جديد لطلب السفر','وصل عرض سعر جديد لطلبك.',jsonb_build_object('request_id',p_request,'offer_id',v_id));
  return jsonb_build_object('id',v_id,'status','pending');
exception when unique_violation then raise exception 'TRAVEL_OFFER_EXISTS';
end; $$;

revoke execute on function public.travel_send_offer(uuid,numeric,text) from public, anon;
grant execute on function public.travel_send_offer(uuid,numeric,text) to authenticated;
