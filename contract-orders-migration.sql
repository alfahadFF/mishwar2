-- عقود النقل — 6 فئات: مدارس، روضة، جامعات، مصانع، شركات، عمال
drop table if exists public.contract_offers cascade;
drop table if exists public.contract_orders cascade;

create table public.contract_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  contract_category text not null check (contract_category in ('school','kindergarten','university','factory','company','workers')),
  contract_role text not null check (contract_role in ('personal','business')),
  num_people integer not null check (num_people >= 1 and num_people <= 500),
  pickup_points jsonb not null default '[]'::jsonb, -- [{name,lat,lng}]
  departure_time time,
  destinations jsonb not null default '[]'::jsonb, -- مدارس/جامعات/مصانع/شركات [{name,lat,lng,return_time}]
  return_time time,
  drop_points jsonb default '[]'::jsonb, -- نقاط التنزيل (قد تختلف عن الانطلاق)
  days int[] not null default '{0,1,2,3,4}', -- 0=سبت ... 6=جمعة
  duration_type text not null check (duration_type in ('month','semester','year','custom')),
  start_date date,
  end_date date,
  need_supervisor boolean default false,
  vehicles jsonb default '[]'::jsonb, -- [{type,seats,count}]
  notes text,
  budget_type text not null default 'fixed' check (budget_type in ('fixed','quote')),
  budget_from numeric(12,2) check (budget_from >= 0),
  budget_to numeric(12,2) check (budget_to >= 0),
  budget_period text default 'monthly' check (budget_period in ('monthly','total')),
  currency text default 'USD' check (currency in ('USD','SYP')),
  status text not null default 'pending' check (status in ('pending','accepted','completed','cancelled')),
  driver_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.update_contract_orders_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_contract_orders_updated_at on public.contract_orders;
create trigger trg_contract_orders_updated_at before update on public.contract_orders
for each row execute function public.update_contract_orders_updated_at();

create index idx_contract_orders_user on public.contract_orders(user_id);
create index idx_contract_orders_cat on public.contract_orders(contract_category);
create index idx_contract_orders_status on public.contract_orders(status);

alter table public.contract_orders enable row level security;
drop policy if exists "العميل يرى عقوده" on public.contract_orders;
create policy "العميل يرى عقوده" on public.contract_orders for select using (auth.uid()=user_id or auth.uid()=driver_id or status='pending');
drop policy if exists "العميل ينشئ عقد" on public.contract_orders;
create policy "العميل ينشئ عقد" on public.contract_orders for insert with check (auth.uid()=user_id);
drop policy if exists "العميل يعدل عقده" on public.contract_orders;
create policy "العميل يعدل عقده" on public.contract_orders for update using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- عروض العقود
create table public.contract_offers (
  id uuid primary key default gen_random_uuid(),
  contract_order_id uuid not null references public.contract_orders(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  offered_price numeric(12,2) not null check (offered_price > 0),
  currency text not null default 'USD' check (currency in ('USD','SYP')),
  price_period text default 'monthly' check (price_period in ('monthly','total')),
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  accepted_at timestamptz,
  unique(contract_order_id, driver_id)
);

create or replace function public.update_contract_offers_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_contract_offers_updated_at on public.contract_offers;
create trigger trg_contract_offers_updated_at before update on public.contract_offers for each row execute function public.update_contract_offers_updated_at();

create index idx_contract_offers_order on public.contract_offers(contract_order_id);
alter table public.contract_offers enable row level security;
drop policy if exists "عرض عقد مرئي" on public.contract_offers;
create policy "عرض عقد مرئي" on public.contract_offers for select using (true);
drop policy if exists "السائق ينشئ عرض عقد" on public.contract_offers;
create policy "السائق ينشئ عرض عقد" on public.contract_offers for insert with check (auth.uid()=driver_id);
drop policy if exists "إدارة عرض العقد" on public.contract_offers;
create policy "إدارة عرض العقد" on public.contract_offers for update using (auth.uid()=driver_id or auth.uid()=(select user_id from public.contract_orders where id=contract_order_id));

create or replace function public.accept_contract_offer(p_offer_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_order uuid; v_driver uuid; v_owner uuid;
begin
  select contract_order_id, driver_id into v_order, v_driver from public.contract_offers where id=p_offer_id;
  if v_order is null then raise exception 'العرض غير موجود'; end if;
  select user_id into v_owner from public.contract_orders where id=v_order;
  if v_owner != auth.uid() then raise exception 'غير مصرح'; end if;
  update public.contract_offers set status='accepted', accepted_at=now() where id=p_offer_id;
  update public.contract_offers set status='rejected' where contract_order_id=v_order and id!=p_offer_id and status='pending';
  update public.contract_orders set status='accepted', driver_id=v_driver where id=v_order;
  return jsonb_build_object('success', true);
end; $$;

select table_name from information_schema.tables where table_name in ('contract_orders','contract_offers');
