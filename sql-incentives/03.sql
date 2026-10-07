-- الحوافز (3 من 7): تسجيل مبلغ كل طلب مكتمل لمقدم الخدمة (نفس حماية نقاط الزبون)
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

-- العقود: الشهري كل شهر يبدأ، اليومي والأسبوعي مرة وحدة عند الانتهاء
create or replace function public._incentive_contract_tick()
returns void language plpgsql security definer set search_path = public as $$
declare f record; v_stop timestamptz; v_m int; v_at timestamptz;
begin
  for f in
    select x.id, x.driver_id, x.ended_at, x.offered_price, o.id order_id, o.user_id, o.contract_unit, o.unit_count, o.start_date, o.end_date
      from contract_offers x join contract_orders o on o.id = x.contract_order_id
     where x.status = 'accepted' and o.start_date is not null and o.contract_unit is not null
       and x.driver_id is not null and o.start_date <= (now() at time zone 'Asia/Damascus')::date
  loop
    v_stop := least(now(), coalesce(f.ended_at, (f.end_date + 1)::timestamp at time zone 'Asia/Damascus'));
    if f.contract_unit = 'month' then
      for v_m in 0 .. f.unit_count - 1 loop
        v_at := (f.start_date::timestamp at time zone 'Asia/Damascus') + make_interval(months => v_m);
        exit when v_at >= v_stop;
        insert into incentive_volume(provider_id, customer_id, service, ref_id, period, amount, created_at)
        values (f.driver_id, f.user_id, 'contracts', f.id, v_m + 1, f.offered_price, greatest(v_at, now() - interval '1 minute'))
        on conflict do nothing;
      end loop;
    elsif coalesce(f.ended_at, (f.end_date + 1)::timestamp at time zone 'Asia/Damascus') <= now() then
      insert into incentive_volume(provider_id, customer_id, service, ref_id, period, amount)
      values (f.driver_id, f.user_id, 'contracts', f.id, 999, public._ct_total(f.offered_price, f.order_id))
      on conflict do nothing;
    end if;
  end loop;
end;
$$;
revoke execute on function public._incentive_contract_tick() from public, anon, authenticated;
