-- الأمان والطوارئ (3 من 9): جدول حالات الطوارئ ومساراتها
create table if not exists public.sos_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  mode text not null default 'family' check (mode in ('family','all')),
  service text,
  ref_id uuid,
  lat double precision,
  lng double precision,
  pos_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists uq_sos_active on public.sos_cases(user_id) where ended_at is null;
alter table public.sos_cases enable row level security;

create table if not exists public.sos_points (
  id bigserial primary key,
  case_id uuid not null references public.sos_cases(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  at timestamptz not null default now()
);
create index if not exists idx_sos_points_case on public.sos_points(case_id, at);
alter table public.sos_points enable row level security;
-- بدون سياسات: الوصول عبر الدوال فقط
