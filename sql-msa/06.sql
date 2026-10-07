-- تعديل النصوص للفصحى (6 من 7): قبول ورفض الإيجار
create or replace function public._rental_book(p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r rental_requests; l rental_listings; v_fee numeric; x record;
begin
  select * into r from rental_requests where id = p_request for update;
  select * into l from rental_listings where id = r.listing_id for update;
  if r.status <> 'pending' then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  if l.status <> 'active' then raise exception 'RENTAL_NOT_AVAILABLE'; end if;
  -- الساعة/اليوم/الأسبوع: العمولة كاملة • الشهري: الشهر الأول الآن والباقي كل شهر
  v_fee := public._wallet_charge(r.provider_id, 'rental', r.id, case when r.unit = 'month' then r.unit_price else r.total end);
  update rental_requests set status = 'accepted', accepted_at = now(), commission_total = v_fee,
         months_charged = case when unit = 'month' then 1 else 0 end where id = r.id;
  update rental_listings set status = 'rented', rented_request = r.id, updated_at = now() where id = l.id;
  -- الطلبات الأخرى على السيارة نفسها تُرفض تلقائياً
  for x in update rental_requests set status = 'rejected', reason = 'rented'
            where listing_id = l.id and status = 'pending' and id <> r.id returning customer_id loop
    insert into user_notifications(user_id, kind, title, body, data)
    values (x.customer_id, 'rental_rejected', 'السيارة لم تعد متاحة', l.brand_model || ' تم تأجيرها', jsonb_build_object('listing_id', l.id));
  end loop;
  update rental_general_offers set status = 'cancelled' where listing_id = l.id and status = 'pending';
  insert into user_notifications(user_id, kind, title, body, data)
  values (r.customer_id, 'rental_accepted', 'تم قبول طلب الإيجار', l.brand_model || ' • يمكنك الآن الاطلاع على بيانات المؤجّر',
          jsonb_build_object('request_id', r.id));
  return jsonb_build_object('status', 'accepted', 'commission', v_fee);
end; $$;
revoke execute on function public._rental_book(uuid) from public, anon, authenticated;

create or replace function public.rental_provider_respond(p_request uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r rental_requests;
begin
  select * into r from rental_requests where id = p_request;
  if r.id is null or r.provider_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if r.status <> 'pending' then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  if p_action = 'accept' then
    if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_BLOCKED'; end if;
    return public._rental_book(r.id);
  elsif p_action = 'reject' then
    update rental_requests set status = 'rejected', reason = 'provider' where id = r.id;
    insert into user_notifications(user_id, kind, title, body, data)
    values (r.customer_id, 'rental_rejected', 'تم رفض طلب الإيجار', 'جرّب سيارة أخرى أو قدّم طلباً عاماً', jsonb_build_object('request_id', r.id));
    return jsonb_build_object('status', 'rejected');
  end if;
  raise exception 'BAD_STEP';
end; $$;
grant execute on function public.rental_provider_respond(uuid, text) to authenticated;
