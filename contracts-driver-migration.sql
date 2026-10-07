-- =====================================================================
-- العقود: يومي / أسبوعي / شهري • عرض لكل مركبة • عمولة 12%
-- اليومي والأسبوعي: العمولة على كامل العقد عند القبول
-- الشهري: الشهر الأول عند القبول، وكل شهر تالٍ عند فتح السائق للتطبيق بعد موعده
-- آمن للتكرار. لا يحذف بيانات.
-- =====================================================================

-- ---------- 1) طلب العقد ----------
alter table public.contract_orders add column if not exists contract_unit text check (contract_unit in ('day','week','month'));
alter table public.contract_orders add column if not exists unit_count int check (unit_count between 1 and 366);
alter table public.contract_orders add column if not exists total_seats int;
alter table public.contract_orders alter column duration_type drop not null;
do $$ declare r record; begin
  for r in select conname from pg_constraint
            where conrelid = 'public.contract_orders'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%duration_type%' loop
    execute format('alter table public.contract_orders drop constraint %I', r.conname);
  end loop;
end $$;

-- تاريخ النهاية: اليومي = يوم الدوام رقم N • الأسبوعي = N أسبوع • الشهري = N شهر
-- الأيام: 0 = الأحد ... 6 = السبت (كما في التطبيق)
create or replace function public._ct_end_date(p_start date, p_unit text, p_n int, p_days int[])
returns date language sql immutable as $$
  select case
    when p_start is null or p_n is null then null
    when p_unit = 'week'  then p_start + (7 * p_n - 1)
    when p_unit = 'month' then (p_start + make_interval(months => p_n))::date - 1
    else (select d::date from generate_series(p_start, p_start + 800, interval '1 day') d
           where coalesce(array_length(p_days, 1), 0) = 0 or extract(dow from d)::int = any(p_days)
           order by d offset p_n - 1 limit 1)
  end;
$$;
create or replace function public._ct_set_end()
returns trigger language plpgsql as $$
begin
  if new.contract_unit is not null then
    new.end_date := public._ct_end_date(new.start_date, new.contract_unit, new.unit_count, new.days);
    new.duration_type := new.contract_unit;
  end if;
  return new;
end; $$;
drop trigger if exists trg_ct_set_end on public.contract_orders;
create trigger trg_ct_set_end before insert or update of start_date, contract_unit, unit_count, days on public.contract_orders
  for each row execute function public._ct_set_end();

-- الزبون يرى عقوده فقط، وينشئ طلباً بحالة "بانتظار العروض" فقط. التعديل عبر الدوال.
drop policy if exists "العميل يرى عقوده" on public.contract_orders;
create policy "العميل يرى عقوده" on public.contract_orders for select using (auth.uid() = user_id);
drop policy if exists "العميل ينشئ عقد" on public.contract_orders;
create policy "العميل ينشئ عقد" on public.contract_orders for insert with check (auth.uid() = user_id and status = 'pending');
drop policy if exists "العميل يعدل عقده" on public.contract_orders;

-- ---------- 2) عروض السائقين: عرض لكل مركبة ----------
alter table public.contract_offers add column if not exists item_type text
  check (item_type in ('car','van_8','van_11','bus_small_14','bus_mid_18','bus_mid_21','bus_mid_27','bus_large_50'));
