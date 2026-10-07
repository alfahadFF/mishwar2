-- تأجير بدون سائق: مركبات المكاتب + طلبات عروض حسب المدة
drop table if exists public.rental_quote_requests cascade;
drop table if exists public.rental_vehicles cascade;

create table public.rental_vehicles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users(id) on delete cascade,
  title text not null, -- مثلاً: تويوتا كامري 2023
  category text not null check (category in ('car','sedan_lux','suv','van_8','van_11','bus_small_14')),
  year int check (year >= 2000 and year <= 2030),
  images jsonb default '[]'::jsonb, -- روابط صور
  specs jsonb default '{}'::jsonb, -- {seats, transmission, fuel}
  location_text text,
  lat double precision,
  lng double precision,
  available boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.update_rental_vehicles_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_rental_vehicles_updated_at on public.rental_vehicles;
create trigger trg_rental_vehicles_updated_at before update on public.rental_vehicles
for each row execute function public.update_rental_vehicles_updated_at();

create index idx_rental_vehicles_provider on public.rental_vehicles(provider_id);
create index idx_rental_vehicles_cat on public.rental_vehicles(category);
create index idx_rental_vehicles_available on public.rental_vehicles(available);

alter table public.rental_vehicles enable row level security;
drop policy if exists "الكل يرى المركبات المتاحة" on public.rental_vehicles;
create policy "الكل يرى المركبات المتاحة" on public.rental_vehicles for select using (available = true or auth.uid() = provider_id);
drop policy if exists "المكتب يدير مركباته" on public.rental_vehicles;
create policy "المكتب يدير مركباته" on public.rental_vehicles for insert with check (auth.uid() = provider_id);
drop policy if exists "المكتب يعدل مركباته" on public.rental_vehicles;
create policy "المكتب يعدل مركباته" on public.rental_vehicles for update using (auth.uid() = provider_id) with check (auth.uid() = provider_id);
drop policy if exists "المكتب يحذف مركباته" on public.rental_vehicles;
create policy "المكتب يحذف مركباته" on public.rental_vehicles for delete using (auth.uid() = provider_id);

-- طلبات عروض أسعار حسب المدة
create table public.rental_quote_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.rental_vehicles(id) on delete cascade,
  seeker_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  duration_type text not null check (duration_type in ('hours','days','week','month')),
  duration_value integer not null check (duration_value >= 1),
  start_date timestamptz,
  end_date timestamptz,
  notes text,
  status text not null default 'pending' check (status in ('pending','offered','accepted','rejected','cancelled')),
  offered_price numeric(12,2) check (offered_price >= 0),
  offered_currency text default 'USD' check (offered_currency in ('USD','SYP')),
  offered_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.update_rental_quote_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_rental_quote_updated_at on public.rental_quote_requests;
create trigger trg_rental_quote_updated_at before update on public.rental_quote_requests
for each row execute function public.update_rental_quote_updated_at();

create index idx_rental_quote_vehicle on public.rental_quote_requests(vehicle_id);
create index idx_rental_quote_seeker on public.rental_quote_requests(seeker_id);
create index idx_rental_quote_provider on public.rental_quote_requests(provider_id);

alter table public.rental_quote_requests enable row level security;
drop policy if exists "الطالب والمقدم يريان الطلب" on public.rental_quote_requests;
create policy "الطالب والمقدم يريان الطلب" on public.rental_quote_requests for select using (auth.uid() = seeker_id or auth.uid() = provider_id);
drop policy if exists "الباحث ينشئ طلب عرض" on public.rental_quote_requests;
create policy "الباحث ينشئ طلب عرض" on public.rental_quote_requests for insert with check (auth.uid() = seeker_id);
drop policy if exists "إدارة طلب العرض" on public.rental_quote_requests;
create policy "إدارة طلب العرض" on public.rental_quote_requests for update using (auth.uid() = provider_id or auth.uid() = seeker_id);

select table_name from information_schema.tables where table_name in ('rental_vehicles','rental_quote_requests');
-- إضافة دعم تأجير مركبة السائق المسجل بدون سائق
alter table public.rental_vehicles add column if not exists provider_type text default 'office' check (provider_type in ('office','individual','driver'));
alter table public.rental_vehicles add column if not exists is_driver_rental boolean default false;

-- تحديث المركبات الحالية للسائقين (إذا كان provider هو سائق في جدول السائقين)
-- اختياري: يمكن ربطه لاحقاً بجدول السائقين

-- فهرس للتمييز
create index if not exists idx_rental_vehicles_provider_type on public.rental_vehicles(provider_type);

-- تحقق
select column_name, data_type from information_schema.columns where table_name='rental_vehicles' and column_name in ('provider_type','is_driver_rental');
