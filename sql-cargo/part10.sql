-- الجزء 10 من 14 — الدوال

create or replace function public.carrier_accept_cargo(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o cargo_orders; v_class text; v_fee numeric; c profiles;
begin
  select * into o from cargo_orders where id = p_order for update;
  if o.id is null or o.status <> 'open' then raise exception 'ORDER_NOT_AVAILABLE'; end if;
  if o.budget_type is distinct from 'fixed' or coalesce(o.budget_to, 0) <= 0 then raise exception 'NO_FIXED_BUDGET'; end if;
  select vehicle_class into v_class from profiles where id = auth.uid();
  if not public.cargo_vehicle_fits(o.vehicle_class, v_class) then raise exception 'VEHICLE_NOT_SUITABLE'; end if;
  if public.wallet_blocked(auth.uid()) then raise exception 'WALLET_NEGATIVE'; end if;
  v_fee := public._wallet_charge(auth.uid(), 'cargo', o.id, o.budget_to);
  update cargo_orders set status = 'accepted', carrier_id = auth.uid(), agreed_price = o.budget_to,
         commission_amount = v_fee, accepted_via = 'direct', accepted_at = now(), updated_at = now()
   where id = o.id;
  update cargo_offers set status = 'rejected' where cargo_order_id = o.id and status = 'pending';
  select * into c from profiles where id = o.customer_id;
  return jsonb_build_object('agreed_price', o.budget_to, 'commission', v_fee, 'free', v_fee = 0,
         'customer_name', c.full_name, 'customer_phone', c.phone);
end; $$;
