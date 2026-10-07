drop table if exists public.taxi_shared_requests cascade;
drop table if exists public.taxi_shared_trips cascade;

create table public.taxi_shared_trips (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  pickup_text text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_text text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  route jsonb default '[]'::jsonb,
  departure_time timestamptz not null,
  available_seats integer not null check (available_seats >= 1 and available_seats <= 11),
  total_seats integer not null check (total_seats >= 1 and total_seats <= 11),
  price_per_seat numeric(10,2) not null check (price_per_seat >= 0),
  currency text default 'USD' check (currency in ('USD','SYP')),
  vehicle_category text default 'economy' check (vehicle_category in ('ordinary','economy','luxury','van_8','van_11')),
  status text not null default 'pending' check (status in ('pending','full','completed','cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.update_taxi_shared_trips_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_taxi_shared_trips_updated_at on public.taxi_shared_trips;
create trigger trg_taxi_shared_trips_updated_at before update on public.taxi_shared_trips for each row execute function public.update_taxi_shared_trips_updated_at();

create or replace function public.check_taxi_shared_full() returns trigger language plpgsql as $$
begin if new.available_seats = 0 then new.status = 'full'; end if; return new; end; $$;
drop trigger if exists trg_check_shared_full on public.taxi_shared_trips;
create trigger trg_check_shared_full before update on public.taxi_shared_trips for each row execute function public.check_taxi_shared_full();

create index idx_taxi_shared_driver on public.taxi_shared_trips(driver_id);
create index idx_taxi_shared_status on public.taxi_shared_trips(status);
alter table public.taxi_shared_trips enable row level security;
drop policy if exists "الكل يرى الرحلات المتاحة على طول المسار" on public.taxi_shared_trips;
create policy "الكل يرى الرحلات المتاحة على طول المسار" on public.taxi_shared_trips for select using (status = 'pending' and available_seats > 0);
drop policy if exists "السائق ينشر رحلة" on public.taxi_shared_trips;
create policy "السائق ينشر رحلة" on public.taxi_shared_trips for insert with check (auth.uid() = driver_id);
drop policy if exists "السائق يعدل رحلته" on public.taxi_shared_trips;
create policy "السائق يعدل رحلته" on public.taxi_shared_trips for update using (auth.uid() = driver_id);

create table public.taxi_shared_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.taxi_shared_trips(id) on delete cascade,
  passenger_id uuid not null references auth.users(id) on delete cascade,
  seats_requested integer not null default 1 check (seats_requested >= 1 and seats_requested <= 4),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz default now(),
  unique(trip_id, passenger_id)
);
create index idx_taxi_shared_req_trip on public.taxi_shared_requests(trip_id);
alter table public.taxi_shared_requests enable row level security;
drop policy if exists "الكل يرى طلباته" on public.taxi_shared_requests;
create policy "الكل يرى طلباته" on public.taxi_shared_requests for select using (auth.uid() = passenger_id or auth.uid() = (select driver_id from public.taxi_shared_trips where id = trip_id));
drop policy if exists "الراكب يطلب انضمام" on public.taxi_shared_requests;
create policy "الراكب يطلب انضمام" on public.taxi_shared_requests for insert with check (auth.uid() = passenger_id);

select table_name from information_schema.tables where table_name in ('taxi_shared_trips','taxi_shared_requests');
