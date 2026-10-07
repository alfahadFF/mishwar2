-- الولاء (6 من 7): رمز الدعوة (من نموذج التسجيل) + شاشة نقاطي
-- رمز الدعوة = رقم حساب الداعي • مرة وحدة • للحساب الجديد قبل أول طلب مكتمل
create or replace function public.apply_invite_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  select id into v_inviter from profiles where wallet_id = regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  if v_inviter is null then raise exception 'INVITE_BAD_CODE'; end if;
  if v_inviter = auth.uid() then raise exception 'INVITE_SELF'; end if;
  if exists (select 1 from loyalty_events where user_id = auth.uid() and kind = 'earn') then raise exception 'INVITE_TOO_LATE'; end if;
  insert into loyalty_accounts(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update loyalty_accounts set invited_by = v_inviter, updated_at = now() where user_id = auth.uid() and invited_by is null;
  if not found then raise exception 'INVITE_USED'; end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.apply_invite_code(text) to authenticated;

create or replace function public.my_loyalty()
returns jsonb language plpgsql security definer set search_path = public as $$
declare a loyalty_accounts; v_level text;
begin
  if auth.uid() is null then return null; end if;
  perform public._loyalty_contract_tick();
  select * into a from loyalty_accounts where user_id = auth.uid();
  v_level := public._loyalty_level(coalesce(a.level_points, 0));
  return jsonb_build_object(
    'points', coalesce(a.points, 0), 'level_points', coalesce(a.level_points, 0), 'lifetime', coalesce(a.lifetime_points, 0),
    'level', v_level,
    'next_at', case v_level when 'bronze' then 101 when 'silver' then 201 when 'gold' then 401 end,
    'invite_code', (select wallet_id from profiles where id = auth.uid()),
    'invited', (select count(*) from loyalty_accounts where invited_by = auth.uid()),
    'history', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'service', service, 'amount', amount,
                          'points', points, 'at', created_at) order by created_at desc)
                         from (select * from loyalty_events where user_id = auth.uid() order by created_at desc limit 30) h), '[]'::jsonb));
end; $$;
grant execute on function public.my_loyalty() to authenticated;
