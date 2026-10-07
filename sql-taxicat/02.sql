-- توفّر التكسي (2 من 5): طلبات الفئة فقط + منع الفئة المختلفة + رحلة وحدة جارية
drop policy if exists "العميل يرى طلبه" on public.taxi_orders;
create policy "العميل يرى طلبه" on public.taxi_orders for select
  using (auth.uid() = user_id or auth.uid() = driver_id
         or (status = 'pending' and vehicle_category = public._taxi_category(auth.uid())
             and not public._taxi_suspended(auth.uid())));

create or replace function public._taxi_accept_match()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' and new.driver_id is not null
     and new.vehicle_category is distinct from public._taxi_category(new.driver_id) then
    raise exception 'VEHICLE_MISMATCH';
  end if;
  -- الطلب التالي: ممنوع «وصلت» أو «بدء» قبل إنهاء الرحلة الجارية
  if new.status in ('arrived','in_progress') and old.status is distinct from new.status
     and exists (select 1 from taxi_orders x where x.driver_id = new.driver_id and x.id <> new.id
                   and x.status in ('arrived','in_progress')) then
    raise exception 'FINISH_CURRENT_FIRST';
  end if;
  return new;
end; $$;
drop trigger if exists trg_taxi_accept_match on public.taxi_orders;
create trigger trg_taxi_accept_match before update on public.taxi_orders
  for each row execute function public._taxi_accept_match();
