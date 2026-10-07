-- الجزء 8 من 14 — الدوال

create or replace function public.admin_wallet_topup(p_user uuid, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_before numeric; v_after numeric;
begin
  if auth.uid() is not null and not exists (
       select 1 from profiles where id = auth.uid() and (account_type = 'admin' or type = 'admin')) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;
  insert into wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_before from wallets where user_id = p_user for update;
  update wallets set balance = balance + p_amount, updated_at = now() where user_id = p_user returning balance into v_after;
  insert into wallet_transactions(user_id, kind, amount, balance_after, debt_paid, note)
  values (p_user, 'topup', p_amount, v_after, least(greatest(-v_before, 0), p_amount), p_note);
  return jsonb_build_object('balance', v_after, 'debt_paid', least(greatest(-v_before, 0), p_amount));
end; $$;

create or replace function public.cargo_vehicle_fits(p_order text, p_carrier text)
returns boolean language sql immutable as $$
  with m(k, g, r) as (values
    ('pk800','pickup',1),('pk1200','pickup',2),('pk1500','pickup',3),('pk2000','pickup',4),
    ('md3','medium',1),('md4','medium',2),('md5','medium',3),('md6','medium',4),('md7','medium',5),
    ('truck','truck',1))
  select coalesce((select c.g = o.g and c.r >= o.r from m o, m c where o.k = p_order and c.k = p_carrier), false);
$$;

drop function if exists public.carrier_cargo_feed(double precision, double precision, double precision);
