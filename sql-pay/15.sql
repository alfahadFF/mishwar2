-- الدفع وإنهاء التكسي (15 من 39): جدول الإشعارات
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_user_notifications_user on public.user_notifications(user_id, created_at desc);
alter table public.user_notifications enable row level security;
drop policy if exists "notifications_select_own" on public.user_notifications;
create policy "notifications_select_own" on public.user_notifications for select using (auth.uid() = user_id);
