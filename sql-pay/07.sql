-- الدفع وإنهاء التكسي (7 من 39): نقل الرصيد
-- نقل الرصيد بين محفظتين (يُرجع رصيد المُرسل بعد التحويل)
create or replace function public._transfer_move(p_from uuid, p_to uuid, p_amt numeric, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_a numeric; v_b numeric; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  insert into wallets(user_id) values (p_from), (p_to) on conflict (user_id) do nothing;
  perform 1 from wallets where user_id in (p_from, p_to) order by user_id for update;
  if (select balance from wallets where user_id = p_from) < p_amt then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update wallets set balance = balance - p_amt, updated_at = now() where user_id = p_from returning balance into v_a;
  update wallets set balance = balance + p_amt, updated_at = now() where user_id = p_to returning balance into v_b;
  insert into wallet_transactions(user_id, kind, amount, balance_after, counterparty, note)
  values (p_from, 'transfer_out', -p_amt, v_a, p_to, v_note), (p_to, 'transfer_in', p_amt, v_b, p_from, v_note);
  return v_a;
end; $$;
revoke all on function public._transfer_move(uuid, uuid, numeric, text) from public, anon, authenticated;
