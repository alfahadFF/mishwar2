-- الحوافز (5 من 7): شاشة «حوافزي» لمقدم الخدمة
create or replace function public.my_incentives()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_cur date := date_trunc('month', now() at time zone 'Asia/Damascus')::date;
        v_from timestamptz; v_vol numeric; v_com numeric; v_avg numeric; v_base int; v_bonus int;
begin
  if auth.uid() is null then return null; end if;
  perform public._incentive_contract_tick();
  perform public._incentive_settle(auth.uid());
  r := public._provider_rating(auth.uid());
  v_from := v_cur::timestamp at time zone 'Asia/Damascus';
  select coalesce(sum(amount), 0) into v_vol from incentive_volume where provider_id = auth.uid() and created_at >= v_from;
  select coalesce(sum(-amount), 0) into v_com from wallet_transactions
   where user_id = auth.uid() and kind = 'commission' and created_at >= v_from;
  select round(avg(stars)::numeric, 1) into v_avg from provider_reviews
   where provider_id = auth.uid() and status = 'done' and stars is not null and rated_at >= v_from;
  v_base := public._incentive_pct(v_vol);
  v_bonus := case when v_vol >= 450 then public._level_bonus(r->>'level') else 0 end;
  return r || jsonb_build_object(
    'bonus', public._level_bonus(r->>'level'),
    'month_volume', v_vol, 'month_commission', v_com, 'month_avg', v_avg,
    'rating_ok', v_avg is null or v_avg >= 4.0,
    'base_pct', v_base, 'bonus_pct', v_bonus,
    'expected', case when v_avg is not null and v_avg < 4.0 then 0 else round(v_com * (v_base + v_bonus) / 100.0, 2) end,
    'days_left', (v_cur + interval '1 month')::date - (now() at time zone 'Asia/Damascus')::date,
    'history', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'volume', volume, 'commission', commission,
                  'avg', month_avg, 'level', level, 'pct', base_pct + bonus_pct, 'amount', amount) order by month desc)
                  from (select * from incentive_rewards where provider_id = auth.uid() order by month desc limit 12) h), '[]'::jsonb));
end;
$$;
grant execute on function public.my_incentives() to authenticated;