alter table public.contract_offers add column if not exists vehicle jsonb;              -- نسخة من بيانات المركبة وقت العرض
alter table public.contract_offers add column if not exists reason text;                -- filled / customer / cancelled
alter table public.contract_offers add column if not exists commission numeric(12,2);   -- عمولة القبول
alter table public.contract_offers add column if not exists commission_total numeric(12,2) not null default 0;
alter table public.contract_offers add column if not exists months_charged int not null default 0;
alter table public.contract_offers add column if not exists ended_at timestamptz;        -- أنهى الزبون العقد
alter table public.contract_offers alter column price_period drop default;
do $$ declare r record; begin
  for r in select conname from pg_constraint
            where conrelid = 'public.contract_offers'::regclass
              and ((contype = 'c' and (pg_get_constraintdef(oid) like '%status%' or pg_get_constraintdef(oid) like '%price_period%'))
                   or contype = 'u') loop
    execute format('alter table public.contract_offers drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.contract_offers add constraint contract_offers_status_check
  check (status in ('pending','accepted','rejected','withdrawn','cancelled'));
create unique index if not exists uq_contract_offer_active on public.contract_offers(contract_order_id, driver_id)
  where status in ('pending','accepted');
drop policy if exists "عرض عقد مرئي" on public.contract_offers;
drop policy if exists "السائق ينشئ عرض عقد" on public.contract_offers;
drop policy if exists "إدارة عرض العقد" on public.contract_offers;
drop policy if exists "contract_offers_select" on public.contract_offers;
create policy "contract_offers_select" on public.contract_offers for select using (
  auth.uid() = driver_id or auth.uid() = (select user_id from public.contract_orders where id = contract_order_id));

-- ---------- 3) دوال مساعدة ----------
create or replace function public._ct_items_left(p_order uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(v.item || jsonb_build_object('left', greatest(0, coalesce((v.item->>'count')::int, 0) - (
           select count(*) from contract_offers f
            where f.contract_order_id = p_order and f.item_type = v.item->>'type' and f.status = 'accepted')::int))
         order by v.ord), '[]'::jsonb)
    from contract_orders o, jsonb_array_elements(coalesce(o.vehicles, '[]'::jsonb)) with ordinality v(item, ord)
   where o.id = p_order;
$$;
-- الباصات والفانات: أي صاحب باص/فان • السيارة: أصحاب السيارات
create or replace function public._ct_can_serve(p_item text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case when p_item = 'car' then p.event_vehicle_type = 'car'
                               else p_item in ('van_8','van_11','bus_small_14','bus_mid_18','bus_mid_21','bus_mid_27','bus_large_50')
                                and p.event_vehicle_type in ('van_8','van_11','bus_small_14','bus_mid_18','bus_mid_21','bus_mid_27','bus_large_50') end
                     from profiles p where p.id = p_user), false);
$$;
-- خصم عمولة بتاريخ استحقاق محدد: المجانية تُحسب حسب تاريخ الاستحقاق لا وقت الخصم
create or replace function public._wallet_charge_at(p_user uuid, p_service text, p_ref uuid, p_gross numeric, p_at timestamptz)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_rate numeric; v_fee numeric; v_bal numeric; v_free boolean;
begin
  insert into wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  perform 1 from wallets where user_id = p_user for update;
  v_free := p_at < coalesce(public.free_until(p_user), '-infinity'::timestamptz);
  select rate into v_rate from service_commissions where service = p_service;
  v_fee := case when v_free then 0 else round(coalesce(v_rate, 0) * p_gross, 2) end;
  update wallets set balance = balance - v_fee, updated_at = now() where user_id = p_user returning balance into v_bal;
  insert into wallet_transactions(user_id, kind, amount, balance_after, service, ref_id, gross_amount, is_trial, note)
  values (p_user, 'commission', -v_fee, v_bal, p_service, p_ref, p_gross, v_free,
          case when v_free then 'ضمن الفترة المجانية' end);
  return v_fee;
