-- خصم كل المستحق (عقود + تأجير) — قسم واحد
create or replace function public.settle_all_my_dues()
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; b jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('months', 0, 'amount', 0); end if;
  a := public.contract_settle_my_dues();
  b := public.rental_settle_my_dues();
  return jsonb_build_object('months', coalesce((a->>'months')::int, 0) + coalesce((b->>'months')::int, 0),
                            'amount', coalesce((a->>'amount')::numeric, 0) + coalesce((b->>'amount')::numeric, 0));
end; $$;
revoke execute on function public.settle_all_my_dues() from public, anon;
grant execute on function public.settle_all_my_dues() to authenticated;

select case when exists (select 1 from pg_proc where proname = 'settle_all_my_dues') then 'تم ✓' else 'ناقص' end as النتيجة;
