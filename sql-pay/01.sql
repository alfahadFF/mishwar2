-- الدفع وإنهاء التكسي (1 من 39): جدول الرمز السري وحد التحويل
create table if not exists public.wallet_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text,
  pin_salt text,
  failed int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.wallet_security enable row level security;   -- بلا سياسات: الوصول عبر الدوال فقط

insert into public.app_settings(key, value) values ('wallet_daily_transfer_limit', '1000') on conflict (key) do nothing;
