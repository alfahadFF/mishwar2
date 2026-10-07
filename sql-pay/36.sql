-- الدفع وإنهاء التكسي (36 من 39): صاحب الخدمة المستحق
-- صاحب الخدمة المستحق للدفعة
create or replace function public._payable_payee(p_service text, p_ref uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select payee from (select * from public._pay_items_a() union all select * from public._pay_items_b()
                     union all select * from public._pay_items_c()) i
   where i.service = p_service and i.ref_id = p_ref limit 1;
$$;
revoke all on function public._payable_payee(text, uuid) from public, anon, authenticated;
