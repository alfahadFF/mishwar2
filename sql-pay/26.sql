-- الدفع وإنهاء التكسي (26 من 39): السائق: إنهاء الرحلة (العمولة 12%)
create or replace function public.driver_taxi_complete(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o taxi_orders; v_fare numeric; v_pct numeric := public._wallet_discount_pct(); v_fee numeric;
begin
  select * into o from taxi_orders where id = p_order for update;
  if o.id is null or o.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status not in ('arrived','in_progress') then raise exception 'BAD_STEP'; end if;
  v_fare := o.estimated_fare;  -- حسب المسافة، والانتظار يُضاف لاحقاً
  update taxi_orders set status = 'completed', completed_at = now(), final_fare = v_fare,
         started_at = coalesce(started_at, now()) where id = o.id;
  v_fee := public._wallet_charge(auth.uid(), 'taxi', o.id, v_fare);
  insert into user_notifications(user_id, kind, title, body, data)
  values (o.user_id, 'taxi_completed', 'انتهت الرحلة', 'الأجرة ' || public._amt(v_fare)
    || case when v_pct > 0 then ' • من التطبيق ' || public._amt(v_fare - round(v_fare * v_pct / 100, 2)) end,
    jsonb_build_object('order_id', o.id, 'service', 'taxi'));
  return jsonb_build_object('status', 'completed', 'fare', v_fare, 'commission', v_fee);
end; $$;
grant execute on function public.driver_taxi_complete(uuid) to authenticated;
