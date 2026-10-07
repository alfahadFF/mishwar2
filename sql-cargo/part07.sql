-- الجزء 7 من 14 — الدوال

-- نهاية الفترة المجانية = تاريخ التسجيل + عدد الأيام المجانية
create or replace function public.free_until(p_user uuid)
returns timestamptz language sql stable security definer set search_path = public, auth as $$
  select u.created_at + make_interval(days => coalesce((select value::int from public.app_settings where key = 'free_days'), 0))
    from auth.users u where u.id = p_user;
$$;
revoke all on function public.free_until(uuid) from public, anon, authenticated;

-- خصم العمولة: لا عمولة ضمن الفترة المجانية، وبعدها تُخصم دائماً حتى لو صار الرصيد سالباً
create or replace function public._wallet_charge(p_user uuid, p_service text, p_ref uuid, p_gross numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_rate numeric; v_fee numeric; v_bal numeric; v_free boolean;
begin
  insert into wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  perform 1 from wallets where user_id = p_user for update;
  v_free := now() < coalesce(public.free_until(p_user), '-infinity'::timestamptz);
  select rate into v_rate from service_commissions where service = p_service;
  v_fee := case when v_free then 0 else round(coalesce(v_rate, 0) * p_gross, 2) end;
  update wallets set balance = balance - v_fee, updated_at = now()
   where user_id = p_user returning balance into v_bal;
  insert into wallet_transactions(user_id, kind, amount, balance_after, service, ref_id, gross_amount, is_trial, note)
  values (p_user, 'commission', -v_fee, v_bal, p_service, p_ref, p_gross, v_free,
          case when v_free then 'ضمن الفترة المجانية' end);
  return v_fee;
end; $$;

revoke all on function public._wallet_charge(uuid, text, uuid, numeric) from public, anon, authenticated;

create or replace function public.wallet_blocked(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select balance < 0 from wallets where user_id = p_user), false);
$$;

drop function if exists public.my_wallet();
create or replace function public.my_wallet()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'blocked', public.wallet_blocked(auth.uid()),
    'free_until', public.free_until(auth.uid()),
    'free_days_left', greatest(0, ceil(extract(epoch from (public.free_until(auth.uid()) - now())) / 86400))::int);
$$;
