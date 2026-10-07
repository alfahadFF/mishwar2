-- =====================================================================
-- شاشة الناقل + المحفظة المشتركة للسائقين
-- آمن للتكرار. لا يحذف بيانات.
-- =====================================================================

-- ---------- 1) المحفظة المشتركة لكل السائقين ----------
create table if not exists public.wallets (
  user_id uuid references auth.users(id) on delete cascade,
  updated_at timestamptz default now()
);
alter table public.wallets add column if not exists balance numeric(12,2) not null default 0;
alter table public.wallets add column if not exists currency text not null default 'USD';
alter table public.wallets add column if not exists created_at timestamptz not null default now();
alter table public.wallets add column if not exists updated_at timestamptz not null default now();
create unique index if not exists uq_wallets_user on public.wallets(user_id);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('topup','commission','adjustment')),
  amount numeric(12,2) not null,            -- موجب للشحن، سالب للعمولة
  balance_after numeric(12,2) not null,
  debt_paid numeric(12,2) not null default 0, -- ما سُدّد من مستحق سابق عند الشحن
  service text,                              -- cargo / taxi / rental / contracts / events
  ref_id uuid,                               -- رقم الطلب
  gross_amount numeric(12,2),                -- السعر المتفق عليه
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_wallet_tx_user on public.wallet_transactions(user_id, created_at desc);

-- نسبة العمولة لكل خدمة
create table if not exists public.service_commissions (
  service text primary key,
  rate numeric(5,4) not null check (rate >= 0 and rate <= 0.5)
);
insert into public.service_commissions(service, rate) values ('cargo', 0.10)
on conflict (service) do update set rate = excluded.rate;

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.service_commissions enable row level security;
drop policy if exists "wallet_select_own" on public.wallets;
create policy "wallet_select_own" on public.wallets for select using (auth.uid() = user_id);
drop policy if exists "wallet_tx_select_own" on public.wallet_transactions;
create policy "wallet_tx_select_own" on public.wallet_transactions for select using (auth.uid() = user_id);
drop policy if exists "commissions_select_all" on public.service_commissions;
create policy "commissions_select_all" on public.service_commissions for select using (true);
-- لا توجد سياسات إدخال/تعديل: الرصيد يتغير فقط عبر الدوال أدناه

-- خصم العمولة: يُخصم دائماً حتى لو صار الرصيد سالباً (مستحق يُسدد من الشحن التالي)
create or replace function public._wallet_charge(p_user uuid, p_service text, p_ref uuid, p_gross numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_rate numeric; v_fee numeric; v_bal numeric;
begin
  select rate into v_rate from service_commissions where service = p_service;
  v_fee := round(coalesce(v_rate, 0) * p_gross, 2);
  insert into wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  update wallets set balance = balance - v_fee, updated_at = now() where user_id = p_user returning balance into v_bal;
  insert into wallet_transactions(user_id, kind, amount, balance_after, service, ref_id, gross_amount)
  values (p_user, 'commission', -v_fee, v_bal, p_service, p_ref, p_gross);
  return v_fee;
end; $$;
revoke all on function public._wallet_charge(uuid, text, uuid, numeric) from public, anon, authenticated;

-- الرصيد سالب = لا تظهر الطلبات
create or replace function public.wallet_blocked(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select balance < 0 from wallets where user_id = p_user), false);
$$;

create or replace function public.my_wallet()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'blocked', public.wallet_blocked(auth.uid()));
$$;

-- شحن مؤقت للتجربة: من SQL Editor أو لحساب إداري فقط (الشحن بالبطاقات لاحقاً)
create or replace function public.admin_wallet_topup(p_user uuid, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_before numeric; v_after numeric;
begin
  if auth.uid() is not null and not exists (
       select 1 from profiles where id = auth.uid() and (account_type = 'admin' or type = 'admin')) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;
  insert into wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_before from wallets where user_id = p_user for update;
  update wallets set balance = balance + p_amount, updated_at = now() where user_id = p_user returning balance into v_after;
  insert into wallet_transactions(user_id, kind, amount, balance_after, debt_paid, note)
  values (p_user, 'topup', p_amount, v_after, least(greatest(-v_before, 0), p_amount), p_note);
  return jsonb_build_object('balance', v_after, 'debt_paid', least(greatest(-v_before, 0), p_amount));
end; $$;

-- ---------- 2) فئات المركبات ----------
-- بيك آب صغير: 800/1200/1500/2000 كغ • متوسط: 3-7 طن • شاحنة
alter table public.profiles add column if not exists vehicle_class text
  check (vehicle_class in ('pk800','pk1200','pk1500','pk2000','md3','md4','md5','md6','md7','truck'));
