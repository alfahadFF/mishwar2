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
