-- ---------- 4) الخصم الشهري المستحق (عند فتح السائق للتطبيق) ----------
create or replace function public.contract_settle_my_dues()
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record; v_due date; v_fee numeric; v_n int := 0; v_sum numeric := 0;
begin
  if auth.uid() is null then return jsonb_build_object('months', 0, 'amount', 0); end if;
  for f in select x.id, x.offered_price, x.months_charged, o.id as order_id, o.start_date, o.unit_count
             from contract_offers x join contract_orders o on o.id = x.contract_order_id
            where x.driver_id = auth.uid() and x.status = 'accepted' and x.ended_at is null
              and o.contract_unit = 'month' and o.start_date is not null and x.months_charged < o.unit_count
            for update of x loop
    loop
      exit when f.months_charged >= f.unit_count;
      v_due := (f.start_date + make_interval(months => f.months_charged))::date;
      exit when v_due > current_date;
      v_fee := public._wallet_charge_at(auth.uid(), 'contracts', f.order_id, f.offered_price, v_due::timestamptz);
      f.months_charged := f.months_charged + 1;
      update contract_offers set months_charged = f.months_charged, commission_total = commission_total + v_fee where id = f.id;
      v_n := v_n + 1; v_sum := v_sum + v_fee;
    end loop;
  end loop;
  return jsonb_build_object('months', v_n, 'amount', v_sum);
end; $$;