alter table public.cargo_orders add column if not exists vehicle_class text
  check (vehicle_class in ('pk800','pk1200','pk1500','pk2000','md3','md4','md5','md6','md7','truck'));

-- التطابق: الفئة نفسها والأكبر منها ضمن نفس المجموعة
create or replace function public.cargo_vehicle_fits(p_order text, p_carrier text)
returns boolean language sql immutable as $$
  with m(k, g, r) as (values
    ('pk800','pickup',1),('pk1200','pickup',2),('pk1500','pickup',3),('pk2000','pickup',4),
    ('md3','medium',1),('md4','medium',2),('md5','medium',3),('md6','medium',4),('md7','medium',5),
    ('truck','truck',1))
  select coalesce((select c.g = o.g and c.r >= o.r from m o, m c where o.k = p_order and c.k = p_carrier), false);
$$;

-- ---------- 3) أعمدة الاتفاق في طلب النقل ----------
alter table public.cargo_orders add column if not exists agreed_price numeric(10,2);
alter table public.cargo_orders add column if not exists commission_amount numeric(10,2);
alter table public.cargo_orders add column if not exists accepted_via text check (accepted_via in ('direct','offer'));
alter table public.cargo_orders add column if not exists accepted_at timestamptz;
alter table public.cargo_orders add column if not exists completed_at timestamptz;
create index if not exists idx_cargo_orders_open on public.cargo_orders(status, vehicle_class);

-- ---------- 4) العروض: التعديل فقط عبر الدوال ----------
drop policy if exists "offers_select_all" on public.cargo_offers;
drop policy if exists "offers_insert_driver" on public.cargo_offers;
drop policy if exists "offers_update_own" on public.cargo_offers;
drop policy if exists "offers_update_client" on public.cargo_offers;
drop policy if exists "offers_select_party" on public.cargo_offers;
-- الناقل يرى عروضه، والزبون يرى عروض طلبه فقط
create policy "offers_select_party" on public.cargo_offers for select using (
  auth.uid() = driver_id
  or exists (select 1 from public.cargo_orders o where o.id = cargo_order_id and o.customer_id = auth.uid()));

-- ---------- 5) دوال الناقل ----------
-- الطلبات المتاحة: ضمن النطاق + تناسب المركبة + رصيد غير سالب. بدون هوية الزبون.
create or replace function public.carrier_cargo_feed(p_lat double precision, p_lng double precision, p_radius_km double precision default 10)
returns table (
  id uuid, created_at timestamptz, cargo_type text, weight_kg numeric, vehicle_class text,
  pickup_points jsonb, dropoff_points jsonb, route_info jsonb,
  need_workers boolean, workers_count int, need_equipment boolean, equipment_detail text,
  lift_down boolean, floor_from int, elevator_from text, lift_up boolean, floor_to int, elevator_to text, floor_note text,
  timing_type text, scheduled_date date, scheduled_time time,
  budget_type text, budget_from numeric, budget_to numeric,
  distance_km double precision, my_offer_id uuid, my_offer_price numeric, my_offer_status text
) language plpgsql stable security definer set search_path = public as $$
declare v_class text;
begin
  select p.vehicle_class into v_class from profiles p where p.id = auth.uid();
  if v_class is null or public.wallet_blocked(auth.uid()) then return; end if;
  return query
  select * from (
    select o.id, o.created_at, o.cargo_type, o.weight_kg, o.vehicle_class,
           o.pickup_points, coalesce(o.dropoff_points, o.delivery_points), o.route_info,
           o.need_workers, o.workers_count, o.need_equipment, o.equipment_detail,
           o.lift_down, o.floor_from, o.elevator_from, o.lift_up, o.floor_to, o.elevator_to, o.floor_note,
           o.timing_type, o.scheduled_date, o.scheduled_time,
           o.budget_type, o.budget_from, o.budget_to,
           2 * 6371 * asin(sqrt(
             power(sin(radians(((o.pickup_points->0->>'lat')::float8 - p_lat) / 2)), 2) +
             cos(radians(p_lat)) * cos(radians((o.pickup_points->0->>'lat')::float8)) *
             power(sin(radians(((o.pickup_points->0->>'lng')::float8 - p_lng) / 2)), 2))) as dist,
           f.id, f.offered_price, f.status
    from cargo_orders o
    left join cargo_offers f on f.cargo_order_id = o.id and f.driver_id = auth.uid() and f.status <> 'withdrawn'
    where o.status = 'open'
      and o.pickup_points->0->>'lat' is not null
      and public.cargo_vehicle_fits(o.vehicle_class, v_class)
  ) q
  where q.dist <= p_radius_km
  order by q.dist;
