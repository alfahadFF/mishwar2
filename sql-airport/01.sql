-- تكسي المطار (1 من 8): المطارات والطلبات والعروض
create table if not exists public.airports (
  code text primary key, name text not null, country text not null, lat double precision not null, lng double precision not null);
alter table public.airports enable row level security;
drop policy if exists "airports_read" on public.airports;
create policy "airports_read" on public.airports for select using (true);
insert into public.airports(code, name, country, lat, lng) values
  ('DAM', 'مطار دمشق الدولي', 'SY', 33.4114, 36.5156), ('ALP', 'مطار حلب الدولي', 'SY', 36.1807, 37.2244),
  ('LTK', 'مطار اللاذقية الدولي', 'SY', 35.4011, 35.9487), ('DEZ', 'مطار دير الزور', 'SY', 35.2854, 40.1760),
  ('KAC', 'مطار القامشلي', 'SY', 37.0206, 41.1914),
  ('BGW', 'مطار بغداد الدولي', 'IQ', 33.2625, 44.2346), ('BSR', 'مطار البصرة الدولي', 'IQ', 30.5491, 47.6621),
  ('EBL', 'مطار أربيل الدولي', 'IQ', 36.2376, 43.9632), ('ISU', 'مطار السليمانية الدولي', 'IQ', 35.5617, 45.3167),
  ('NJF', 'مطار النجف الدولي', 'IQ', 31.9899, 44.4043),
  ('BEY', 'مطار بيروت الدولي', 'LB', 33.8209, 35.4884),
  ('AMM', 'مطار الملكة علياء الدولي', 'JO', 31.7226, 35.9932), ('ADJ', 'مطار عمّان المدني', 'JO', 31.9727, 35.9916),
  ('AQJ', 'مطار العقبة الدولي', 'JO', 29.6116, 35.0181)
on conflict (code) do nothing;

create table if not exists public.airport_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('arrival', 'departure')),          -- استقبال / وداع
  airport_code text not null references public.airports(code),
  pickup_lat double precision not null, pickup_lng double precision not null, pickup_label text,
  trip_at timestamptz not null,
  round_trip boolean not null default false,
  pax_go int not null check (pax_go between 1 and 60),
  pax_back int check (pax_back between 1 and 60),
  wait_hours int check (wait_hours in (1, 2, 3, 4, 6)),                  -- null = بدون انتظار طويل
  bags int check (bags between 0 and 30),
  notes text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'completed', 'cancelled')),
  driver_id uuid references auth.users(id),
  agreed_price numeric, commission numeric,
  accepted_at timestamptz, completed_at timestamptz, edited_at timestamptz, edited_fields text[],
  created_at timestamptz not null default now());
create index if not exists idx_airport_orders_status on public.airport_orders(status, trip_at);
alter table public.airport_orders enable row level security;

create table if not exists public.airport_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.airport_orders(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  price numeric not null check (price > 0), message text, vehicle jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  reason text, created_at timestamptz not null default now(), accepted_at timestamptz);
create unique index if not exists airport_offer_one on public.airport_offers(order_id, driver_id) where status in ('pending', 'accepted');
alter table public.airport_offers enable row level security;

insert into public.service_commissions(service, rate) values ('airport', 0.12) on conflict (service) do nothing;
alter table public.provider_reviews drop constraint if exists provider_reviews_service_check;
alter table public.provider_reviews add constraint provider_reviews_service_check
  check (service in ('taxi', 'taxi_shared', 'cargo', 'events', 'contracts', 'rental', 'airport'));
