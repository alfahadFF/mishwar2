-- الرحلة المشتركة (19 من 22): تحويل الدفعة (المشتركة مثل التكسي)
create or replace function public._pay_credit(p_service text, p_ref uuid, p_payer uuid, p_payee uuid, p_payer_bal numeric,
  p_gross numeric, p_paid numeric, p_disc numeric, p_pct numeric, p_title text)
returns void language plpgsql security definer set search_path = public as $$
declare v_b numeric; v_taxi boolean := p_service in ('taxi','taxi_shared');
        v_in numeric := case when v_taxi then p_paid else p_gross end;
begin
  update wallets set balance = balance + v_in, updated_at = now() where user_id = p_payee returning balance into v_b;
  insert into wallet_transactions(user_id, kind, amount, balance_after, service, ref_id, gross_amount, counterparty, discount, note)
  values (p_payer, 'payment_out', -p_paid, p_payer_bal, p_service, p_ref, p_gross, p_payee, nullif(p_disc, 0), p_title),
         (p_payee, 'payment_in', v_in, v_b, p_service, p_ref, p_gross, p_payer, null, p_title);
  if v_taxi and p_disc > 0 then
    update wallets set balance = balance + p_disc, updated_at = now() where user_id = p_payee returning balance into v_b;
    insert into wallet_transactions(user_id, kind, amount, balance_after, service, ref_id, gross_amount, note)
    values (p_payee, 'commission', p_disc, v_b, p_service, p_ref, p_gross,
            'تخفيض العمولة مقابل خصم الدفع من التطبيق ' || public._amt(p_pct) || '%');
  end if;
end; $$;
revoke all on function public._pay_credit(text, uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, text) from public, anon, authenticated;
