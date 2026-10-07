-- ---------- 3) طلبات المناسبات ----------
-- pending = بانتظار العروض • accepted = اكتملت كل المركبات
alter table public.event_orders add column if not exists wait boolean not null default true;
alter table public.event_orders add column if not exists total_seats int;
drop policy if exists "العميل يرى طلباته" on public.event_orders;
create policy "العميل يرى طلباته" on public.event_orders for select using (auth.uid() = user_id);
drop policy if exists "العميل يعدل طلبه" on public.event_orders;   -- الحالة والإلغاء عبر الدوال فقط
