-- إلغاءات السائق (11 من 16): إخفاء الطلبات عن السائق الموقوف
drop policy if exists "العميل يرى طلبه" on public.taxi_orders;
create policy "العميل يرى طلبه" on public.taxi_orders for select
  using (auth.uid() = user_id or auth.uid() = driver_id
         or (status = 'pending' and not public._taxi_suspended(auth.uid())));
