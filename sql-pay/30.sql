-- الدفع وإنهاء التكسي (30 من 39): سجل المحفظة (بدون اسم راكب التكسي)
drop function if exists public.my_wallet_transactions(int);
create or replace function public.my_wallet_transactions(p_limit int default 50)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'kind', t.kind, 'amount', t.amount, 'balance_after', t.balance_after,
           'service', t.service, 'gross', t.gross_amount, 'discount', t.discount, 'note', t.note,
           'is_trial', t.is_trial, 'created_at', t.created_at,
           'counterparty', case when t.counterparty is not null and not (t.service = 'taxi' and t.kind = 'payment_in')
                                then public._short_name(p.full_name) end)
    from wallet_transactions t left join profiles p on p.id = t.counterparty
   where t.user_id = auth.uid()
   order by t.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
grant execute on function public.my_wallet_transactions(int) to authenticated;