end; $$;
-- إجمالي قيمة العرض = سعر الوحدة × المدة
create or replace function public._ct_total(p_price numeric, p_order uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select round(p_price * coalesce((select unit_count from contract_orders where id = p_order), 1), 2);
$$;
revoke all on function public._ct_items_left(uuid) from public, anon, authenticated;
revoke all on function public._ct_can_serve(text, uuid) from public, anon, authenticated;
revoke all on function public._wallet_charge_at(uuid, text, uuid, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public._ct_total(numeric, uuid) from public, anon, authenticated;

-- ---------- 4) الخصم الشهري المستحق (عند فتح السائق للتطبيق) ----------
create or replace function public.contract_settle_my_dues()
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record; v_due date; v_fee numeric; v_n int := 0; v_sum numeric := 0;
begin
  if auth.uid() is null then return jsonb_build_object('months', 0, 'amount', 0); end if;
  for f in select x.id, x.offered_price, x.months_charged, o.id as order_id, o.start_date, o.unit_count
             from contract_offers x join contract_orders o on o.id = x.contract_order_id
            where x.driver_id = auth.uid() and x.status = 'accepted' and x.ended_at is null
              and o.contract_unit = 'month' and o.start_date is not null and x.months_charged < o.unit_count
            for update of x loop
    loop
      exit when f.months_charged >= f.unit_count;
      v_due := (f.start_date + make_interval(months => f.months_charged))::date;
      exit when v_due > current_date;
      v_fee := public._wallet_charge_at(auth.uid(), 'contracts', f.order_id, f.offered_price, v_due::timestamptz);
      f.months_charged := f.months_charged + 1;
      update contract_offers set months_charged = f.months_charged, commission_total = commission_total + v_fee where id = f.id;
      v_n := v_n + 1; v_sum := v_sum + v_fee;
    end loop;
  end loop;
  return jsonb_build_object('months', v_n, 'amount', v_sum);
end; $$;

-- ---------- 5) السائق: الطلبات ضمن 10 كم من أول نقطة انطلاق ----------
drop function if exists public.driver_contracts_feed(double precision, double precision, double precision);
create or replace function public.driver_contracts_feed(p_lat double precision, p_lng double precision, p_radius_km double precision default 10)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' - 'driver_id' - 'budget_type' - 'budget_from' - 'budget_to' - 'budget_period'
         || jsonb_build_object('distance_km', round(d.dist::numeric, 2), 'items', public._ct_items_left(o.id),
              'my_offer', (select jsonb_build_object('id', f.id, 'price', f.offered_price, 'item_type', f.item_type)
                             from contract_offers f where f.contract_order_id = o.id and f.driver_id = auth.uid() and f.status = 'pending'))
    from contract_orders o
    cross join lateral (select (o.pickup_points->0->>'lat')::float8 as lat, (o.pickup_points->0->>'lng')::float8 as lng) p
    cross join lateral (select 2 * 6371 * asin(sqrt(
             power(sin(radians((p.lat - p_lat) / 2)), 2) +
             cos(radians(p_lat)) * cos(radians(p.lat)) *
             power(sin(radians((p.lng - p_lng) / 2)), 2))) as dist) d
   where auth.uid() is not null
     and o.status = 'pending' and o.contract_unit is not null and p.lat is not null and o.user_id <> auth.uid()
     and d.dist <= least(coalesce(p_radius_km, 10), 10)
     and not public.wallet_blocked(auth.uid())
     and not exists (select 1 from contract_offers f where f.contract_order_id = o.id and f.driver_id = auth.uid() and f.status = 'accepted')
     and exists (select 1 from jsonb_array_elements(public._ct_items_left(o.id)) it
                  where (it->>'left')::int > 0 and public._ct_can_serve(it->>'type', auth.uid()))
   order by d.dist;
$$;

-- ---------- 6) السائق: إرسال عرض (سعر الوحدة) وسحبه ----------
create or replace function public.driver_send_contract_offer(p_order uuid, p_item text, p_price numeric, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o contract_orders%rowtype; v_left int; v_id uuid; v_vehicle jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_BLOCKED'; end if;
  if p_price is null or p_price <= 0 then raise exception 'BAD_PRICE'; end if;
  select * into o from contract_orders where id = p_order for update;
  if not found or o.status <> 'pending' then raise exception 'ORDER_CLOSED'; end if;
  if o.user_id = auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if not public._ct_can_serve(p_item, auth.uid()) then raise exception 'VEHICLE_MISMATCH'; end if;
  select (it->>'left')::int into v_left from jsonb_array_elements(public._ct_items_left(p_order)) it where it->>'type' = p_item;
  if coalesce(v_left, 0) < 1 then raise exception 'ITEM_FILLED'; end if;
  if exists (select 1 from contract_offers where contract_order_id = p_order and driver_id = auth.uid() and status in ('pending','accepted')) then
    raise exception 'ALREADY_OFFERED';
  end if;
  select jsonb_build_object('type', event_vehicle_type, 'seats', vehicle_seats, 'model', vehicle_model,
                            'year', vehicle_year, 'color', vehicle_color, 'photo', vehicle_photo_url)
    into v_vehicle from profiles where id = auth.uid();
  insert into contract_offers(contract_order_id, driver_id, offered_price, currency, price_period, message, status, item_type, vehicle)
  values (p_order, auth.uid(), round(p_price, 2), 'USD', o.contract_unit, nullif(trim(p_message), ''), 'pending', p_item, v_vehicle)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.driver_withdraw_contract_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update contract_offers set status = 'withdrawn' where id = p_offer and driver_id = auth.uid() and status = 'pending';
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;

-- ---------- 7) الزبون: عقودي والعروض ----------
drop function if exists public.my_contract_orders();
create or replace function public.my_contract_orders()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) || jsonb_build_object('items', public._ct_items_left(o.id))
    from contract_orders o where o.user_id = auth.uid() order by o.created_at desc;
