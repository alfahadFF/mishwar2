-- ---------- 1) طلب العقد ----------
alter table public.contract_orders add column if not exists contract_unit text check (contract_unit in ('day','week','month'));
alter table public.contract_orders add column if not exists unit_count int check (unit_count between 1 and 366);
alter table public.contract_orders add column if not exists total_seats int;
alter table public.contract_orders alter column duration_type drop not null;
do $$ declare r record; begin
  for r in select conname from pg_constraint
            where conrelid = 'public.contract_orders'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%duration_type%' loop
    execute format('alter table public.contract_orders drop constraint %I', r.conname);
  end loop;
end $$;
-- تاريخ النهاية: اليومي = يوم الدوام رقم N • الأسبوعي = N أسبوع • الشهري = N شهر
-- الأيام: 0 = الأحد ... 6 = السبت (كما في التطبيق)
create or replace function public._ct_end_date(p_start date, p_unit text, p_n int, p_days int[])
returns date language sql immutable as $$
  select case
    when p_start is null or p_n is null then null
    when p_unit = 'week'  then p_start + (7 * p_n - 1)
    when p_unit = 'month' then (p_start + make_interval(months => p_n))::date - 1
    else (select d::date from generate_series(p_start, p_start + 800, interval '1 day') d
           where coalesce(array_length(p_days, 1), 0) = 0 or extract(dow from d)::int = any(p_days)
           order by d offset p_n - 1 limit 1)
  end;
$$;
create or replace function public._ct_set_end()
returns trigger language plpgsql as $$
begin
  if new.contract_unit is not null then
    new.end_date := public._ct_end_date(new.start_date, new.contract_unit, new.unit_count, new.days);
    new.duration_type := new.contract_unit;
  end if;
  return new;
end; $$;
drop trigger if exists trg_ct_set_end on public.contract_orders;
create trigger trg_ct_set_end before insert or update of start_date, contract_unit, unit_count, days on public.contract_orders
  for each row execute function public._ct_set_end();
-- الزبون يرى عقوده فقط، وينشئ طلباً بحالة "بانتظار العروض" فقط. التعديل عبر الدوال.
drop policy if exists "العميل يرى عقوده" on public.contract_orders;
create policy "العميل يرى عقوده" on public.contract_orders for select using (auth.uid() = user_id);
drop policy if exists "العميل ينشئ عقد" on public.contract_orders;
create policy "العميل ينشئ عقد" on public.contract_orders for insert with check (auth.uid() = user_id and status = 'pending');
drop policy if exists "العميل يعدل عقده" on public.contract_orders;
