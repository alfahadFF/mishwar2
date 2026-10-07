-- الجزء 7 من 14 — الدوال

create or replace function public._wallet_charge(p_user uuid, p_service text, p_ref uuid, p_gross numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_rate numeric; v_fee numeric; v_bal numeric; v_trial boolean;
begin
  insert into wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  select not trial_used into v_trial from wallets where user_id = p_user for update;
  select rate into v_rate from service_commissions where service = p_service;
  v_fee := case when v_trial then 0 else round(coalesce(v_rate, 0) * p_gross, 2) end;
  update wallets set balance = balance - v_fee, trial_used = true, updated_at = now()
   where user_id = p_user returning balance into v_bal;
  insert into wallet_transactions(user_id, kind, amount, balance_after, service, ref_id, gross_amount, is_trial, note)
  values (p_user, 'commission', -v_fee, v_bal, p_service, p_ref, p_gross, v_trial,
          case when v_trial then 'طلب تجريبي مجاني' end);
  return v_fee;
end; $$;

revoke all on function public._wallet_charge(uuid, text, uuid, numeric) from public, anon, authenticated;

create or replace function public.wallet_blocked(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select balance < 0 from wallets where user_id = p_user), false);
$$;

create or replace function public.my_wallet()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'blocked', public.wallet_blocked(auth.uid()),
    'trial_available', coalesce((select not trial_used from wallets where user_id = auth.uid()), true));
$$;
