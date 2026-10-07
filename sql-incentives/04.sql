-- الحوافز (4 من 7): حساب مكافأة الأشهر الماضية وإضافتها للمحفظة
create or replace function public._incentive_pct(p_volume numeric)
returns int language sql immutable as $$
  select case when p_volume < 450 then 0 else least(30, floor((p_volume - 450) / 15)::int) end;
$$;

create or replace function public._incentive_settle(p_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m date; v_from timestamptz; v_to timestamptz; v_vol numeric; v_com numeric; v_avg numeric;
        v_level text; v_base int; v_bonus int; v_amt numeric; v_bal numeric;
        v_cur date := date_trunc('month', now() at time zone 'Asia/Damascus')::date;
begin
  if p_uid is null then return; end if;
  for m in
    select distinct date_trunc('month', created_at at time zone 'Asia/Damascus')::date mm
      from incentive_volume where provider_id = p_uid
     order by 1
  loop
    continue when m >= v_cur;
    continue when exists (select 1 from incentive_rewards where provider_id = p_uid and month = m);
    v_from := m::timestamp at time zone 'Asia/Damascus';
    v_to := (m + interval '1 month')::timestamp at time zone 'Asia/Damascus';
    select coalesce(sum(amount), 0) into v_vol from incentive_volume
     where provider_id = p_uid and created_at >= v_from and created_at < v_to;
    select coalesce(sum(-amount), 0) into v_com from wallet_transactions
     where user_id = p_uid and kind = 'commission' and created_at >= v_from and created_at < v_to;
    select round(avg(stars)::numeric, 1) into v_avg from provider_reviews
     where provider_id = p_uid and status = 'done' and stars is not null and rated_at >= v_from and rated_at < v_to;
    v_level := public._provider_level(p_uid);
    v_base := public._incentive_pct(v_vol);
    v_bonus := case when v_vol >= 450 then public._level_bonus(v_level) else 0 end;
    if v_avg is not null and v_avg < 4.0 then v_base := 0; v_bonus := 0; end if;
    v_amt := greatest(0, round(v_com * (v_base + v_bonus) / 100.0, 2));
    insert into incentive_rewards(provider_id, month, volume, commission, month_avg, level, base_pct, bonus_pct, amount)
    values (p_uid, m, v_vol, v_com, v_avg, v_level, v_base, v_bonus, v_amt)
    on conflict (provider_id, month) do nothing;
    continue when not found or v_amt <= 0;
    insert into wallets(user_id) values (p_uid) on conflict (user_id) do nothing;
    update wallets set balance = balance + v_amt, updated_at = now() where user_id = p_uid returning balance into v_bal;
    insert into wallet_transactions(user_id, kind, amount, balance_after, note)
    values (p_uid, 'reward', v_amt, v_bal, 'مكافأة شهر ' || extract(month from m) || '/' || extract(year from m));
    insert into user_notifications(user_id, kind, title, body, data)
    values (p_uid, 'reward', '🏆 مكافأة الشهر', 'أُضيف إلى محفظتك ' || v_amt || '$ (' || (v_base + v_bonus) || '% من عمولة الشهر)',
            jsonb_build_object('month', m));
  end loop;
end;
$$;
revoke execute on function public._incentive_settle(uuid) from public, anon, authenticated;

-- فتح التطبيق: الديون + التقييم + النقاط + الحوافز
create or replace function public.settle_all_my_dues()
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; b jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('months', 0, 'amount', 0);
  end if;
  a := public.contract_settle_my_dues();
  b := public.rental_settle_my_dues();
  perform public._rating_contract_tick();
  perform public._loyalty_contract_tick();
  perform public._incentive_contract_tick();
  perform public._incentive_settle(auth.uid());
  return jsonb_build_object(
    'months', coalesce((a->>'months')::int, 0) + coalesce((b->>'months')::int, 0),
    'amount', coalesce((a->>'amount')::numeric, 0) + coalesce((b->>'amount')::numeric, 0));
end;
$$;
revoke execute on function public.settle_all_my_dues() from public, anon;
grant execute on function public.settle_all_my_dues() to authenticated;
