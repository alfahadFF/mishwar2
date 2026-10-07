-- الدفع وإنهاء التكسي (13 من 39): المدير: ملخص البطاقات
drop function if exists public.admin_topup_batches();
create or replace function public.admin_topup_batches()
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select jsonb_build_object('batch', coalesce(batch, '—'), 'amount', amount, 'total', count(*),
           'used', count(*) filter (where status = 'used'), 'disabled', count(*) filter (where status = 'disabled'),
           'created_at', min(created_at))
    from topup_cards group by batch, amount order by min(created_at) desc limit 50;
end; $$;
grant execute on function public.admin_topup_batches() to authenticated;
