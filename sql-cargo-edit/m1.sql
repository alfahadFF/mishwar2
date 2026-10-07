-- تعديل طلب النقل (1 من 3): الصلاحيات
-- الزبون ينشئ طلبه ويقرؤه، والتعديل والإلغاء عبر الدوال فقط
alter table public.cargo_orders add column if not exists edited_at timestamptz;
alter table public.cargo_orders add column if not exists edited_fields text[];

-- حذف أي صلاحية تعديل أو حذف مباشر، وأي قراءة مفتوحة للجميع (مهما كان اسمها)
do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'cargo_orders'
              and (cmd in ('UPDATE','DELETE','ALL') or (cmd = 'SELECT' and coalesce(qual, 'true') = 'true'))
  loop
    execute format('drop policy %I on public.cargo_orders', r.policyname);
  end loop;
end $$;
drop policy if exists "cargo_select_party" on public.cargo_orders;
create policy "cargo_select_party" on public.cargo_orders for select
  using (auth.uid() = customer_id or auth.uid() = carrier_id);

-- عند الإنشاء من التطبيق: الطلب يبدأ مفتوحاً وبلا ناقل أو سعر متفق عليه
create or replace function public.cargo_orders_insert_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.customer_id := auth.uid();
    new.status := 'open';
    new.carrier_id := null;
    new.agreed_price := null;
    new.commission_amount := null;
    new.accepted_via := null;
    new.accepted_at := null;
    new.completed_at := null;
    new.edited_at := null;
    new.edited_fields := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_cargo_orders_insert_guard on public.cargo_orders;
create trigger trg_cargo_orders_insert_guard before insert on public.cargo_orders
  for each row execute function public.cargo_orders_insert_guard();
