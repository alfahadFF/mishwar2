-- شاشات الإدارة (1 من 6): الأدمن، وإشعارات الإدارة الخاصة، وسجل قرارات التحقق
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspend_reason text;
alter table public.profiles add column if not exists work_reject_reason text;

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(), kind text not null, title text not null, body text,
  data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), read_at timestamptz);
create index if not exists idx_admin_notifications_created on public.admin_notifications(created_at desc);
alter table public.admin_notifications enable row level security;

-- كل قرار تحقق يُسجَّل مع من اتخذه (الأدمن الآن، والذكاء الاصطناعي لاحقاً)
create table if not exists public.work_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')), reason text,
  by_kind text not null default 'admin' check (by_kind in ('admin', 'system', 'ai')), by_user uuid,
  created_at timestamptz not null default now());
alter table public.work_decisions enable row level security;

create or replace function public._is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or exists (select 1 from profiles where id = auth.uid()
           and (is_admin or account_type::text = 'admin' or type::text = 'admin'));
$$;
grant execute on function public._is_admin() to authenticated;

-- إشعارات الإدارة: قائمة خاصة + تنبيه على موبايل الأدمن (الطوارئ ليست من شأن الإدارة)
create or replace function public._notify_admins(p_kind text, p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_users uuid[];
begin
  if p_kind in ('sos', 'sos_end', 'luxury_request') then return; end if;
  insert into admin_notifications(kind, title, body, data) values (p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb));
  select array_agg(id) into v_users from profiles where is_admin or account_type::text = 'admin' or type::text = 'admin';
  if v_users is not null then
    perform public._push_send(v_users, p_title, p_body, coalesce(p_data, '{}'::jsonb) || jsonb_build_object('admin_kind', p_kind), 'admin');
  end if;
end; $$;
revoke all on function public._notify_admins(text, text, text, jsonb) from public, anon, authenticated;

-- الأدمن يرى صور الرخص والسجلات التجارية الخاصة
drop policy if exists "work docs read admin" on storage.objects;
create policy "work docs read admin" on storage.objects for select to authenticated
  using (bucket_id = 'work-docs' and public._is_admin());
