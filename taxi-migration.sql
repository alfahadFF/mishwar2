-- تكسي — طلبات مع حساب أجرة فعلي وفئات متعددة
drop table if exists public.taxi_orders cascade;

create table public.taxi_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  pickup_text text,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_text text,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  distance_km numeric(8,2) not null check (distance_km >= 0),
  vehicle_category text not null check (vehicle_category in ('ordinary','economy','luxury','van_8','van_11')),
  estimated_fare numeric(10,2) not null check (estimated_fare >= 0),
  currency text default 'USD' check (currency in ('USD','SYP')),
  search_radius_km integer not null default 5 check (search_radius_km in (5,10)),
  status text not null default 'pending' check (status in ('pending','searching','accepted','arrived','completed','cancelled','no_driver')),
  driver_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.update_taxi_orders_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_taxi_orders_updated_at on public.taxi_orders;
create trigger trg_taxi_orders_updated_at before update on public.taxi_orders
for each row execute function public.update_taxi_orders_updated_at();

create index idx_taxi_orders_user on public.taxi_orders(user_id);
create index idx_taxi_orders_status on public.taxi_orders(status);
create index idx_taxi_orders_cat on public.taxi_orders(vehicle_category);
create index idx_taxi_orders_created on public.taxi_orders(created_at desc);
-- فهرس جغرافي بسيط (lat/lng) — لاحقاً يمكن تحويله لـ PostGIS
create index idx_taxi_pickup on public.taxi_orders(pickup_lat, pickup_lng);

alter table public.taxi_orders enable row level security;
drop policy if exists "العميل يرى طلبه" on public.taxi_orders;
create policy "العميل يرى طلبه" on public.taxi_orders for select using (auth.uid() = user_id or auth.uid() = driver_id or status = 'pending');
drop policy if exists "العميل ينشئ طلب تكسي" on public.taxi_orders;
create policy "العميل ينشئ طلب تكسي" on public.taxi_orders for insert with check (auth.uid() = user_id);
drop policy if exists "السائق والعميل يعدلان" on public.taxi_orders;
create policy "السائق والعميل يعدلان" on public.taxi_orders for update using (auth.uid() = user_id or auth.uid() = driver_id);

select table_name from information_schema.tables where table_name='taxi_orders';
