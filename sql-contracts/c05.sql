drop policy if exists "عرض عقد مرئي" on public.contract_offers;
drop policy if exists "السائق ينشئ عرض عقد" on public.contract_offers;
drop policy if exists "إدارة عرض العقد" on public.contract_offers;
drop policy if exists "contract_offers_select" on public.contract_offers;
create policy "contract_offers_select" on public.contract_offers for select using (
  auth.uid() = driver_id or auth.uid() = (select user_id from public.contract_orders where id = contract_order_id));
