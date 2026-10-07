-- السفريات (1 من 7): الجداول والقيود. شغّل الأجزاء بالترتيب.
alter table public.profiles add column if not exists svc_travel boolean not null default false;

-- لا يوجد مكان انطلاق ثابت؛ يحدد الراكب موقع الالتقاط عند الحجز.
create table if not exists public.travel_listings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  destination text not null check (length(btrim(destination)) between 1 and 120),
  departure_at timestamptz not null,
  seats_total int not null check (seats_total between 1 and 50),
  seats_left int not null check (seats_left between 0 and seats_total),
  fare_per_passenger numeric(12,2) not null check (fare_per_passenger > 0),
  baggage_limit int check (baggage_limit >= 0),
  notes text,
  security_approval boolean not null default false,
  status text not null default 'active' check (status in ('active','paused','full','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_travel_listings_search on public.travel_listings(status, departure_at);
create index if not exists idx_travel_listings_provider on public.travel_listings(provider_id, created_at desc);

create table if not exists public.travel_requests (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  pickup_lat double precision not null check (pickup_lat between -90 and 90),
  pickup_lng double precision not null check (pickup_lng between -180 and 180),
  pickup_label text not null,
  destination text not null check (length(btrim(destination)) between 1 and 120),
  passengers int not null check (passengers between 1 and 50),
  bags int not null default 0 check (bags between 0 and 30),
  has_luggage boolean not null default false,
  notes text,
  status text not null default 'open' check (status in ('open','accepted','cancelled','closed')),
  close_reason text,
  chosen_offer_id uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists idx_travel_requests_open on public.travel_requests(status, created_at desc);
create index if not exists idx_travel_requests_passenger on public.travel_requests(passenger_id, created_at desc);

create table if not exists public.travel_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.travel_requests(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  fare_per_passenger numeric(12,2) not null check (fare_per_passenger > 0),
  notes text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  unique(request_id, provider_id)
);
create index if not exists idx_travel_offers_request on public.travel_offers(request_id, status, created_at);
alter table public.travel_requests add column if not exists chosen_offer_id uuid references public.travel_offers(id);

create table if not exists public.travel_bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.travel_listings(id),
  request_id uuid references public.travel_requests(id),
  offer_id uuid unique references public.travel_offers(id),
  passenger_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.profiles(id),
  pickup_lat double precision not null check (pickup_lat between -90 and 90),
  pickup_lng double precision not null check (pickup_lng between -180 and 180),
  pickup_label text not null,
  destination text not null,
  departure_at timestamptz,
  passengers int not null check (passengers between 1 and 50),
  bags int not null default 0 check (bags between 0 and 30),
  has_luggage boolean not null default false,
  notes text,
  fare_per_passenger numeric(12,2) not null check (fare_per_passenger > 0),
  total numeric(12,2) not null check (total > 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed')),
  created_at timestamptz not null default now(),
  check ((listing_id is not null) <> (offer_id is not null))
);
create unique index if not exists uq_travel_booking_request on public.travel_bookings(request_id) where request_id is not null;
create index if not exists idx_travel_bookings_passenger on public.travel_bookings(passenger_id, created_at desc);
create index if not exists idx_travel_bookings_provider on public.travel_bookings(provider_id, created_at desc);

alter table public.travel_listings enable row level security;
alter table public.travel_requests enable row level security;
alter table public.travel_offers enable row level security;
alter table public.travel_bookings enable row level security;
-- لا سياسات وصول مباشر؛ القراءة والكتابة محصورتان بدوال RPC الآمنة في الأجزاء التالية.
