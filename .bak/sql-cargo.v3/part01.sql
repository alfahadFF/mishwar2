-- الجزء 1 من 14 — جدول المحفظة

create table if not exists public.wallets (
  user_id uuid references auth.users(id) on delete cascade,
  updated_at timestamptz default now()
);

alter table public.wallets add column if not exists balance numeric(12,2) not null default 0;

alter table public.wallets add column if not exists currency text not null default 'USD';

alter table public.wallets add column if not exists created_at timestamptz not null default now();

alter table public.wallets add column if not exists updated_at timestamptz not null default now();

alter table public.wallets add column if not exists trial_used boolean not null default false;

create unique index if not exists uq_wallets_user on public.wallets(user_id);

alter table public.wallets enable row level security;

drop policy if exists "wallet_select_own" on public.wallets;

create policy "wallet_select_own" on public.wallets for select using (auth.uid() = user_id);
