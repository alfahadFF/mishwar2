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
