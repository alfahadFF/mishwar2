-- الرحلة المشتركة (7 من 22): حماية الرحلة المشتركة (تحديث)
create or replace function public._shared_trip_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rpc boolean := coalesce(current_setting('app.shared_rpc', true), '') = '1'
                      or coalesce(current_setting('app.shared_cancel', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    new.started_at := null; new.completed_at := null;
    perform public._shared_publish_check(new);
  elsif not v_rpc and (new.status in ('cancelled','completed') and new.status <> old.status
        or new.started_at is distinct from old.started_at or new.completed_at is distinct from old.completed_at) then
    raise exception 'USE_CANCEL_BUTTON';
  end if;
  return new;
end; $$;
drop trigger if exists trg_shared_trip_guard on public.taxi_shared_trips;
create trigger trg_shared_trip_guard before insert or update on public.taxi_shared_trips
  for each row execute function public._shared_trip_guard();
