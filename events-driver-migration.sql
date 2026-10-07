-- =====================================================================
-- سائق المناسبات: مركبة السائق وخدماته + عروض لكل مركبة + القبول بالعمولة
-- آمن للتكرار. لا يحذف بيانات.
-- =====================================================================

-- ---------- 1) بيانات مركبة السائق وخدماته (من التسجيل) ----------
alter table public.profiles add column if not exists event_vehicle_type text
  check (event_vehicle_type in ('bus_large_50','bus_mid_27','bus_mid_21','bus_mid_18','bus_small_14','van_11','van_8','car'));
alter table public.profiles add column if not exists vehicle_seats int check (vehicle_seats between 1 and 60);
alter table public.profiles add column if not exists vehicle_model text;
alter table public.profiles add column if not exists vehicle_year int check (vehicle_year between 1970 and 2100);
alter table public.profiles add column if not exists vehicle_color text;
alter table public.profiles add column if not exists vehicle_photo_url text;
alter table public.profiles add column if not exists svc_events boolean not null default false;   -- رحلات ومناسبات
alter table public.profiles add column if not exists svc_wedding boolean not null default false;  -- خدمة الزفاف (أي سيارة)

-- ---------- 2) حماية بيانات المركبة: لا يغيّرها السائق بنفسه ----------
create or replace function public._protect_vehicle_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from profiles where id = auth.uid() and (account_type = 'admin' or type = 'admin'))
     and (new.vehicle_class is distinct from old.vehicle_class
       or new.event_vehicle_type is distinct from old.event_vehicle_type
       or new.vehicle_seats is distinct from old.vehicle_seats
       or new.svc_events is distinct from old.svc_events
       or new.svc_wedding is distinct from old.svc_wedding) then
    raise exception 'VEHICLE_FIELDS_LOCKED';
  end if;
  return new;
end; $$;
drop trigger if exists trg_protect_vehicle_fields on public.profiles;
create trigger trg_protect_vehicle_fields before update on public.profiles
  for each row execute function public._protect_vehicle_fields();

-- ---------- 3) طلبات المناسبات ----------
-- pending = بانتظار العروض • accepted = اكتملت كل المركبات
alter table public.event_orders add column if not exists wait boolean not null default true;
alter table public.event_orders add column if not exists total_seats int;
drop policy if exists "العميل يرى طلباته" on public.event_orders;
create policy "العميل يرى طلباته" on public.event_orders for select using (auth.uid() = user_id);
drop policy if exists "العميل يعدل طلبه" on public.event_orders;   -- الحالة والإلغاء عبر الدوال فقط

-- ---------- 4) عروض السائقين: عرض لكل مركبة ----------
alter table public.event_offers add column if not exists item_type text
  check (item_type in ('wedding_car','bus_large_50','bus_mid_27','bus_mid_21','bus_mid_18','bus_small_14','van_11','van_8'));
alter table public.event_offers add column if not exists vehicle jsonb;          -- نسخة من بيانات المركبة وقت العرض
alter table public.event_offers add column if not exists reason text;            -- filled / customer / cancelled
alter table public.event_offers add column if not exists commission numeric(12,2);
alter table public.event_offers add column if not exists completed_at timestamptz;
do $$ declare r record; begin
  for r in select conname from pg_constraint
            where conrelid = 'public.event_offers'::regclass
              and ((contype = 'c' and pg_get_constraintdef(oid) like '%status%') or contype = 'u') loop
    execute format('alter table public.event_offers drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.event_offers add constraint event_offers_status_check
  check (status in ('pending','accepted','rejected','withdrawn','cancelled'));
-- عرض فعّال واحد لكل سائق في الطلب (يمكنه العرض من جديد بعد السحب)
create unique index if not exists uq_event_offer_active on public.event_offers(event_order_id, driver_id)
  where status in ('pending','accepted');
drop policy if exists "عرض مرئي للجميع" on public.event_offers;
drop policy if exists "السائق ينشئ عرض" on public.event_offers;
drop policy if exists "إدارة العرض" on public.event_offers;
drop policy if exists "event_offers_select" on public.event_offers;
create policy "event_offers_select" on public.event_offers for select using (
  auth.uid() = driver_id or auth.uid() = (select user_id from public.event_orders where id = event_order_id));

-- ---------- 5) دوال مساعدة ----------
-- المتبقي من كل نوع مركبة في الطلب
create or replace function public._ev_items_left(p_order uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(v.item || jsonb_build_object('left', greatest(0, coalesce((v.item->>'count')::int, 0) - (
           select count(*) from event_offers f
            where f.event_order_id = p_order and f.item_type = v.item->>'type' and f.status = 'accepted')::int))
         order by v.ord), '[]'::jsonb)
    from event_orders o, jsonb_array_elements(coalesce(o.vehicles, '[]'::jsonb)) with ordinality v(item, ord)
   where o.id = p_order;
