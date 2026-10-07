-- تعديل طلب النقل (2 من 3): الدوال
-- قبل القبول: يعدّل الزبون تفاصيل الطلب بحرية
-- بعد القبول: الموعد والملاحظات فقط، ويظهر التعديل للناقل
drop function if exists public.edit_cargo_order(uuid, jsonb);
create or replace function public.edit_cargo_order(p_order uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o cargo_orders; n cargo_orders;
  v_allowed text[]; v_cols text; v_changed text[];
  v_time text[] := array['timing_type','scheduled_date','scheduled_time','is_urgent','notes'];
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  select * into o from cargo_orders where id = p_order for update;
  if o.id is null or o.customer_id <> auth.uid() then raise exception 'NOT_ALLOWED'; end if;

  if o.status = 'open' then
    v_allowed := v_time || array['cargo_type','weight','weight_kg','vehicle_class','pickup_points','dropoff_points',
      'delivery_points','route_info','budget_type','budget_from','budget_to','client_budget_usd','need_workers',
      'workers_count','need_equipment','equipment_detail','lift_up','floor_to','elevator_to','lift_down',
      'floor_from','elevator_from','floor_note'];
  elsif o.status = 'accepted' then
    v_allowed := v_time;
  else
    raise exception 'ORDER_CLOSED';
  end if;

  if exists (select 1 from jsonb_object_keys(coalesce(p_changes, '{}'::jsonb)) k where k <> all (v_allowed)) then
    raise exception 'FIELD_LOCKED';
  end if;

  select string_agg(quote_ident(c.column_name), ',') into v_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'cargo_orders'
     and c.column_name = any (v_allowed) and p_changes ? c.column_name;
  if v_cols is null then raise exception 'NO_CHANGES'; end if;

  execute format('update cargo_orders set (%1$s) = (select %1$s from jsonb_populate_record(null::cargo_orders, $1)) where id = $2', v_cols)
    using p_changes, p_order;

  select * into n from cargo_orders where id = p_order;
  if n.timing_type = 'scheduled' and n.scheduled_date is null then raise exception 'BAD_TIME'; end if;

  select array_agg(k order by k) into v_changed
    from unnest(v_allowed) k
   where (to_jsonb(o) -> k) is distinct from (to_jsonb(n) -> k);

  if v_changed is null then return jsonb_build_object('changed', '[]'::jsonb, 'status', n.status); end if;

  if n.status = 'accepted' then
    update cargo_orders set edited_at = now(), edited_fields = v_changed, updated_at = now() where id = p_order;
  else
    update cargo_orders set updated_at = now() where id = p_order;
    -- تغيّرت المركبة: تُرفض العروض المعلّقة من مركبات لم تعد مناسبة
    if 'vehicle_class' = any (v_changed) then
      update cargo_offers f set status = 'rejected', updated_at = now()
        from profiles p
       where f.cargo_order_id = p_order and f.status = 'pending' and p.id = f.driver_id
         and not public.cargo_vehicle_fits(n.vehicle_class, p.vehicle_class);
    end if;
  end if;
  return jsonb_build_object('changed', to_jsonb(v_changed), 'status', n.status);
end; $$;

-- إلغاء الطلب قبل القبول فقط
drop function if exists public.cancel_cargo_order(uuid);
create or replace function public.cancel_cargo_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o cargo_orders;
begin
  select * into o from cargo_orders where id = p_order for update;
  if o.id is null or o.customer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if o.status = 'accepted' then raise exception 'HAS_ACCEPTED'; end if;
  if o.status <> 'open' then raise exception 'ORDER_CLOSED'; end if;
  update cargo_orders set status = 'cancelled', updated_at = now() where id = p_order;
  update cargo_offers set status = 'rejected', updated_at = now() where cargo_order_id = p_order and status = 'pending';
end; $$;

grant execute on function public.edit_cargo_order(uuid, jsonb) to authenticated;
grant execute on function public.cancel_cargo_order(uuid) to authenticated;
