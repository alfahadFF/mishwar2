-- شاشات الإدارة (2 من 6): الصفحة الرئيسية للإدارة والإشعارات والإعدادات
create or replace function public.admin_home()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return jsonb_build_object(
    'verify', (select count(*) from profiles where work_registered_at is not null and work_verified_at is null and deleted_at is null),
    'taxi_suspended', (select count(*) from profiles where taxi_suspended),
    'suspended', (select count(*) from profiles where suspended_at is not null),
    'unread', (select count(*) from admin_notifications where read_at is null));
end; $$;

create or replace function public.admin_notifications_list()
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query select to_jsonb(n) from admin_notifications n order by n.created_at desc limit 100;
end; $$;

create or replace function public.admin_notifications_read()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update admin_notifications set read_at = now() where read_at is null;
end; $$;

create or replace function public.admin_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return jsonb_build_object(
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from app_settings where key in
       ('free_days', 'wallet_pay_discount_pct', 'wallet_daily_transfer_limit', 'economy_max_cc', 'ordinary_max_cc')),
    'commissions', (select coalesce(jsonb_agg(jsonb_build_object('service', service, 'rate', rate) order by service), '[]'::jsonb)
       from service_commissions));
end; $$;

-- الإعداد الجديد يسري على الطلبات الجديدة فقط
create or replace function public.admin_save_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_eco int := (select value::int from app_settings where key = 'economy_max_cc');
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_value is null
     or (p_key = 'free_days' and (p_value < 0 or p_value > 365 or p_value <> trunc(p_value)))
     or (p_key = 'wallet_pay_discount_pct' and (p_value < 0 or p_value > 12))
     or (p_key = 'wallet_daily_transfer_limit' and (p_value < 0 or p_value > 100000))
     or (p_key = 'economy_max_cc' and (p_value < 500 or p_value > 8000 or p_value <> trunc(p_value)))
     or (p_key = 'ordinary_max_cc' and (p_value <= coalesce(v_eco, 0) or p_value > 8000 or p_value <> trunc(p_value)))
     or p_key not in ('free_days', 'wallet_pay_discount_pct', 'wallet_daily_transfer_limit', 'economy_max_cc', 'ordinary_max_cc')
  then raise exception 'BAD_SETTING'; end if;
  if p_key = 'economy_max_cc' and p_value >= coalesce((select value::int from app_settings where key = 'ordinary_max_cc'), 99999) then
    raise exception 'BAD_SETTING'; end if;
  insert into app_settings(key, value) values (p_key, p_value::text) on conflict (key) do update set value = excluded.value;
end; $$;

create or replace function public.admin_save_commission(p_service text, p_pct numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 50 then raise exception 'BAD_SETTING'; end if;
  update service_commissions set rate = round(p_pct / 100, 4) where service = p_service;
  if not found then raise exception 'BAD_SETTING'; end if;
end; $$;

revoke execute on function public.admin_home(), public.admin_notifications_list(), public.admin_notifications_read(),
  public.admin_settings(), public.admin_save_setting(text, numeric), public.admin_save_commission(text, numeric) from public, anon;
grant execute on function public.admin_home(), public.admin_notifications_list(), public.admin_notifications_read(),
  public.admin_settings(), public.admin_save_setting(text, numeric), public.admin_save_commission(text, numeric) to authenticated;
