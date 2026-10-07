-- الولاء (5 من 7): ربط العقود بفتح التطبيق + تحويل النقاط لرصيد
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
  return jsonb_build_object(
    'months', coalesce((a->>'months')::int, 0) + coalesce((b->>'months')::int, 0),
    'amount', coalesce((a->>'amount')::numeric, 0) + coalesce((b->>'amount')::numeric, 0));
end;
$$;
revoke execute on function public.settle_all_my_dues() from public, anon;
grant execute on function public.settle_all_my_dues() to authenticated;

-- 100 نقطة = 1$ • المستوى بيضل، وعدّاده بيرجع لأول المستوى
create or replace function public.redeem_points(p_points int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a loyalty_accounts; v_usd numeric; v_after numeric; v_level text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if coalesce(p_points, 0) < 100 then raise exception 'LOYALTY_MIN'; end if;
  select * into a from loyalty_accounts where user_id = auth.uid() for update;
  if a.user_id is null or a.points < p_points then raise exception 'LOYALTY_NOT_ENOUGH'; end if;
  v_usd := round(p_points / 100.0, 2);
  v_level := public._loyalty_level(a.level_points);
  update loyalty_accounts set points = points - p_points, level_points = public._loyalty_level_min(v_level), updated_at = now()
   where user_id = auth.uid();
  insert into loyalty_events(user_id, kind, amount, points) values (auth.uid(), 'redeem', v_usd, -p_points);
  insert into wallets(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update wallets set balance = balance + v_usd, updated_at = now() where user_id = auth.uid() returning balance into v_after;
  insert into wallet_transactions(user_id, kind, amount, balance_after, note)
  values (auth.uid(), 'loyalty', v_usd, v_after, 'تحويل ' || p_points || ' نقطة');
  return jsonb_build_object('usd', v_usd, 'balance', v_after, 'points', a.points - p_points);
end; $$;
grant execute on function public.redeem_points(int) to authenticated;
