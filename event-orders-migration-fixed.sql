-- إصلاح: حذف البنية القديمة الناقصة ثم إعادة الإنشاء الصحيحة
drop table if exists public.event_offers cascade;
drop table if exists public.event_orders cascade;

-- الآن أنشئ من جديد بكل الأعمدة الصحيحة
create table public.event_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('wedding','family','tourist','other')),
  event_type_other text,
  gathering_point text,
  gathering_time timestamptz,
  departure_time timestamptz,
  destinations jsonb default '[]'::jsonb,
  duration_hours integer check (duration_hours >= 1 and duration_hours <= 72),
  return_time timestamptz,
  final_point text,
  num_people integer check (num_people >= 1 and num_people <= 500),
  vehicles jsonb default '[]'::jsonb,
  notes text,
  budget_type text not null default 'fixed' check (budget_type in ('fixed','quote')),
  budget_from numeric(12,2) check (budget_from >= 0),
  budget_to numeric(12,2) check (budget_to >= 0),
  currency text default 'USD' check (currency in ('USD','SYP')),
  status text not null default 'pending' check (status in ('pending','accepted','completed','cancelled')),
  driver_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.update_event_orders_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_event_orders_updated_at on public.event_orders;
create trigger trg_event_orders_updated_at before update on public.event_orders
for each row execute function public.update_event_orders_updated_at();

create index idx_event_orders_user on public.event_orders(user_id);
create index idx_event_orders_type on public.event_orders(event_type);
create index idx_event_orders_status on public.event_orders(status);

alter table public.event_orders enable row level security;
drop policy if exists "العميل يرى طلباته" on public.event_orders;
create policy "العميل يرى طلباته" on public.event_orders for select using (auth.uid() = user_id or auth.uid() = driver_id or status = 'pending');
drop policy if exists "العميل ينشئ طلب" on public.event_orders;
create policy "العميل ينشئ طلب" on public.event_orders for insert with check (auth.uid() = user_id);
drop policy if exists "العميل يعدل طلبه" on public.event_orders;
create policy "العميل يعدل طلبه" on public.event_orders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- عروض المناسبات
create table public.event_offers (
  id uuid primary key default gen_random_uuid(),
  event_order_id uuid not null references public.event_orders(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  offered_price numeric(12,2) not null check (offered_price > 0),
  currency text not null default 'USD' check (currency in ('USD','SYP')),
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  accepted_at timestamptz,
  unique(event_order_id, driver_id)
);

create or replace function public.update_event_offers_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_event_offers_updated_at on public.event_offers;
create trigger trg_event_offers_updated_at before update on public.event_offers for each row execute function public.update_event_offers_updated_at();

create index idx_event_offers_order on public.event_offers(event_order_id);
alter table public.event_offers enable row level security;
drop policy if exists "عرض مرئي للجميع" on public.event_offers;
create policy "عرض مرئي للجميع" on public.event_offers for select using (true);
drop policy if exists "السائق ينشئ عرض" on public.event_offers;
create policy "السائق ينشئ عرض" on public.event_offers for insert with check (auth.uid() = driver_id);
drop policy if exists "إدارة العرض" on public.event_offers;
create policy "إدارة العرض" on public.event_offers for update using (auth.uid() = driver_id or auth.uid() = (select user_id from public.event_orders where id = event_order_id));

create or replace function public.accept_event_offer(p_offer_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_order uuid; v_driver uuid; v_owner uuid;
begin
  select event_order_id, driver_id into v_order, v_driver from public.event_offers where id = p_offer_id;
  if v_order is null then raise exception 'العرض غير موجود'; end if;
  select user_id into v_owner from public.event_orders where id = v_order;
  if v_owner != auth.uid() then raise exception 'غير مصرح'; end if;
  update public.event_offers set status='accepted', accepted_at=now() where id=p_offer_id;
  update public.event_offers set status='rejected' where event_order_id=v_order and id != p_offer_id and status='pending';
  update public.event_orders set status='accepted', driver_id=v_driver where id=v_order;
  return jsonb_build_object('success', true);
end; $$;

-- تحقق
select table_name from information_schema.tables where table_name in ('event_orders','event_offers');
