-- ---------- 3) دوال مساعدة ----------
create or replace function public._ct_items_left(p_order uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(v.item || jsonb_build_object('left', greatest(0, coalesce((v.item->>'count')::int, 0) - (
           select count(*) from contract_offers f
            where f.contract_order_id = p_order and f.item_type = v.item->>'type' and f.status = 'accepted')::int))
         order by v.ord), '[]'::jsonb)
    from contract_orders o, jsonb_array_elements(coalesce(o.vehicles, '[]'::jsonb)) with ordinality v(item, ord)
   where o.id = p_order;
$$;
-- الباصات والفانات: أي صاحب باص/فان • السيارة: أصحاب السيارات
create or replace function public._ct_can_serve(p_item text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case when p_item = 'car' then p.event_vehicle_type = 'car'
                               else p_item in ('van_8','van_11','bus_small_14','bus_mid_18','bus_mid_21','bus_mid_27','bus_large_50')
                                and p.event_vehicle_type in ('van_8','van_11','bus_small_14','bus_mid_18','bus_mid_21','bus_mid_27','bus_large_50') end
                     from profiles p where p.id = p_user), false);
$$;
-- خصم عمولة بتاريخ استحقاق محدد: المجانية تُحسب حسب تاريخ الاستحقاق لا وقت الخصم
create or replace function public._wallet_charge_at(p_user uuid, p_service text, p_ref uuid, p_gross numeric, p_at timestamptz)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_rate numeric; v_fee numeric; v_bal numeric; v_free boolean;
begin
  insert into wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  perform 1 from wallets where user_id = p_user for update;
  v_free := p_at < coalesce(public.free_until(p_user), '-infinity'::timestamptz);
  select rate into v_rate from service_commissions where service = p_service;
  v_fee := case when v_free then 0 else round(coalesce(v_rate, 0) * p_gross, 2) end;
  update wallets set balance = balance - v_fee, updated_at = now() where user_id = p_user returning balance into v_bal;
  insert into wallet_transactions(user_id, kind, amount, balance_after, service, ref_id, gross_amount, is_trial, note)
  values (p_user, 'commission', -v_fee, v_bal, p_service, p_ref, p_gross, v_free,
          case when v_free then 'ضمن الفترة المجانية' end);
  return v_fee;
end; $$;
-- إجمالي قيمة العرض = سعر الوحدة × المدة
create or replace function public._ct_total(p_price numeric, p_order uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select round(p_price * coalesce((select unit_count from contract_orders where id = p_order), 1), 2);
$$;
revoke all on function public._ct_items_left(uuid) from public, anon, authenticated;
revoke all on function public._ct_can_serve(text, uuid) from public, anon, authenticated;
revoke all on function public._wallet_charge_at(uuid, text, uuid, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public._ct_total(numeric, uuid) from public, anon, authenticated;
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
