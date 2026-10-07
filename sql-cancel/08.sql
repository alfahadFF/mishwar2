-- إلغاءات السائق (8 من 16): حماية الرحلة المشتركة
create or replace function public._shared_trip_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if public._taxi_suspended(new.driver_id) then raise exception 'TAXI_SUSPENDED'; end if;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' and coalesce(current_setting('app.shared_cancel', true), '') <> '1' then
    raise exception 'USE_CANCEL_BUTTON';
  end if;
  return new;
end; $$;
drop trigger if exists trg_shared_trip_guard on public.taxi_shared_trips;
create trigger trg_shared_trip_guard before insert or update on public.taxi_shared_trips
  for each row execute function public._shared_trip_guard();