$$;

drop function if exists public.customer_contract_offers(uuid);
create or replace function public.customer_contract_offers(p_order uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'item_type', f.item_type, 'vehicle', f.vehicle, 'price', f.offered_price,
           'unit', o.contract_unit, 'total', public._ct_total(f.offered_price, o.id),
           'message', f.message, 'status', f.status, 'reason', f.reason, 'created_at', f.created_at,
           'accepted_at', f.accepted_at, 'ended_at', f.ended_at,
           'driver_name', case when f.status = 'accepted' then p.full_name end,
           'driver_phone', case when f.status = 'accepted' then p.phone end)
    from contract_offers f
    join contract_orders o on o.id = f.contract_order_id
    left join profiles p on p.id = f.driver_id
   where o.id = p_order and o.user_id = auth.uid() and f.status not in ('withdrawn','cancelled')
   order by (f.status = 'accepted') desc, f.offered_price;
$$;

-- القبول: اليومي/الأسبوعي على كامل العقد • الشهري على الشهر الأول
drop function if exists public.accept_contract_offer(uuid);
create or replace function public.accept_contract_offer(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f contract_offers%rowtype; o contract_orders%rowtype; v_left int; v_fee numeric; v_gross numeric; p profiles%rowtype;
begin
  select * into f from contract_offers where id = p_offer_id;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into o from contract_orders where id = f.contract_order_id for update;
  if o.user_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status <> 'pending' then raise exception 'ORDER_CLOSED'; end if;
  select * into f from contract_offers where id = p_offer_id for update;
  if f.status <> 'pending' then raise exception 'OFFER_NOT_AVAILABLE'; end if;
  select (it->>'left')::int into v_left from jsonb_array_elements(public._ct_items_left(o.id)) it where it->>'type' = f.item_type;
  if coalesce(v_left, 0) < 1 then raise exception 'ITEM_FILLED'; end if;

  v_gross := case when o.contract_unit = 'month' then f.offered_price else public._ct_total(f.offered_price, o.id) end;
  v_fee := public._wallet_charge(f.driver_id, 'contracts', o.id, v_gross);
  update contract_offers set status = 'accepted', accepted_at = now(), commission = v_fee, commission_total = v_fee,
         months_charged = case when o.contract_unit = 'month' then 1 else 0 end
   where id = f.id;
  if v_left = 1 then
    update contract_offers set status = 'rejected', reason = 'filled'
     where contract_order_id = o.id and item_type = f.item_type and status = 'pending';
  end if;
  if not exists (select 1 from jsonb_array_elements(public._ct_items_left(o.id)) it where (it->>'left')::int > 0) then
    update contract_orders set status = 'accepted' where id = o.id;
    update contract_offers set status = 'rejected', reason = 'filled' where contract_order_id = o.id and status = 'pending';
  end if;
  select * into p from profiles where id = f.driver_id;
  return jsonb_build_object('commission', v_fee, 'driver_name', p.full_name, 'driver_phone', p.phone,
                            'order_status', (select status from contract_orders where id = o.id));
end; $$;

create or replace function public.reject_contract_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update contract_offers f set status = 'rejected', reason = 'customer'
   where f.id = p_offer and f.status = 'pending'
     and exists (select 1 from contract_orders o where o.id = f.contract_order_id and o.user_id = auth.uid());
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;

-- إلغاء الطلب: قبل قبول أي عرض فقط
create or replace function public.cancel_contract_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from contract_offers where contract_order_id = p_order and status = 'accepted') then raise exception 'HAS_ACCEPTED'; end if;
  update contract_orders set status = 'cancelled' where id = p_order and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'ORDER_CLOSED'; end if;
  update contract_offers set status = 'rejected', reason = 'cancelled' where contract_order_id = p_order and status = 'pending';
end; $$;

