drop function if exists public.my_wallet();
create or replace function public.my_wallet()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'blocked', public.wallet_blocked(auth.uid()),
    'free_until', public.free_until(auth.uid()),
    'free_days_left', greatest(0, ceil(extract(epoch from (public.free_until(auth.uid()) - now())) / 86400))::int);
$$;

grant execute on function public.my_wallet() to authenticated;
