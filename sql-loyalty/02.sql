-- الولاء (2 من 7): كسب النقاط (كل 1$ نقطة + نقطة لكل طلب) + مكافأة الدعوة
alter table public.wallet_transactions drop constraint if exists wallet_transactions_kind_check;
alter table public.wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('topup','card_topup','commission','adjustment','payment_out','payment_in','transfer_out','transfer_in','loyalty')) not valid;

create or replace function public._loyalty_add(p_user uuid, p_kind text, p_service text, p_ref uuid, p_provider uuid, p_amount numeric, p_points int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into loyalty_events(user_id, kind, service, ref_id, provider_id, amount, points)
  values (p_user, p_kind, p_service, p_ref, p_provider, p_amount, p_points)
  on conflict do nothing;
  if not found then return false; end if;
  insert into loyalty_accounts(user_id) values (p_user) on conflict (user_id) do nothing;
  update loyalty_accounts set points = points + p_points, level_points = level_points + p_points,
         lifetime_points = lifetime_points + p_points, updated_at = now() where user_id = p_user;
  return true;
end; $$;
revoke execute on function public._loyalty_add(uuid, text, text, uuid, uuid, numeric, int) from public, anon, authenticated;

create or replace function public._loyalty_earn(p_user uuid, p_provider uuid, p_service text, p_ref uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_pts int; a loyalty_accounts;
begin
  if p_user is null or p_user = p_provider or coalesce(p_amount, 0) <= 0 then return; end if;
  -- حماية: نفس الزبون ونفس مقدم الخدمة — طلبين باليوم فقط بيعطوا نقاط
  if p_provider is not null and (select count(*) from loyalty_events where user_id = p_user and provider_id = p_provider
        and kind = 'earn' and (created_at at time zone 'Asia/Damascus')::date = (now() at time zone 'Asia/Damascus')::date) >= 2 then
    return;
  end if;
  v_pts := floor(p_amount)::int + 1;
  if not public._loyalty_add(p_user, 'earn', p_service, p_ref, p_provider, p_amount, v_pts) then return; end if;
  insert into user_notifications(user_id, kind, title, body, data)
  values (p_user, 'loyalty', '🎁 +' || v_pts || ' نقطة', 'أُضيفت إلى نقاطك', jsonb_build_object('service', p_service));
  -- الدعوة: 10 نقاط للداعي بعد أول طلب مكتمل للمدعو
  select * into a from loyalty_accounts where user_id = p_user for update;
  if a.invited_by is not null and not a.invite_rewarded then
    update loyalty_accounts set invite_rewarded = true where user_id = p_user;
    if public._loyalty_add(a.invited_by, 'invite', 'invite', p_user, null, null, 10) then
      insert into user_notifications(user_id, kind, title, body, data)
      values (a.invited_by, 'loyalty', '🎁 +10 نقاط', 'أكمل صديقك الذي دعوته أول طلب له', '{}'::jsonb);
    end if;
  end if;
end; $$;
revoke execute on function public._loyalty_earn(uuid, uuid, text, uuid, numeric) from public, anon, authenticated;
