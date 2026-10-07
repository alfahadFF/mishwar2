-- التأجير (5 من 11): الطلب على إعلان (بالسعر المعروض أو بعرض الزبون)
create table if not exists public.rental_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.rental_listings(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  general_id uuid,
  unit text not null check (unit in ('hour','day','week','month')),
  unit_count int not null check (unit_count >= 1),
  start_at timestamptz not null,
  unit_price numeric(12,2) not null check (unit_price > 0),
  total numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  reason text,
  months_charged int not null default 0,
  commission_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz
);
create index if not exists idx_rental_req_listing on public.rental_requests(listing_id, status);
create index if not exists idx_rental_req_customer on public.rental_requests(customer_id);
create index if not exists idx_rental_req_provider on public.rental_requests(provider_id, status);
alter table public.rental_requests enable row level security;

create or replace function public.rental_request_listing(p_listing uuid, p_unit text, p_count int, p_start timestamptz, p_price numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l rental_listings; v_fixed numeric; v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  select * into l from rental_listings where id = p_listing;
  if l.id is null or l.status <> 'active' or public.wallet_blocked(l.provider_id) then raise exception 'RENTAL_NOT_AVAILABLE'; end if;
  if l.provider_id = auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if not (p_unit = any(l.units)) or p_count < 1 or p_count > public._rental_max(p_unit) then raise exception 'RENTAL_BAD_PERIOD'; end if;
  if p_start < now() - interval '15 minutes' then raise exception 'PAST_TIME'; end if;
  v_fixed := nullif(l.prices->>p_unit, '')::numeric;
  if l.pricing_mode = 'fixed' and p_price is distinct from v_fixed then raise exception 'RENTAL_FIXED_PRICE'; end if;
  if coalesce(p_price, 0) <= 0 then raise exception 'RENTAL_NO_PRICE'; end if;
  if exists (select 1 from rental_requests where listing_id = l.id and customer_id = auth.uid() and status = 'pending') then
    raise exception 'RENTAL_ALREADY_REQUESTED'; end if;
  insert into rental_requests(listing_id, customer_id, provider_id, unit, unit_count, start_at, unit_price, total)
  values (l.id, auth.uid(), l.provider_id, p_unit, p_count, p_start, p_price, round(p_price * p_count, 2))
  returning id into v_id;
  insert into user_notifications(user_id, kind, title, body, data)
  values (l.provider_id, 'rental_request', 'طلب إيجار جديد', l.brand_model || ' • ' || public._amt(round(p_price * p_count, 2)),
          jsonb_build_object('request_id', v_id));
  return jsonb_build_object('id', v_id);
end; $$;
grant execute on function public.rental_request_listing(uuid, text, int, timestamptz, numeric) to authenticated;

create or replace function public.rental_cancel_request(p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update rental_requests set status = 'cancelled' where id = p_request and customer_id = auth.uid() and status = 'pending';
  if not found then raise exception 'NOT_ALLOWED'; end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.rental_cancel_request(uuid) to authenticated;
