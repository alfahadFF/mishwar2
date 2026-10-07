-- الجزء 6 من 14 — صلاحيات العروض

drop policy if exists "offers_select_all" on public.cargo_offers;

drop policy if exists "offers_insert_driver" on public.cargo_offers;

drop policy if exists "offers_update_own" on public.cargo_offers;

drop policy if exists "offers_update_client" on public.cargo_offers;

drop policy if exists "offers_select_party" on public.cargo_offers;

create policy "offers_select_party" on public.cargo_offers for select using (
  auth.uid() = driver_id
  or exists (select 1 from public.cargo_orders o where o.id = cargo_order_id and o.customer_id = auth.uid()));
