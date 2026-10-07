-- الحوافز (2 من 7): جدول مبالغ الطلبات + جدول المكافآت الشهرية
create table if not exists public.incentive_volume (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid,
  service text not null,
  ref_id uuid not null,
  period int not null default 0,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (service, ref_id, period, provider_id)
);
create index if not exists idx_incvol_provider on public.incentive_volume(provider_id, created_at);
alter table public.incentive_volume enable row level security;

create table if not exists public.incentive_rewards (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  volume numeric(12,2) not null default 0,
  commission numeric(12,2) not null default 0,
  month_avg numeric(3,1),
  level text,
  base_pct int not null default 0,
  bonus_pct int not null default 0,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (provider_id, month)
);
alter table public.incentive_rewards enable row level security;

alter table public.wallet_transactions drop constraint if exists wallet_transactions_kind_check;
alter table public.wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('topup','card_topup','commission','adjustment','payment_out','payment_in',
                  'transfer_out','transfer_in','loyalty','reward')) not valid;