$$;
-- الباصات والفانات: أي سائق باص/فان • سيارة الزفاف: من فعّل خدمة الزفاف
create or replace function public._ev_can_serve(p_item text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case when p_item = 'wedding_car' then p.svc_wedding and p.event_vehicle_type is not null
                               else p.svc_events and p.event_vehicle_type in
                                    ('bus_large_50','bus_mid_27','bus_mid_21','bus_mid_18','bus_small_14','van_11','van_8') end
                     from profiles p where p.id = p_user), false);
$$;
revoke all on function public._ev_items_left(uuid) from public, anon, authenticated;
revoke all on function public._ev_can_serve(text, uuid) from public, anon, authenticated;

-- ---------- 6) السائق: الطلبات ضمن 10 كم ----------
drop function if exists public.driver_events_feed(double precision, double precision, double precision);
create or replace function public.driver_events_feed(p_lat double precision, p_lng double precision, p_radius_km double precision default 10)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' - 'driver_id' - 'budget_type' - 'budget_from' - 'budget_to'
         || jsonb_build_object('distance_km', round(d.dist::numeric, 2), 'items', public._ev_items_left(o.id),
              'my_offer', (select jsonb_build_object('id', f.id, 'price', f.offered_price, 'item_type', f.item_type)
                             from event_offers f where f.event_order_id = o.id and f.driver_id = auth.uid() and f.status = 'pending'))
    from event_orders o
    cross join lateral (select 2 * 6371 * asin(sqrt(
             power(sin(radians((o.gathering_lat - p_lat) / 2)), 2) +
             cos(radians(p_lat)) * cos(radians(o.gathering_lat)) *
             power(sin(radians((o.gathering_lng - p_lng) / 2)), 2))) as dist) d
   where auth.uid() is not null
     and o.status = 'pending' and o.gathering_lat is not null and o.user_id <> auth.uid()
     and d.dist <= least(coalesce(p_radius_km, 10), 10)
     and not public.wallet_blocked(auth.uid())
     and not exists (select 1 from event_offers f where f.event_order_id = o.id and f.driver_id = auth.uid() and f.status = 'accepted')
     and exists (select 1 from jsonb_array_elements(public._ev_items_left(o.id)) it
                  where (it->>'left')::int > 0 and public._ev_can_serve(it->>'type', auth.uid()))
   order by d.dist;
$$;

