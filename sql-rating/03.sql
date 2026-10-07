-- التقييم (3 من 7): طلب التقييم بعد النقل والمناسبات والتأجير
create or replace function public._rating_on_cargo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public._rating_add(new.customer_id, new.carrier_id, 'cargo', new.id, 0, now());
  end if;
  return new;
end; $$;
drop trigger if exists trg_rating_cargo on public.cargo_orders;
create trigger trg_rating_cargo after update of status on public.cargo_orders
  for each row execute function public._rating_on_cargo();

create or replace function public._rating_on_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.completed_at is not null and old.completed_at is null then
    perform public._rating_add((select user_id from event_orders where id = new.event_order_id), new.driver_id, 'events', new.id, 0, now());
  end if;
  return new;
end; $$;
drop trigger if exists trg_rating_event on public.event_offers;
create trigger trg_rating_event after update of completed_at on public.event_offers
  for each row execute function public._rating_on_event();

create or replace function public._rating_on_rental()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ended_at is not null and old.ended_at is null and new.status = 'accepted' then
    perform public._rating_add(new.customer_id, new.provider_id, 'rental', new.id, 0, now());
  end if;
  return new;
end; $$;
drop trigger if exists trg_rating_rental on public.rental_requests;
create trigger trg_rating_rental after update of ended_at on public.rental_requests
  for each row execute function public._rating_on_rental();
