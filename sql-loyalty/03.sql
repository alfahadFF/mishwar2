-- الولاء (3 من 7): النقاط بعد التكسي والرحلة المشتركة والنقل
create or replace function public._loyalty_on_taxi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and coalesce(new.distance_km, 0) >= 1 then
    perform public._loyalty_earn(new.user_id, new.driver_id, 'taxi', new.id, coalesce(new.final_fare, new.estimated_fare));
  end if;
  return new;
end; $$;
drop trigger if exists trg_loyalty_taxi on public.taxi_orders;
create trigger trg_loyalty_taxi after update of status on public.taxi_orders
  for each row execute function public._loyalty_on_taxi();

create or replace function public._loyalty_on_shared()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    for r in select id, passenger_id, new.price_per_seat * seats_requested + coalesce(extra_fee, 0) fare
               from taxi_shared_requests where trip_id = new.id and status = 'confirmed' loop
      perform public._loyalty_earn(r.passenger_id, new.driver_id, 'taxi_shared', r.id, r.fare);
    end loop;
  end if;
  return new;
end; $$;
drop trigger if exists trg_loyalty_shared on public.taxi_shared_trips;
create trigger trg_loyalty_shared after update of status on public.taxi_shared_trips
  for each row execute function public._loyalty_on_shared();

create or replace function public._loyalty_on_cargo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public._loyalty_earn(new.customer_id, new.carrier_id, 'cargo', new.id, new.agreed_price);
  end if;
  return new;
end; $$;
drop trigger if exists trg_loyalty_cargo on public.cargo_orders;
create trigger trg_loyalty_cargo after update of status on public.cargo_orders
  for each row execute function public._loyalty_on_cargo();
