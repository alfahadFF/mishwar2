-- التقييم (2 من 7): طلب التقييم بعد التكسي والرحلة المشتركة
create or replace function public._rating_on_taxi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public._rating_add(new.user_id, new.driver_id, 'taxi', new.id, 0, now());
  end if;
  return new;
end; $$;
drop trigger if exists trg_rating_taxi on public.taxi_orders;
create trigger trg_rating_taxi after update of status on public.taxi_orders
  for each row execute function public._rating_on_taxi();

create or replace function public._rating_on_shared()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    for r in select id, passenger_id from taxi_shared_requests where trip_id = new.id and status = 'confirmed' loop
      perform public._rating_add(r.passenger_id, new.driver_id, 'taxi_shared', r.id, 0, now());
    end loop;
  end if;
  return new;
end; $$;
drop trigger if exists trg_rating_shared on public.taxi_shared_trips;
create trigger trg_rating_shared after update of status on public.taxi_shared_trips
  for each row execute function public._rating_on_shared();
