-- تعديل النصوص للفصحى (1 من 7): إلغاء السائق + نقاط الولاء
drop function if exists public.driver_cancel_taxi(uuid, text, text);
create or replace function public.driver_cancel_taxi(p_order uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o taxi_orders; r jsonb;
begin
  select * into o from taxi_orders where id = p_order for update;
  if o.id is null or o.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status not in ('accepted','arrived') then raise exception 'BAD_STEP'; end if;
  r := public._register_cancel(auth.uid(), 'taxi', o.id, p_reason, p_note);
  update taxi_orders set status = 'pending', driver_id = null, accepted_at = null, arrived_at = null where id = o.id;
  insert into user_notifications(user_id, kind, title, body, data)
  values (o.user_id, 'taxi_driver_cancelled', 'ألغى السائق الرحلة', 'نبحث لك عن سائق آخر', jsonb_build_object('order_id', o.id));
  return r;
end; $$;
grant execute on function public.driver_cancel_taxi(uuid, text, text) to authenticated;

create or replace function public._loyalty_earn(p_user uuid, p_provider uuid, p_service text, p_ref uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_pts int; a loyalty_accounts;
begin
  if p_user is null or p_user = p_provider or coalesce(p_amount, 0) <= 0 then return; end if;
  if p_provider is not null and (select count(*) from loyalty_events where user_id = p_user and provider_id = p_provider
        and kind = 'earn' and (created_at at time zone 'Asia/Damascus')::date = (now() at time zone 'Asia/Damascus')::date) >= 2 then
    return;
  end if;
  -- مبلغ الطلب لعدّاد مقدم الخدمة (العقود لها عدّاد خاص كل فترة)
  if p_provider is not null and p_service <> 'contracts' then
    insert into incentive_volume(provider_id, customer_id, service, ref_id, amount)
    values (p_provider, p_user, p_service, p_ref, p_amount) on conflict do nothing;
  end if;
  v_pts := floor(p_amount)::int + 1;
  if not public._loyalty_add(p_user, 'earn', p_service, p_ref, p_provider, p_amount, v_pts) then return; end if;
  insert into user_notifications(user_id, kind, title, body, data)
  values (p_user, 'loyalty', '🎁 +' || v_pts || ' نقطة', 'أُضيفت إلى نقاطك', jsonb_build_object('service', p_service));
  select * into a from loyalty_accounts where user_id = p_user for update;
  if a.invited_by is not null and not a.invite_rewarded then
    update loyalty_accounts set invite_rewarded = true where user_id = p_user;
    if public._loyalty_add(a.invited_by, 'invite', 'invite', p_user, null, null, 10) then
      insert into user_notifications(user_id, kind, title, body, data)
      values (a.invited_by, 'loyalty', '🎁 +10 نقاط', 'أكمل صديقك الذي دعوته أول طلب له', '{}'::jsonb);
    end if;
  end if;
end;
$$;
revoke execute on function public._loyalty_earn(uuid, uuid, text, uuid, numeric) from public, anon, authenticated;
