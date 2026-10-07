-- شاشات الإدارة (4 من 6): البحث عن مستخدم وإيقاف حسابه
create or replace function public.admin_user(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid; p profiles; n int := 0;
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  v := public._wallet_lookup(p_query);
  if v is null then raise exception 'USER_NOT_FOUND'; end if;
  select * into p from profiles where id = v;
  n := (select count(*) from taxi_orders where (user_id = v or driver_id = v) and status::text = 'completed')
     + (select count(*) from cargo_orders where (customer_id = v or carrier_id = v) and status::text = 'completed')
     + (select count(*) from event_orders where user_id = v)
     + (select count(*) from event_offers where driver_id = v and status::text = 'accepted')
     + (select count(*) from contract_orders where user_id = v)
     + (select count(*) from contract_offers where driver_id = v and status::text = 'accepted')
     + (select count(*) from airport_orders where (user_id = v or driver_id = v) and status = 'completed');
  return jsonb_build_object('id', p.id, 'type', p.type::text, 'full_name', p.full_name, 'phone', p.phone,
    'wallet_id', p.wallet_id, 'office_name', p.office_name,
    'balance', coalesce((select balance from wallets where user_id = v), 0),
    'orders', n, 'rating', case when p.work_registered_at is not null then public._provider_rating(v) end,
    'work', p.work_registered_at is not null, 'verified', p.work_verified_at is not null,
    'registered_at', (select created_at from auth.users where id = v),
    'suspended', p.suspended_at is not null, 'suspended_at', p.suspended_at, 'suspend_reason', p.suspend_reason,
    'taxi_suspended', coalesce(p.taxi_suspended, false), 'deleted', p.deleted_at is not null,
    'is_admin', p.is_admin or p.account_type::text = 'admin' or p.type::text = 'admin');
end; $$;

-- الموقوف يفتح التطبيق ويرى رصيده وطلباته، لكنه لا يطلب ولا يستقبل طلبات
create or replace function public.admin_suspend_user(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(btrim(p_reason), '');
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  if p_user = auth.uid() or exists (select 1 from profiles where id = p_user
       and (is_admin or account_type::text = 'admin' or type::text = 'admin')) then raise exception 'NOT_ALLOWED'; end if;
  update profiles set suspended_at = now(), suspend_reason = v_reason where id = p_user and suspended_at is null;
  if not found then raise exception 'ALREADY_SUSPENDED'; end if;
  insert into user_notifications(user_id, kind, title, body, data)
  values (p_user, 'account', '⛔ تم إيقاف حسابك', 'السبب: ' || v_reason || '. تواصل مع الدعم.', '{}'::jsonb);
end; $$;

create or replace function public.admin_unsuspend_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update profiles set suspended_at = null, suspend_reason = null where id = p_user and suspended_at is not null;
  if not found then raise exception 'NOT_SUSPENDED'; end if;
  insert into user_notifications(user_id, kind, title, body, data)
  values (p_user, 'account', '✅ تم إلغاء إيقاف حسابك', 'يمكنك استخدام جميع الخدمات من جديد.', '{}'::jsonb);
end; $$;

-- حالة الحساب للمستخدم نفسه (رسالة الإيقاف وسبب رفض التحقق)
create or replace function public.my_admin_flags()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('suspended', suspended_at is not null, 'suspend_reason', suspend_reason,
                            'reject_reason', work_reject_reason, 'is_admin', is_admin or account_type::text = 'admin' or type::text = 'admin')
    from profiles where id = auth.uid();
$$;

revoke execute on function public.admin_user(text), public.admin_suspend_user(uuid, text), public.admin_unsuspend_user(uuid),
  public.my_admin_flags() from public, anon;
grant execute on function public.admin_user(text), public.admin_suspend_user(uuid, text), public.admin_unsuspend_user(uuid),
  public.my_admin_flags() to authenticated;
