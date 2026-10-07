create or replace function public.reject_contract_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update contract_offers f set status = 'rejected', reason = 'customer'
   where f.id = p_offer and f.status = 'pending'
     and exists (select 1 from contract_orders o where o.id = f.contract_order_id and o.user_id = auth.uid());
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;

-- إلغاء الطلب: قبل قبول أي عرض فقط
create or replace function public.cancel_contract_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from contract_offers where contract_order_id = p_order and status = 'accepted') then raise exception 'HAS_ACCEPTED'; end if;
  update contract_orders set status = 'cancelled' where id = p_order and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'ORDER_CLOSED'; end if;
  update contract_offers set status = 'rejected', reason = 'cancelled' where contract_order_id = p_order and status = 'pending';
end; $$;

-- إنهاء عقد مركبة (الزبون فقط): يتوقف الخصم الشهري، ولا استرداد لما خُصم
create or replace function public.end_contract_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  update contract_offers f set ended_at = now()
   where f.id = p_offer and f.status = 'accepted' and f.ended_at is null
     and exists (select 1 from contract_orders o where o.id = f.contract_order_id and o.user_id = auth.uid())
  returning contract_order_id into v_order;
  if v_order is null then raise exception 'NOT_ALLOWED'; end if;
  -- عند إنهاء كل المركبات يُغلق الطلب
  if not exists (select 1 from contract_offers where contract_order_id = v_order and status = 'accepted' and ended_at is null) then
    update contract_orders set status = 'completed' where id = v_order;
    update contract_offers set status = 'rejected', reason = 'cancelled' where contract_order_id = v_order and status = 'pending';
  end if;
end; $$;
-- ---------- 8) السائق: عروضي وعقودي ----------
drop function if exists public.driver_my_contract_offers();
create or replace function public.driver_my_contract_offers()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'order_id', o.id, 'item_type', f.item_type, 'price', f.offered_price,
           'unit', o.contract_unit, 'unit_count', o.unit_count, 'total', public._ct_total(f.offered_price, o.id),
           'status', f.status, 'reason', f.reason, 'created_at', f.created_at, 'order_status', o.status,
           'contract_category', o.contract_category, 'start_date', o.start_date, 'pickup_points', o.pickup_points)
    from contract_offers f join contract_orders o on o.id = f.contract_order_id
   where f.driver_id = auth.uid() and f.status in ('pending','rejected')
   order by f.created_at desc;
$$;

drop function if exists public.driver_contract_jobs();
create or replace function public.driver_contract_jobs()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'user_id' - 'driver_id' - 'budget_type' - 'budget_from' - 'budget_to' - 'budget_period'
         || jsonb_build_object('offer_id', f.id, 'item_type', f.item_type, 'price', f.offered_price,
              'total', public._ct_total(f.offered_price, o.id), 'commission', f.commission,
              'commission_total', f.commission_total, 'months_charged', f.months_charged,
              'accepted_at', f.accepted_at, 'ended_at', f.ended_at,
              'next_due', case when o.contract_unit = 'month' and f.ended_at is null and f.months_charged < o.unit_count
                               then (o.start_date + make_interval(months => f.months_charged))::date end,
              'active', f.ended_at is null and (o.end_date is null or o.end_date >= current_date),
              'customer_name', p.full_name, 'customer_phone', p.phone)
    from contract_offers f
    join contract_orders o on o.id = f.contract_order_id
    left join profiles p on p.id = o.user_id
   where f.driver_id = auth.uid() and f.status = 'accepted'
   order by f.accepted_at desc;
$$;
grant execute on function public.contract_settle_my_dues() to authenticated;
grant execute on function public.driver_contracts_feed(double precision, double precision, double precision) to authenticated;
grant execute on function public.driver_send_contract_offer(uuid, text, numeric, text) to authenticated;
grant execute on function public.driver_withdraw_contract_offer(uuid) to authenticated;
grant execute on function public.my_contract_orders() to authenticated;
grant execute on function public.customer_contract_offers(uuid) to authenticated;
grant execute on function public.accept_contract_offer(uuid) to authenticated;
grant execute on function public.reject_contract_offer(uuid) to authenticated;
grant execute on function public.cancel_contract_order(uuid) to authenticated;
grant execute on function public.end_contract_offer(uuid) to authenticated;
grant execute on function public.driver_my_contract_offers() to authenticated;
grant execute on function public.driver_contract_jobs() to authenticated;
-- ---------- 9) فحص ----------
select 'دوال العقود' as "الفحص", count(*)::text || ' من 17' as "النتيجة" from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('_ct_end_date','_ct_items_left','_ct_can_serve','_wallet_charge_at','_ct_total',
   'contract_settle_my_dues','driver_contracts_feed','driver_send_contract_offer','driver_withdraw_contract_offer',
   'my_contract_orders','customer_contract_offers','accept_contract_offer','reject_contract_offer','cancel_contract_order',
   'end_contract_offer','driver_my_contract_offers','driver_contract_jobs')
union all
select 'حساب تاريخ النهاية', case when exists (select 1 from pg_trigger where tgname = 'trg_ct_set_end') then 'مفعّل' else 'غير مفعّل' end
union all
select 'عرض جديد بعد السحب', case when exists (select 1 from pg_indexes where indexname = 'uq_contract_offer_active') then 'مسموح' else 'ممنوع' end
union all
select 'عمولة العقود', (select (rate*100)::int || '%' from public.service_commissions where service = 'contracts');
