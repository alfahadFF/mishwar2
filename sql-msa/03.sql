-- تعديل النصوص للفصحى (3 من 7): طلبات النقل والمناسبات والعقود
create or replace function public._push_on_cargo_new()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_users uuid[]; v_lat float8 := (new.pickup_points->0->>'lat')::float8; v_lng float8 := (new.pickup_points->0->>'lng')::float8;
begin
  if new.status <> 'open' or v_lat is null then return new; end if;
  select array_agg(p.user_id) into v_users
    from provider_push_prefs p join profiles pr on pr.id = p.user_id
   where p.loc_at > now() - interval '12 hours' and p.user_id <> new.customer_id
     and pr.vehicle_class is not null and public.cargo_vehicle_fits(new.vehicle_class, pr.vehicle_class)
     and public._push_km(v_lat, v_lng, p.lat, p.lng) <= 10
     and public._push_new_orders_ok(p.user_id);
  if v_users is not null then
    perform public._push_send(v_users, '🚚 طلب نقل جديد قريب منك', 'افتح التطبيق للاطلاع على التفاصيل وتقديم عرضك',
      jsonb_build_object('order_id', new.id), 'cargo_new');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_push_cargo_new on public.cargo_orders;
create trigger trg_push_cargo_new after insert on public.cargo_orders
  for each row execute function public._push_on_cargo_new();

create or replace function public._push_on_event_new()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_users uuid[];
begin
  if new.status <> 'pending' or new.gathering_lat is null then return new; end if;
  select array_agg(p.user_id) into v_users
    from provider_push_prefs p
   where p.loc_at > now() - interval '12 hours' and p.user_id <> new.user_id
     and public._push_km(new.gathering_lat, new.gathering_lng, p.lat, p.lng) <= 10
     and exists (select 1 from jsonb_array_elements(public._ev_items_left(new.id)) it
                  where (it->>'left')::int > 0 and public._ev_can_serve(it->>'type', p.user_id))
     and public._push_new_orders_ok(p.user_id);
  if v_users is not null then
    perform public._push_send(v_users, '🎉 طلب مناسبة جديد قريب منك', 'افتح التطبيق للاطلاع على التفاصيل وتقديم عرضك',
      jsonb_build_object('order_id', new.id), 'event_new');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_push_event_new on public.event_orders;
create trigger trg_push_event_new after insert on public.event_orders
  for each row execute function public._push_on_event_new();

create or replace function public._push_on_contract_new()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_users uuid[]; v_lat float8 := (new.pickup_points->0->>'lat')::float8; v_lng float8 := (new.pickup_points->0->>'lng')::float8;
begin
  if new.status <> 'pending' or new.contract_unit is null or v_lat is null then return new; end if;
  select array_agg(p.user_id) into v_users
    from provider_push_prefs p
   where p.loc_at > now() - interval '12 hours' and p.user_id <> new.user_id
     and public._push_km(v_lat, v_lng, p.lat, p.lng) <= 10
     and exists (select 1 from jsonb_array_elements(public._ct_items_left(new.id)) it
                  where (it->>'left')::int > 0 and public._ct_can_serve(it->>'type', p.user_id))
     and public._push_new_orders_ok(p.user_id);
  if v_users is not null then
    perform public._push_send(v_users, '📋 طلب عقد جديد قريب منك', 'افتح التطبيق للاطلاع على التفاصيل وتقديم عرضك',
      jsonb_build_object('order_id', new.id), 'contract_new');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_push_contract_new on public.contract_orders;
create trigger trg_push_contract_new after insert on public.contract_orders
  for each row execute function public._push_on_contract_new();
