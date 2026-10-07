-- إلغاءات السائق (1 من 16): جدول إلغاءات السائق
create table if not exists public.taxi_driver_cancels (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('taxi','shared')),
  ref_id uuid not null,
  reason text not null check (reason in ('no_answer','car_issue','emergency','other')),
  note text,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_taxi_driver_cancels_driver on public.taxi_driver_cancels(driver_id, created_at desc);
alter table public.taxi_driver_cancels enable row level security;
