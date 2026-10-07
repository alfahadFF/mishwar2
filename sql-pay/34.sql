-- الدفع وإنهاء التكسي (34 من 39): قائمة بانتظار الدفع
drop function if exists public.my_payables();
create or replace function public.my_payables()
returns setof jsonb language sql stable security definer set search_path = public as $$
  with d as (select public._wallet_discount_pct() as pct),
  i as (select * from public._pay_items_a() union all select * from public._pay_items_b() union all select * from public._pay_items_c())
  select jsonb_build_object('service', i.service, 'ref_id', i.ref_id, 'period', i.period, 'title', i.title,
           'done_at', i.done_at, 'payee_name', p.full_name, 'gross', i.gross, 'discount_pct', d.pct,
           'discount', round(i.gross * d.pct / 100, 2), 'to_pay', i.gross - round(i.gross * d.pct / 100, 2))
    from i cross join d left join profiles p on p.id = i.payee
   where not exists (select 1 from wallet_payments w where w.service = i.service and w.ref_id = i.ref_id and w.period = i.period)
   order by i.done_at desc nulls last;
$$;
grant execute on function public.my_payables() to authenticated;
