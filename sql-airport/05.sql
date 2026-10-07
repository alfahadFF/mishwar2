-- تكسي المطار (5 من 8): الإشعارات والتقييم والنقاط
-- طلب جديد ← السائقون المفعّلون ضمن 20 كم (آخر موقع خلال 12 ساعة)
create or replace function public._push_on_airport_new()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_users uuid[];
begin
  select array_agg(p.user_id) into v_users
    from provider_push_prefs p
   where p.loc_at > now() - interval '12 hours' and p.user_id <> new.user_id
     and public._push_km(new.pickup_lat, new.pickup_lng, p.lat, p.lng) <= 20
     and public._ap_can_serve(p.user_id) and public._push_new_orders_ok(p.user_id);
  if v_users is not null then
    perform public._push_send(v_users, '✈️ طلب مطار جديد قريب منك', 'افتح التطبيق للاطلاع على التفاصيل وتقديم عرضك',
      jsonb_build_object('order_id', new.id), 'airport_new');
  end if;
  return new;
end; $$;
drop trigger if exists trg_push_airport_new on public.airport_orders;
create trigger trg_push_airport_new after insert on public.airport_orders
  for each row execute function public._push_on_airport_new();

-- عرض جديد ← الزبون، واختيار العرض ← السائق
create or replace function public._notify_airport_offer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into user_notifications(user_id, kind, title, body, data)
    select o.user_id, 'offer_new', '📨 عرض جديد على طلب المطار', 'السعر: $' || new.price,
           jsonb_build_object('service', 'airport', 'order_id', o.id) from airport_orders o where o.id = new.order_id;
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into user_notifications(user_id, kind, title, body, data)
    values (new.driver_id, 'offer_accepted', '✅ قبل الزبون عرضك', 'طلب المطار — افتح «حجوزاتي» للاطلاع على التفاصيل',
            jsonb_build_object('service', 'airport', 'order_id', new.order_id));
  end if;
  return new;
end; $$;
drop trigger if exists trg_notify_airport_offer on public.airport_offers;
create trigger trg_notify_airport_offer after insert or update of status on public.airport_offers
  for each row execute function public._notify_airport_offer();

-- عند الإتمام: طلب التقييم ونقاط الزبون وعدّاد حوافز السائق
create or replace function public._on_airport_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public._rating_add(new.user_id, new.driver_id, 'airport', new.id, 0, now());
    perform public._loyalty_earn(new.user_id, new.driver_id, 'airport', new.id, new.agreed_price);
  end if;
  return new;
end; $$;
drop trigger if exists trg_airport_done on public.airport_orders;
create trigger trg_airport_done after update of status on public.airport_orders
  for each row execute function public._on_airport_done();

revoke execute on function public._push_on_airport_new(), public._notify_airport_offer(), public._on_airport_done() from public, anon, authenticated;
