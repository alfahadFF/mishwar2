-- الجزء 2 من 14 — جدول حركات الرصيد

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('topup','commission','adjustment')),
  amount numeric(12,2) not null,            -- موجب للشحن، سالب للعمولة
  balance_after numeric(12,2) not null,
  debt_paid numeric(12,2) not null default 0, -- ما سُدّد من مستحق سابق عند الشحن
  service text,                              -- cargo / taxi / rental / contracts / events
  ref_id uuid,                               -- رقم الطلب
  gross_amount numeric(12,2),                -- السعر المتفق عليه
  note text,
  created_at timestamptz not null default now()
);

alter table public.wallet_transactions add column if not exists is_trial boolean not null default false;

create index if not exists idx_wallet_tx_user on public.wallet_transactions(user_id, created_at desc);

alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet_tx_select_own" on public.wallet_transactions;

create policy "wallet_tx_select_own" on public.wallet_transactions for select using (auth.uid() = user_id);
