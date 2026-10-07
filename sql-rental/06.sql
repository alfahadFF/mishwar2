-- التأجير (6 من 11): الطلب العام + موافقات المؤجّرين
create table if not exists public.rental_general (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  unit text not null check (unit in ('hour','day','week','month')),
  unit_count int not null check (unit_count >= 1),
  start_at timestamptz not null,
  unit_price numeric(12,2) not null check (unit_price > 0),
  lat double precision not null,
  lng double precision not null,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  created_at timestamptz not null default now()
);
alter table public.rental_general enable row level security;

create table if not exists public.rental_general_offers (
  id uuid primary key default gen_random_uuid(),
  general_id uuid not null references public.rental_general(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.rental_listings(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','chosen','cancelled')),
  created_at timestamptz not null default now(),
  unique (general_id, provider_id)
);
alter table public.rental_general_offers enable row level security;

create or replace function public.rental_post_general(p_unit text, p_count int, p_start timestamptz, p_price numeric, p_lat float8, p_lng float8)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if p_unit not in ('hour','day','week','month') or p_count < 1 or p_count > public._rental_max(p_unit) then raise exception 'RENTAL_BAD_PERIOD'; end if;
  if p_start < now() - interval '15 minutes' then raise exception 'PAST_TIME'; end if;
  if coalesce(p_price, 0) <= 0 then raise exception 'RENTAL_NO_PRICE'; end if;
  insert into rental_general(customer_id, unit, unit_count, start_at, unit_price, lat, lng)
  values (auth.uid(), p_unit, p_count, p_start, p_price, p_lat, p_lng) returning id into v_id;
  return jsonb_build_object('id', v_id);
end; $$;
grant execute on function public.rental_post_general(text, int, timestamptz, numeric, float8, float8) to authenticated;

create or replace function public.rental_cancel_general(p_general uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update rental_general set status = 'cancelled' where id = p_general and customer_id = auth.uid() and status = 'open';
  if not found then raise exception 'NOT_ALLOWED'; end if;
  update rental_general_offers set status = 'cancelled' where general_id = p_general and status = 'pending';
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.rental_cancel_general(uuid) to authenticated;

-- الطلبات العامة اللي بتناسب سيارات المؤجّر (ضمن 50 كم ونفس نوع المدة)
create or replace function public.rental_provider_generals()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'unit', g.unit, 'unit_count', g.unit_count, 'start_at', g.start_at,
           'unit_price', g.unit_price, 'total', round(g.unit_price * g.unit_count, 2),
           'listings', (select jsonb_agg(jsonb_build_object('id', l.id, 'brand_model', l.brand_model, 'year', l.year,
                                'km', public._rental_km(g.lat, g.lng, l.lat, l.lng)) order by public._rental_km(g.lat, g.lng, l.lat, l.lng))
                          from rental_listings l where l.provider_id = auth.uid() and l.status = 'active' and g.unit = any(l.units)
                           and public._rental_km(g.lat, g.lng, l.lat, l.lng) <= 50))
    from rental_general g
   where g.status = 'open' and g.start_at > now() - interval '15 minutes' and g.customer_id <> auth.uid()
     and not public.wallet_blocked(auth.uid())
     and not exists (select 1 from rental_general_offers o where o.general_id = g.id and o.provider_id = auth.uid())
     and exists (select 1 from rental_listings l where l.provider_id = auth.uid() and l.status = 'active' and g.unit = any(l.units)
                   and public._rental_km(g.lat, g.lng, l.lat, l.lng) <= 50)
   order by g.created_at desc limit 50;
$$;
grant execute on function public.rental_provider_generals() to authenticated;

create or replace function public.rental_respond_general(p_general uuid, p_listing uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g rental_general; l rental_listings;
begin
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_BLOCKED'; end if;
  select * into g from rental_general where id = p_general;
  select * into l from rental_listings where id = p_listing and provider_id = auth.uid();
  if g.id is null or g.status <> 'open' or g.start_at < now() - interval '15 minutes' then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  if l.id is null or l.status <> 'active' or not (g.unit = any(l.units))
     or public._rental_km(g.lat, g.lng, l.lat, l.lng) > 50 then raise exception 'RENTAL_NOT_AVAILABLE'; end if;
  insert into rental_general_offers(general_id, provider_id, listing_id) values (g.id, auth.uid(), l.id);
  insert into user_notifications(user_id, kind, title, body, data)
  values (g.customer_id, 'rental_offer', 'وصلتك موافقة على طلبك', l.brand_model || ' ' || l.year, jsonb_build_object('general_id', g.id));
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.rental_respond_general(uuid, uuid) to authenticated;
