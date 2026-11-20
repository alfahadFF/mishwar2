-- إصلاح طلبات التكسي (40): قصر طلبات السائق على فئته، ودعم قبول طلب تالٍ بأمان.
-- التشغيل: بعد taxi-migration.sql، sql-taxicat/01-04.sql، sql-cancel/03.sql و09.sql، ثم sql-pay/01-39.sql.
drop policy if exists "العميل يرى طلبه" on public.taxi_orders;
create policy "العميل يرى طلبه" on public.taxi_orders for select
  using (auth.uid() = user_id or auth.uid() = driver_id
         or (status = 'pending'
             and vehicle_category = public._taxi_category(auth.uid())
             and not public._taxi_suspended(auth.uid())));

create or replace function public.driver_accept_taxi(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.taxi_orders%rowtype;
  v_driver uuid := auth.uid();
  v_phone text;
  v_active_count integer;
  v_category text;
begin
  if v_driver is null then raise exception 'NOT_AUTH'; end if;

  -- تسلسل عمليات القبول للسائق يمنع قبول أكثر من طلب تالٍ عند النقر المتكرر.
  perform 1 from public.profiles where id = v_driver for update;
  if not found then raise exception 'NOT_AUTH'; end if;

  if public._taxi_suspended(v_driver) then
    perform public._taxi_cancel_undo(v_driver, p_order);
  end if;
  if public._taxi_suspended(v_driver) then raise exception 'TAXI_SUSPENDED'; end if;
  if public.wallet_blocked(v_driver) then raise exception 'WALLET_BLOCKED'; end if;

  v_category := public._taxi_category(v_driver);
  select * into o from public.taxi_orders where id = p_order for update;
  if not found or o.status not in ('pending','searching') or o.driver_id is not null
     or o.user_id = v_driver then
    raise exception 'ORDER_NOT_AVAILABLE';
  end if;
  if v_category is null or o.vehicle_category is distinct from v_category then
    raise exception 'VEHICLE_MISMATCH';
  end if;

  select count(*) into v_active_count
    from public.taxi_orders
   where driver_id = v_driver and status in ('accepted','arrived','in_progress');
  if v_active_count >= 2 then raise exception 'HAS_ACTIVE_TRIP'; end if;

  update public.taxi_orders
     set status = 'accepted', driver_id = v_driver, accepted_at = now()
   where id = o.id and status in ('pending','searching') and driver_id is null
   returning * into o;
  if o.id is null then raise exception 'ORDER_NOT_AVAILABLE'; end if;

  perform public._taxi_cancel_undo(v_driver, o.id);
  select phone into v_phone from public.profiles where id = o.user_id;
  insert into public.user_notifications(user_id, kind, title, body, data)
  values (o.user_id, 'taxi_accepted', 'تم قبول طلبك', 'السائق في الطريق إليك',
          jsonb_build_object('order_id', o.id));

  return jsonb_build_object('id', o.id, 'fare', o.estimated_fare,
                            'customer_phone', v_phone, 'is_next', v_active_count = 1);
end;
$$;
grant execute on function public.driver_accept_taxi(uuid) to authenticated;

-- التحقق: القيمتان التاليتان يجب أن تكونا true بعد التشغيل.
select 'حارس فئة المركبة في القبول والسياسة' as check_item,
       pg_get_functiondef('public.driver_accept_taxi(uuid)'::regprocedure) ilike '%VEHICLE_MISMATCH%' as accept_checks_category,
       coalesce((select position('taxi_category' in coalesce(qual,'')) > 0
                   from pg_policies
                  where schemaname='public' and tablename='taxi_orders' and policyname='العميل يرى طلبه'), false) as select_policy_checks_category;
