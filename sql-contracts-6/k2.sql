-- ---------- 2) عروض السائقين: عرض لكل مركبة ----------
alter table public.contract_offers add column if not exists item_type text
  check (item_type in ('car','van_8','van_11','bus_small_14','bus_mid_18','bus_mid_21','bus_mid_27','bus_large_50'));
alter table public.contract_offers add column if not exists vehicle jsonb;              -- نسخة من بيانات المركبة وقت العرض
alter table public.contract_offers add column if not exists reason text;                -- filled / customer / cancelled
alter table public.contract_offers add column if not exists commission numeric(12,2);   -- عمولة القبول
alter table public.contract_offers add column if not exists commission_total numeric(12,2) not null default 0;
alter table public.contract_offers add column if not exists months_charged int not null default 0;
alter table public.contract_offers add column if not exists ended_at timestamptz;        -- أنهى الزبون العقد
alter table public.contract_offers alter column price_period drop default;
do $$ declare r record; begin
  for r in select conname from pg_constraint
            where conrelid = 'public.contract_offers'::regclass
              and ((contype = 'c' and (pg_get_constraintdef(oid) like '%status%' or pg_get_constraintdef(oid) like '%price_period%'))
                   or contype = 'u') loop
    execute format('alter table public.contract_offers drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.contract_offers add constraint contract_offers_status_check
  check (status in ('pending','accepted','rejected','withdrawn','cancelled'));
create unique index if not exists uq_contract_offer_active on public.contract_offers(contract_order_id, driver_id)
  where status in ('pending','accepted');
drop policy if exists "عرض عقد مرئي" on public.contract_offers;
drop policy if exists "السائق ينشئ عرض عقد" on public.contract_offers;
drop policy if exists "إدارة عرض العقد" on public.contract_offers;
drop policy if exists "contract_offers_select" on public.contract_offers;
create policy "contract_offers_select" on public.contract_offers for select using (
  auth.uid() = driver_id or auth.uid() = (select user_id from public.contract_orders where id = contract_order_id));
