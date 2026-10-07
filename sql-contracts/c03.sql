-- الزبون يرى عقوده فقط، وينشئ طلباً بحالة "بانتظار العروض" فقط. التعديل عبر الدوال.
drop policy if exists "العميل يرى عقوده" on public.contract_orders;
create policy "العميل يرى عقوده" on public.contract_orders for select using (auth.uid() = user_id);
drop policy if exists "العميل ينشئ عقد" on public.contract_orders;
create policy "العميل ينشئ عقد" on public.contract_orders for insert with check (auth.uid() = user_id and status = 'pending');
drop policy if exists "العميل يعدل عقده" on public.contract_orders;
