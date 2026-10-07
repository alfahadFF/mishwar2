-- الدفع وإنهاء التكسي (11 من 39): المدير: تسوية الرصيد
drop function if exists public.admin_wallet_adjust(uuid, numeric, text);
create or replace function public.admin_wallet_adjust(p_user uuid, p_amount numeric, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_after numeric; v_amt numeric := round(coalesce(p_amount, 0), 2);
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if v_amt = 0 then raise exception 'BAD_AMOUNT'; end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'NOTE_REQUIRED'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  insert into wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  update wallets set balance = balance + v_amt, updated_at = now() where user_id = p_user returning balance into v_after;
  insert into wallet_transactions(user_id, kind, amount, balance_after, counterparty, note)
  values (p_user, 'adjustment', v_amt, v_after, auth.uid(), btrim(p_note));
  return jsonb_build_object('balance', v_after);
end; $$;
grant execute on function public.admin_wallet_adjust(uuid, numeric, text) to authenticated;
