-- الولاء (1 من 7): حسابات النقاط + السجل + المستويات
create table if not exists public.loyalty_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points int not null default 0,            -- النقاط القابلة للتحويل
  level_points int not null default 0,      -- عدّاد المستوى
  lifetime_points int not null default 0,   -- كل ما جمعه
  invited_by uuid references auth.users(id) on delete set null,
  invite_rewarded boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.loyalty_accounts enable row level security;

create table if not exists public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('earn','invite','redeem')),
  service text,
  ref_id uuid,
  provider_id uuid,
  amount numeric(12,2),
  points int not null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_loyalty_once on public.loyalty_events(user_id, kind, service, ref_id) where kind <> 'redeem';
create index if not exists idx_loyalty_user on public.loyalty_events(user_id, created_at desc);
alter table public.loyalty_events enable row level security;

-- المستوى حسب العدّاد: برونزي 1-100، فضي 101-200، ذهبي 201-400، ماسي 401+
create or replace function public._loyalty_level(p int)
returns text language sql immutable as $$
  select case when p >= 401 then 'diamond' when p >= 201 then 'gold' when p >= 101 then 'silver' else 'bronze' end;
$$;
create or replace function public._loyalty_level_min(p_level text)
returns int language sql immutable as $$
  select case p_level when 'diamond' then 401 when 'gold' then 201 when 'silver' then 101 else 0 end;
$$;
