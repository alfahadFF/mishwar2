-- التأجير (1 من 11): جدول إعلانات السيارات
create table if not exists public.rental_listings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users(id) on delete cascade,
  brand_model text not null,
  year int not null check (year between 1970 and 2100),
  transmission text not null check (transmission in ('auto','manual')),
  seats int not null check (seats between 2 and 15),
  color text,
  fuel text check (fuel in ('petrol','diesel','electric','hybrid')),
  ac boolean,
  photos jsonb not null default '{}'::jsonb,          -- {front, back, side}
  lat double precision not null,
  lng double precision not null,
  conditions text[] not null default '{}',             -- license,id,deposit,age21,fuel_same,no_smoking,contract
  pricing_mode text not null check (pricing_mode in ('fixed','offers')),
  units text[] not null,                               -- hour,day,week,month
  prices jsonb not null default '{}'::jsonb,           -- {hour: 5, day: 25, ...}
  status text not null default 'active' check (status in ('active','paused','rented','deleted')),
  rented_request uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rental_listings_provider on public.rental_listings(provider_id);
create index if not exists idx_rental_listings_status on public.rental_listings(status);
alter table public.rental_listings enable row level security;
-- بدون سياسات: كل القراءة والكتابة عبر الدوال (هوية المؤجّر مخفية)

-- أقصى عدد لكل نوع مدة
create or replace function public._rental_max(p_unit text)
returns int language sql immutable as $$
  select case p_unit when 'hour' then 72 when 'day' then 90 when 'week' then 26 when 'month' then 12 end;
$$;
create or replace function public._rental_end(p_start timestamptz, p_unit text, p_count int)
returns timestamptz language sql immutable as $$
  select p_start + case p_unit when 'hour' then make_interval(hours => p_count) when 'day' then make_interval(days => p_count)
                               when 'week' then make_interval(weeks => p_count) else make_interval(months => p_count) end;
$$;
