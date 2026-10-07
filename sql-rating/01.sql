-- التقييم (1 من 7): جدول التقييمات + المتوسط + إشعار التقييم
create table if not exists public.provider_reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('taxi','taxi_shared','cargo','events','contracts','rental')),
  ref_id uuid not null,
  period int not null default 0,
  due_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  status text not null default 'pending' check (status in ('pending','done','skipped')),
  stars int check (stars between 1 and 5),
  tags text[] not null default '{}',
  rated_at timestamptz,
  unique (service, ref_id, period, customer_id)
);
create index if not exists idx_reviews_provider on public.provider_reviews(provider_id, status);
create index if not exists idx_reviews_customer on public.provider_reviews(customer_id, status);
alter table public.provider_reviews enable row level security;

-- الأزرار الجاهزة المسموحة
create or replace function public._rating_tags()
returns text[] language sql immutable as $$
  select array['safe_driving','on_time','clean','polite','knows_route','careful_goods','as_listed',
               'reckless','late','dirty','rude','overcharge','damaged_goods','not_as_listed'];
$$;

-- متوسط مقدم الخدمة (رقم وعدد فقط)
create or replace function public._provider_rating(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('avg', round(avg(stars)::numeric, 1), 'n', count(stars))
    from provider_reviews where provider_id = p_uid and status = 'done' and stars is not null;
$$;
revoke execute on function public._provider_rating(uuid) from public, anon, authenticated;

-- إنشاء طلب تقييم (يتجاهل التكرار)
create or replace function public._rating_add(p_customer uuid, p_provider uuid, p_service text, p_ref uuid, p_period int, p_due timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_customer is null or p_provider is null or p_customer = p_provider then return; end if;
  if p_due + interval '24 hours' <= now() then return; end if;
  insert into provider_reviews(customer_id, provider_id, service, ref_id, period, due_at, expires_at)
  values (p_customer, p_provider, p_service, p_ref, coalesce(p_period, 0), p_due, p_due + interval '24 hours')
  on conflict (service, ref_id, period, customer_id) do nothing;
  if found then
    insert into user_notifications(user_id, kind, title, body, data)
    values (p_customer, 'rating', '⭐ كيف كانت الخدمة؟', 'قيّم تجربتك خلال 24 ساعة',
            jsonb_build_object('service', p_service, 'ref_id', p_ref));
  end if;
end; $$;
revoke execute on function public._rating_add(uuid, uuid, text, uuid, int, timestamptz) from public, anon, authenticated;
