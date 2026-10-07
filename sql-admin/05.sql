-- شاشات الإدارة (5 من 6): منع الحساب الموقوف من الطلب ومن استقبال الطلبات
-- مقدّم الخدمة: كل لوحات الطلبات تمر عبر wallet_blocked ← _work_block_reason
create or replace function public._work_block_reason(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.suspended_at is not null then 'suspended'
    when p.work_registered_at is null then null
    when p.work_verified_at is null and p.work_registered_at < now() - interval '30 days' then 'verify'
    when p.license_expiry is not null and p.license_expiry + interval '3 months' < current_date then 'license'
  end
  from profiles p where p.id = p_user;
$$;
revoke execute on function public._work_block_reason(uuid) from public, anon, authenticated;

-- الزبون والمقدّم: أي طلب أو عرض جديد من حساب موقوف يُرفض
create or replace function public._block_suspended()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_col text := tg_argv[0]; v uuid;
begin
  v := nullif(to_jsonb(new)->>v_col, '')::uuid;
  if v is null then return new; end if;
  if tg_op = 'UPDATE' and (to_jsonb(old)->>v_col) is not distinct from (to_jsonb(new)->>v_col) then return new; end if;
  if exists (select 1 from profiles where id = v and suspended_at is not null) then raise exception 'ACCOUNT_SUSPENDED'; end if;
  return new;
end; $$;
revoke execute on function public._block_suspended() from public, anon, authenticated;

do $$
declare t text; c text; r record;
begin
  for r in select * from (values
      ('taxi_orders', 'user_id'), ('taxi_orders', 'driver_id'), ('taxi_shared_requests', 'passenger_id'),
      ('taxi_shared_trips', 'driver_id'), ('cargo_orders', 'customer_id'), ('cargo_offers', 'driver_id'),
      ('event_orders', 'user_id'), ('event_offers', 'driver_id'), ('contract_orders', 'user_id'),
      ('contract_offers', 'driver_id'), ('airport_orders', 'user_id'), ('airport_offers', 'driver_id'),
      ('rental_requests', 'customer_id'), ('rental_general', 'customer_id'), ('rental_general_offers', 'provider_id')) x(t, c)
  loop
    continue when not exists (select 1 from information_schema.columns
                               where table_schema = 'public' and table_name = r.t and column_name = r.c);
    execute format('drop trigger if exists %I on public.%I', 'trg_block_susp_' || r.c, r.t);
    execute format('create trigger %I before insert or update of %I on public.%I for each row execute function public._block_suspended(%L)',
                   'trg_block_susp_' || r.c, r.c, r.t, r.c);
  end loop;
end $$;