end; $$;

-- قبول مباشر بالحد الأعلى للميزانية + خصم العمولة + كشف بيانات الزبون
create or replace function public.carrier_accept_cargo(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o cargo_orders; v_class text; v_fee numeric; c profiles;
begin
  select * into o from cargo_orders where id = p_order for update;
  if o.id is null or o.status <> 'open' then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  if o.budget_type is distinct from 'fixed' or coalesce(o.budget_to, 0) <= 0 then raise exception 'NO_FIXED_BUDGET'; end if;
  select vehicle_class into v_class from profiles where id = auth.uid();
  if not public.cargo_vehicle_fits(o.vehicle_class, v_class) then raise exception 'VEHICLE_NOT_SUITABLE'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_NEGATIVE'; end if;
  v_fee := public._wallet_charge(auth.uid(), 'cargo', o.id, o.budget_to);
  update cargo_orders set status = 'accepted', carrier_id = auth.uid(), agreed_price = o.budget_to,
         commission_amount = v_fee, accepted_via = 'direct', accepted_at = now(), updated_at = now()
   where id = o.id;
  update cargo_offers set status = 'rejected' where cargo_order_id = o.id and status = 'pending';
  select * into c from profiles where id = o.customer_id;
  return jsonb_build_object('agreed_price', o.budget_to, 'commission', v_fee,
         'customer_name', c.full_name, 'customer_phone', c.phone);
end; $$;

-- تقديم عرض سعر (أو تعديله). في الميزانية الثابتة يجب أن يكون ضمن النطاق.
create or replace function public.carrier_send_cargo_offer(p_order uuid, p_price numeric, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o cargo_orders; v_class text; v_id uuid;
begin
  select * into o from cargo_orders where id = p_order;
  if o.id is null or o.status <> 'open' then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  select vehicle_class into v_class from profiles where id = auth.uid();
  if not public.cargo_vehicle_fits(o.vehicle_class, v_class) then raise exception 'VEHICLE_NOT_SUITABLE'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_NEGATIVE'; end if;
  if p_price is null or p_price <= 0 then raise exception 'BAD_PRICE'; end if;
  if o.budget_type = 'fixed' and (p_price < o.budget_from or p_price > o.budget_to) then raise exception 'PRICE_OUT_OF_RANGE'; end if;
  insert into cargo_offers(cargo_order_id, driver_id, offered_price, message, status)
  values (o.id, auth.uid(), p_price, nullif(btrim(p_message), ''), 'pending')
  on conflict (cargo_order_id, driver_id) do update
    set offered_price = excluded.offered_price, message = excluded.message, status = 'pending', updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.carrier_withdraw_cargo_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update cargo_offers set status = 'withdrawn', updated_at = now()
   where id = p_offer and driver_id = auth.uid() and status = 'pending';
  if not found then raise exception 'OFFER_NOT_PENDING'; end if;
end; $$;

-- الزبون يقبل عرضاً: تُرفض بقية العروض ويُخصم 10% من رصيد الناقل
create or replace function public.accept_cargo_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f cargo_offers; o cargo_orders; v_fee numeric;
begin
  select * into f from cargo_offers where id = p_offer_id for update;
  if f.id is null or f.status <> 'pending' then raise exception 'OFFER_NOT_AVAILABLE'; end if;
  select * into o from cargo_orders where id = f.cargo_order_id for update;
  if o.customer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status <> 'open' then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  v_fee := public._wallet_charge(f.driver_id, 'cargo', o.id, f.offered_price);
  update cargo_offers set status = 'accepted', accepted_at = now(), updated_at = now() where id = f.id;
  update cargo_offers set status = 'rejected', updated_at = now() where cargo_order_id = o.id and id <> f.id and status = 'pending';
  update cargo_orders set status = 'accepted', carrier_id = f.driver_id, agreed_price = f.offered_price,
         commission_amount = v_fee, accepted_via = 'offer', accepted_at = now(), updated_at = now()
   where id = o.id;
end; $$;

-- الدالة القديمة كانت تقبل بدون عمولة: تُستبدل بـ carrier_accept_cargo
drop function if exists public.accept_cargo_direct(uuid);

-- أعمالي: الطلبات المتفق عليها مع بيانات الزبون (بعد خصم العمولة)
create or replace function public.carrier_my_cargo_jobs()
returns table (id uuid, status text, cargo_type text, vehicle_class text, pickup_points jsonb, dropoff_points jsonb,
               route_info jsonb, timing_type text, scheduled_date date, scheduled_time time,
               agreed_price numeric, commission_amount numeric, accepted_at timestamptz,
               customer_name text, customer_phone text)
language sql stable security definer set search_path = public as $$
  select o.id, o.status, o.cargo_type, o.vehicle_class, o.pickup_points, coalesce(o.dropoff_points, o.delivery_points),
         o.route_info, o.timing_type, o.scheduled_date, o.scheduled_time,
         o.agreed_price, o.commission_amount, o.accepted_at, p.full_name, p.phone
  from cargo_orders o left join profiles p on p.id = o.customer_id
  where o.carrier_id = auth.uid() and o.status in ('accepted','completed')
  order by o.accepted_at desc nulls last;
$$;

create or replace function public.carrier_complete_cargo(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update cargo_orders set status = 'completed', completed_at = now(), updated_at = now()
   where id = p_order and carrier_id = auth.uid() and status = 'accepted';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end; $$;

create or replace function public.set_my_vehicle_class(p_class text)
returns void language sql security definer set search_path = public as $$
  update profiles set vehicle_class = p_class, updated_at = now() where id = auth.uid();
$$;

grant execute on function public.my_wallet() to authenticated;
grant execute on function public.wallet_blocked(uuid) to authenticated;
grant execute on function public.carrier_cargo_feed(double precision, double precision, double precision) to authenticated;
grant execute on function public.carrier_accept_cargo(uuid) to authenticated;
grant execute on function public.carrier_send_cargo_offer(uuid, numeric, text) to authenticated;
grant execute on function public.carrier_withdraw_cargo_offer(uuid) to authenticated;
grant execute on function public.accept_cargo_offer(uuid) to authenticated;
grant execute on function public.carrier_my_cargo_jobs() to authenticated;
grant execute on function public.carrier_complete_cargo(uuid) to authenticated;
grant execute on function public.set_my_vehicle_class(text) to authenticated;
revoke all on function public.admin_wallet_topup(uuid, numeric, text) from public, anon;
grant execute on function public.admin_wallet_topup(uuid, numeric, text) to authenticated;

-- ---------- تحقق ----------
select 'الدوال' as الفحص, count(*)::text || ' من 13' as النتيجة
from pg_proc where pronamespace = 'public'::regnamespace and proname in
 ('_wallet_charge','wallet_blocked','my_wallet','admin_wallet_topup','cargo_vehicle_fits','carrier_cargo_feed',
  'carrier_accept_cargo','carrier_send_cargo_offer','carrier_withdraw_cargo_offer','accept_cargo_offer',
  'carrier_my_cargo_jobs','carrier_complete_cargo','set_my_vehicle_class')
union all
select 'عمولة النقل', (select (rate*100)::int::text || '%' from public.service_commissions where service = 'cargo')
union all
select 'تطابق 800 كغ ← 1500 كغ', public.cargo_vehicle_fits('pk800','pk1500')::text
union all
select 'تطابق 1500 كغ ← 800 كغ', public.cargo_vehicle_fits('pk1500','pk800')::text
union all
select 'تطابق 3 طن ← شاحنة', public.cargo_vehicle_fits('md3','truck')::text;
