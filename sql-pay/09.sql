-- الدفع وإنهاء التكسي (9 من 39): بيانات المحفظة
drop function if exists public.my_wallet();
create or replace function public.my_wallet()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'blocked', public.wallet_blocked(auth.uid()),
    'free_until', public.free_until(auth.uid()),
    'free_days_left', greatest(0, ceil(extract(epoch from (public.free_until(auth.uid()) - now())) / 86400))::int,
    'wallet_id', (select wallet_id from profiles where id = auth.uid()),
    'discount_pct', public._wallet_discount_pct(),
    'has_pin', exists (select 1 from wallet_security where user_id = auth.uid() and pin_hash is not null),
    'pin_locked_until', (select locked_until from wallet_security where user_id = auth.uid() and locked_until > now()),
    'transfer_limit', coalesce((select value::numeric from app_settings where key = 'wallet_daily_transfer_limit'), 0),
    'transferred_today', public._transferred_today(auth.uid()),
    'is_admin', auth.uid() is not null and public._is_admin());
$$;
grant execute on function public.my_wallet() to authenticated;