-- ---------- 7) السائق: إرسال عرض وسحبه ----------
create or replace function public.driver_send_event_offer(p_order uuid, p_item text, p_price numeric, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o event_orders%rowtype; v_left int; v_id uuid; v_vehicle jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_BLOCKED'; end if;
  if p_price is null or p_price <= 0 then raise exception 'BAD_PRICE'; end if;
  select * into o from event_orders where id = p_order for update;
  if not found or o.status <> 'pending' then raise exception 'ORDER_CLOSED'; end if;
  if o.user_id = auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if not public._ev_can_serve(p_item, auth.uid()) then raise exception 'VEHICLE_MISMATCH'; end if;
  select (it->>'left')::int into v_left from jsonb_array_elements(public._ev_items_left(p_order)) it where it->>'type' = p_item;
  if coalesce(v_left, 0) < 1 then raise exception 'ITEM_FILLED'; end if;
  if exists (select 1 from event_offers where event_order_id = p_order and driver_id = auth.uid() and status in ('pending','accepted')) then
    raise exception 'ALREADY_OFFERED';
  end if;
  select jsonb_build_object('type', event_vehicle_type, 'seats', vehicle_seats, 'model', vehicle_model,
                            'year', vehicle_year, 'color', vehicle_color, 'photo', vehicle_photo_url)
    into v_vehicle from profiles where id = auth.uid();
  insert into event_offers(event_order_id, driver_id, offered_price, currency, message, status, item_type, vehicle)
  values (p_order, auth.uid(), round(p_price, 2), 'USD', nullif(trim(p_message), ''), 'pending', p_item, v_vehicle)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.driver_withdraw_event_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update event_offers set status = 'withdrawn' where id = p_offer and driver_id = auth.uid() and status = 'pending';
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;

-- ---------- 8) الزبون: طلباتي والعروض والقبول والرفض ----------
drop function if exists public.my_event_orders();
create or replace function public.my_event_orders()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) || jsonb_build_object('items', public._ev_items_left(o.id))
    from event_orders o where o.user_id = auth.uid() order by o.created_at desc;
$$;

drop function if exists public.customer_event_offers(uuid);
create or replace function public.customer_event_offers(p_order uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'item_type', f.item_type, 'vehicle', f.vehicle, 'price', f.offered_price,
           'message', f.message, 'status', f.status, 'reason', f.reason, 'created_at', f.created_at, 'accepted_at', f.accepted_at,
           'driver_name', case when f.status = 'accepted' then p.full_name end,
           'driver_phone', case when f.status = 'accepted' then p.phone end)
    from event_offers f
    join event_orders o on o.id = f.event_order_id
    left join profiles p on p.id = f.driver_id
   where o.id = p_order and o.user_id = auth.uid() and f.status not in ('withdrawn','cancelled')
   order by (f.status = 'accepted') desc, f.offered_price;
$$;

-- قبول عرض: خصم العمولة (أو الفترة المجانية)، وإغلاق النوع المكتمل، واكتمال الطلب
create or replace function public.accept_event_offer(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f event_offers%rowtype; o event_orders%rowtype; v_left int; v_fee numeric; p profiles%rowtype;
begin
  select * into f from event_offers where id = p_offer_id;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into o from event_orders where id = f.event_order_id for update;
  if o.user_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status <> 'pending' then raise exception 'ORDER_CLOSED'; end if;
  select * into f from event_offers where id = p_offer_id for update;
  if f.status <> 'pending' then raise exception 'OFFER_NOT_AVAILABLE'; end if;
  select (it->>'left')::int into v_left from jsonb_array_elements(public._ev_items_left(o.id)) it where it->>'type' = f.item_type;
  if coalesce(v_left, 0) < 1 then raise exception 'ITEM_FILLED'; end if;

  v_fee := public._wallet_charge(f.driver_id, 'events', o.id, f.offered_price);
  update event_offers set status = 'accepted', accepted_at = now(), commission = v_fee where id = f.id;
  if v_left = 1 then
    update event_offers set status = 'rejected', reason = 'filled'
     where event_order_id = o.id and item_type = f.item_type and status = 'pending';
  end if;
  if not exists (select 1 from jsonb_array_elements(public._ev_items_left(o.id)) it where (it->>'left')::int > 0) then
    update event_orders set status = 'accepted' where id = o.id;
    update event_offers set status = 'rejected', reason = 'filled' where event_order_id = o.id and status = 'pending';
  end if;
  select * into p from profiles where id = f.driver_id;
  return jsonb_build_object('commission', v_fee, 'driver_name', p.full_name, 'driver_phone', p.phone,
                            'order_status', (select status from event_orders where id = o.id));
end; $$;

create or replace function public.reject_event_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update event_offers f set status = 'rejected', reason = 'customer'
   where f.id = p_offer and f.status = 'pending'
     and exists (select 1 from event_orders o where o.id = f.event_order_id and o.user_id = auth.uid());
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;

-- إلغاء الطلب: قبل قبول أي عرض فقط
create or replace function public.cancel_event_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from event_offers where event_order_id = p_order and status = 'accepted') then raise exception 'HAS_ACCEPTED'; end if;
  update event_orders set status = 'cancelled' where id = p_order and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'ORDER_CLOSED'; end if;
  update event_offers set status = 'rejected', reason = 'cancelled' where event_order_id = p_order and status = 'pending';
