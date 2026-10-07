-- إلغاءات السائق (2 من 16): أعمدة الإيقاف في حساب السائق
alter table public.profiles
  add column if not exists taxi_suspended boolean not null default false,
  add column if not exists taxi_suspended_at timestamptz,
  add column if not exists taxi_suspend_cancel uuid,
  add column if not exists taxi_cancel_base int not null default 0;