-- إنهاء عقد مركبة (الزبون فقط): يتوقف الخصم الشهري، ولا استرداد لما خُصم
create or replace function public.end_contract_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  update contract_offers f set ended_at = now()
   where f.id = p_offer and f.status = 'accepted' and f.ended_at is null
     and exists (select 1 from contract_orders o where o.id = f.contract_order_id and o.user_id = auth.uid())
  returning contract_order_id into v_order;
  if v_order is null then raise exception 'NOT_ALLOWED'; end if;
  -- عند إنهاء كل المركبات يُغلق الطلب
  if not exists (select 1 from contract_offers where contract_order_id = v_order and status = 'accepted' and ended_at is null) then
    update contract_orders set status = 'completed' where id = v_order;
    update contract_offers set status = 'rejected', reason = 'cancelled' where contract_order_id = v_order and status = 'pending';
  end if;
end; $$;

-- ---------- 8) السائق: عروضي وعقودي ----------
drop function if exists public.driver_my_contract_offers();
create or replace function public.driver_my_contract_offers()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'order_id', o.id, 'item_type', f.item_type, 'price', f.offered_price,
           'unit', o.contract_unit, 'unit_count', o.unit_count, 'total', public._ct_total(f.offered_price, o.id),
           'status', f.status, 'reason', f.reason, 'created_at', f.created_at, 'order_status', o.status,
           'contract_category', o.contract_category, 'start_date', o.start_date, 'pickup_points', o.pickup_points)
    from contract_offers f join contract_orders o on o.id = f.contract_order_id
   where f.driver_id = auth.uid() and f.status in ('pending','rejected')
   order by f.created_at desc;
$$;

drop function if exists public.driver_contract_jobs();
create or replace function public.driver_contract_jobs()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' - 'driver_id' - 'budget_type' - 'budget_from' - 'budget_to' - 'budget_period'
         || jsonb_build_object('offer_id', f.id, 'item_type', f.item_type, 'price', f.offered_price,
              'total', public._ct_total(f.offered_price, o.id), 'commission', f.commission,
              'commission_total', f.commission_total, 'months_charged', f.months_charged,
              'accepted_at', f.accepted_at, 'ended_at', f.ended_at,
              'next_due', case when o.contract_unit = 'month' and f.ended_at is null and f.months_charged < o.unit_count
                               then (o.start_date + make_interval(months => f.months_charged))::date end,
              'active', f.ended_at is null and (o.end_date is null or o.end_date >= current_date),
              'customer_name', p.full_name, 'customer_phone', p.phone)
    from contract_offers f
    join contract_orders o on o.id = f.contract_order_id
    left join profiles p on p.id = o.user_id
   where f.driver_id = auth.uid() and f.status = 'accepted'
   order by f.accepted_at desc;
$$;

grant execute on function public.contract_settle_my_dues() to authenticated;
grant execute on function public.driver_contracts_feed(double precision, double precision, double precision) to authenticated;
grant execute on function public.driver_send_contract_offer(uuid, text, numeric, text) to authenticated;
grant execute on function public.driver_withdraw_contract_offer(uuid) to authenticated;
grant execute on function public.my_contract_orders() to authenticated;
grant execute on function public.customer_contract_offers(uuid) to authenticated;
grant execute on function public.accept_contract_offer(uuid) to authenticated;
grant execute on function public.reject_contract_offer(uuid) to authenticated;
grant execute on function public.cancel_contract_order(uuid) to authenticated;
grant execute on function public.end_contract_offer(uuid) to authenticated;
grant execute on function public.driver_my_contract_offers() to authenticated;
grant execute on function public.driver_contract_jobs() to authenticated;

-- ---------- 9) فحص ----------
select 'دوال العقود' as "الفحص", count(*)::text || ' من 17' as "النتيجة" from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('_ct_end_date','_ct_items_left','_ct_can_serve','_wallet_charge_at','_ct_total',
   'contract_settle_my_dues','driver_contracts_feed','driver_send_contract_offer','driver_withdraw_contract_offer',
   'my_contract_orders','customer_contract_offers','accept_contract_offer','reject_contract_offer','cancel_contract_order',
   'end_contract_offer','driver_my_contract_offers','driver_contract_jobs')
union all
select 'حساب تاريخ النهاية', case when exists (select 1 from pg_trigger where tgname = 'trg_ct_set_end') then 'مفعّل' else 'غير مفعّل' end
union all
select 'عرض جديد بعد السحب', case when exists (select 1 from pg_indexes where indexname = 'uq_contract_offer_active') then 'مسموح' else 'ممنوع' end
union all
select 'عمولة العقود', (select (rate*100)::int || '%' from public.service_commissions where service = 'contracts');
