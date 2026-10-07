-- الإشعارات (3 من 7): طلب تكسي جديد + طلب إيجار عام
create or replace function public._push_on_taxi_new()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_users uuid[];
begin
  if new.status <> 'pending' or new.driver_id is not null then return new; end if;
  select array_agg(d.driver_id) into v_users
    from taxi_driver_positions d
   where d.updated_at > now() - interval '30 minutes'
     and d.category = new.vehicle_category
     and d.driver_id <> new.user_id
     and public._push_km(new.pickup_lat, new.pickup_lng, d.lat, d.lng) <= coalesce(new.search_radius_km, 5)
     and public._push_new_orders_ok(d.driver_id)
     and not public._taxi_suspended(d.driver_id);
  if v_users is not null then
    perform public._push_send(v_users, '🚕 طلب تكسي جديد',
      '📏 ' || coalesce(round(new.distance_km::numeric, 1)::text, '?') || ' كم • $' || coalesce(new.estimated_fare::text, '?'),
      jsonb_build_object('order_id', new.id), 'taxi_new');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_push_taxi_new on public.taxi_orders;
create trigger trg_push_taxi_new after insert on public.taxi_orders
  for each row execute function public._push_on_taxi_new();

create or replace function public._push_on_rental_general()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_users uuid[];
begin
  if new.status <> 'open' then return new; end if;
  select array_agg(distinct l.provider_id) into v_users
    from rental_listings l
   where l.status = 'active' and new.unit = any(l.units) and l.provider_id <> new.customer_id
     and public._rental_km(new.lat, new.lng, l.lat, l.lng) <= 50
     and public._push_new_orders_ok(l.provider_id);
  if v_users is not null then
    perform public._push_send(v_users, '🔑 طلب إيجار جديد قريب منك', 'زبون يبحث عن سيارة — تحقق إن كانت لديك سيارة مناسبة',
      jsonb_build_object('general_id', new.id), 'rental_general_new');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_push_rental_general on public.rental_general;
create trigger trg_push_rental_general after insert on public.rental_general
  for each row execute function public._push_on_rental_general();
