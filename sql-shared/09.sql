-- الرحلة المشتركة (9 من 22): خصم فوري لمن ينضم بعد البدء
create or replace function public._shared_join_charge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and new.commission_at is null
     and exists (select 1 from taxi_shared_trips where id = new.trip_id and started_at is not null) then
    perform public._shared_charge(new.id);
  end if;
  return null;
end; $$;
drop trigger if exists trg_shared_join_charge on public.taxi_shared_requests;
create trigger trg_shared_join_charge after insert or update of status on public.taxi_shared_requests
  for each row execute function public._shared_join_charge();