end; $$;

-- ---------- 9) السائق: عروضي وأعمالي وإتمام المناسبة ----------
drop function if exists public.driver_my_event_offers();
create or replace function public.driver_my_event_offers()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'order_id', o.id, 'item_type', f.item_type, 'price', f.offered_price,
           'status', f.status, 'reason', f.reason, 'created_at', f.created_at, 'order_status', o.status,
           'event_type', o.event_type, 'event_type_other', o.event_type_other,
           'gathering_point', o.gathering_point, 'gathering_time', o.gathering_time)
    from event_offers f join event_orders o on o.id = f.event_order_id
   where f.driver_id = auth.uid() and f.status in ('pending','rejected')
   order by f.created_at desc;
$$;

drop function if exists public.driver_event_jobs();
create or replace function public.driver_event_jobs()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' - 'driver_id' - 'budget_type' - 'budget_from' - 'budget_to'
         || jsonb_build_object('offer_id', f.id, 'item_type', f.item_type, 'price', f.offered_price,
              'commission', f.commission, 'accepted_at', f.accepted_at, 'completed_at', f.completed_at,
              'customer_name', p.full_name, 'customer_phone', p.phone)
    from event_offers f
    join event_orders o on o.id = f.event_order_id
    left join profiles p on p.id = o.user_id
   where f.driver_id = auth.uid() and f.status = 'accepted'
   order by f.accepted_at desc;
$$;

create or replace function public.driver_complete_event(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  update event_offers set completed_at = now()
   where id = p_offer and driver_id = auth.uid() and status = 'accepted' and completed_at is null
  returning event_order_id into v_order;
  if v_order is null then raise exception 'NOT_ALLOWED'; end if;
  -- عندما يُتم كل السائقين، يكتمل الطلب
  if not exists (select 1 from event_offers where event_order_id = v_order and status = 'accepted' and completed_at is null)
     and (select status from event_orders where id = v_order) = 'accepted' then
    update event_orders set status = 'completed' where id = v_order;
  end if;
end; $$;

grant execute on function public.driver_events_feed(double precision, double precision, double precision) to authenticated;
grant execute on function public.driver_send_event_offer(uuid, text, numeric, text) to authenticated;
grant execute on function public.driver_withdraw_event_offer(uuid) to authenticated;
grant execute on function public.my_event_orders() to authenticated;
grant execute on function public.customer_event_offers(uuid) to authenticated;
grant execute on function public.accept_event_offer(uuid) to authenticated;
grant execute on function public.reject_event_offer(uuid) to authenticated;
grant execute on function public.cancel_event_order(uuid) to authenticated;
grant execute on function public.driver_my_event_offers() to authenticated;
grant execute on function public.driver_event_jobs() to authenticated;
grant execute on function public.driver_complete_event(uuid) to authenticated;

-- ---------- 10) فحص ----------
select 'الدوال' as "الفحص", count(*)::text || ' من 13' as "النتيجة" from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('_ev_items_left','_ev_can_serve','driver_events_feed','driver_send_event_offer',
   'driver_withdraw_event_offer','my_event_orders','customer_event_offers','accept_event_offer','reject_event_offer',
   'cancel_event_order','driver_my_event_offers','driver_event_jobs','driver_complete_event')
union all
select 'حماية بيانات المركبة', case when exists (select 1 from pg_trigger where tgname = 'trg_protect_vehicle_fields') then 'مفعّلة' else 'غير مفعّلة' end
union all
select 'عرض جديد بعد السحب', case when exists (select 1 from pg_indexes where indexname = 'uq_event_offer_active') then 'مسموح' else 'ممنوع' end
union all
select 'عمولة المناسبات', (select (rate*100)::int || '%' from public.service_commissions where service = 'events');
