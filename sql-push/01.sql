-- الإشعارات (1 من 7): تفعيل الإرسال + رموز الموبايلات + إعدادات مقدم الخدمة
create extension if not exists pg_net;

create table if not exists public.device_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_push_tokens_user on public.device_push_tokens(user_id);
alter table public.device_push_tokens enable row level security;

create table if not exists public.provider_push_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_orders boolean not null default true,
  lat double precision,
  lng double precision,
  loc_at timestamptz
);
alter table public.provider_push_prefs enable row level security;

create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(trim(p_token), '') = '' then return; end if;
  insert into device_push_tokens(token, user_id, platform, updated_at)
  values (trim(p_token), auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now();
end;
$$;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from device_push_tokens where token = trim(p_token) and user_id = auth.uid();
$$;
grant execute on function public.unregister_push_token(text) to authenticated;

-- زر «استقبال الطلبات الجديدة»
create or replace function public.set_new_orders_push(p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  insert into provider_push_prefs(user_id, new_orders) values (auth.uid(), coalesce(p_on, true))
  on conflict (user_id) do update set new_orders = coalesce(p_on, true);
  return coalesce(p_on, true);
end;
$$;
grant execute on function public.set_new_orders_push(boolean) to authenticated;

create or replace function public.my_push_prefs()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('new_orders', coalesce((select new_orders from provider_push_prefs where user_id = auth.uid()), true));
$$;
grant execute on function public.my_push_prefs() to authenticated;

-- آخر موقع لمقدم الخدمة (كل ما يفتح لوحته)
create or replace function public.provider_location_ping(p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_lat is null or p_lng is null then return; end if;
  insert into provider_push_prefs(user_id, lat, lng, loc_at) values (auth.uid(), p_lat, p_lng, now())
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, loc_at = now();
end;
$$;
grant execute on function public.provider_location_ping(double precision, double precision) to authenticated;
