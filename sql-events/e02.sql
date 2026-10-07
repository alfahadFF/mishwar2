-- ---------- 2) حماية بيانات المركبة: لا يغيّرها السائق بنفسه ----------
create or replace function public._protect_vehicle_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from profiles where id = auth.uid() and (account_type = 'admin' or type = 'admin'))
     and (new.vehicle_class is distinct from old.vehicle_class
       or new.event_vehicle_type is distinct from old.event_vehicle_type
       or new.vehicle_seats is distinct from old.vehicle_seats
       or new.svc_events is distinct from old.svc_events
       or new.svc_wedding is distinct from old.svc_wedding) then
    raise exception 'VEHICLE_FIELDS_LOCKED';
  end if;
  return new;
end; $$;
drop trigger if exists trg_protect_vehicle_fields on public.profiles;
create trigger trg_protect_vehicle_fields before update on public.profiles
  for each row execute function public._protect_vehicle_fields();
