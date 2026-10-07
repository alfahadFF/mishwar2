-- الجزء 6ب — جدول الإعدادات

-- الإعدادات العامة: عدد الأيام المجانية لكل حساب جديد (بدون عمولة في كل الخدمات)
create table if not exists public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;
drop policy if exists "settings_select_all" on public.app_settings;
create policy "settings_select_all" on public.app_settings for select using (true);
insert into public.app_settings(key, value) values ('free_days', '14') on conflict (key) do nothing;

