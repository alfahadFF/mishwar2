-- ---------- 4) عروض السائقين: عرض لكل مركبة ----------
alter table public.event_offers add column if not exists item_type text
  check (item_type in ('wedding_car','bus_large_50','bus_mid_27','bus_mid_21','bus_mid_18','bus_small_14','van_11','van_8'));
alter table public.event_offers add column if not exists vehicle jsonb;          -- نسخة من بيانات المركبة وقت العرض
alter table public.event_offers add column if not exists reason text;            -- filled / customer / cancelled
alter table public.event_offers add column if not exists commission numeric(12,2);
alter table public.event_offers add column if not exists completed_at timestamptz;
do $$ declare r record; begin
  for r in select conname from pg_constraint
            where conrelid = 'public.event_offers'::regclass
              and ((contype = 'c' and pg_get_constraintdef(oid) like '%status%') or contype = 'u') loop
    execute format('alter table public.event_offers drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.event_offers add constraint event_offers_status_check
  check (status in ('pending','accepted','rejected','withdrawn','cancelled'));
-- عرض فعّال واحد لكل سائق في الطلب (يمكنه العرض من جديد بعد السحب)
create unique index if not exists uq_event_offer_active on public.event_offers(event_order_id, driver_id)
  where status in ('pending','accepted');
drop policy if exists "عرض مرئي للجميع" on public.event_offers;
drop policy if exists "السائق ينشئ عرض" on public.event_offers;
drop policy if exists "إدارة العرض" on public.event_offers;
drop policy if exists "event_offers_select" on public.event_offers;
create policy "event_offers_select" on public.event_offers for select using (
  auth.uid() = driver_id or auth.uid() = (select user_id from public.event_orders where id = event_order_id));
