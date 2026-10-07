-- الجزء 13 من 14 — الدوال

-- فئة المركبة تُحدَّد عند تسجيل الناقل واعتماده، ولا يغيّرها الناقل بنفسه
drop function if exists public.set_my_vehicle_class(text);

grant execute on function public.my_wallet() to authenticated;

grant execute on function public.wallet_blocked(uuid) to authenticated;

grant execute on function public.carrier_cargo_feed(double precision, double precision, double precision) to authenticated;

grant execute on function public.carrier_accept_cargo(uuid) to authenticated;

grant execute on function public.carrier_send_cargo_offer(uuid, numeric, text) to authenticated;

grant execute on function public.carrier_withdraw_cargo_offer(uuid) to authenticated;

grant execute on function public.accept_cargo_offer(uuid) to authenticated;

grant execute on function public.carrier_my_cargo_jobs() to authenticated;

grant execute on function public.carrier_complete_cargo(uuid) to authenticated;


revoke all on function public.admin_wallet_topup(uuid, numeric, text) from public, anon;

grant execute on function public.admin_wallet_topup(uuid, numeric, text) to authenticated;
