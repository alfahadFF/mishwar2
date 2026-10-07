-- الولاء (4 من 7): النقاط بعد المناسبات والتأجير والعقود
create or replace function public._loyalty_on_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.completed_at is not null and old.completed_at is null then
    perform public._loyalty_earn((select user_id from event_orders where id = new.event_order_id), new.driver_id, 'events', new.id, new.offered_price);
  end if;
  return new;
end; $$;
drop trigger if exists trg_loyalty_event on public.event_offers;
create trigger trg_loyalty_event after update of completed_at on public.event_offers
  for each row execute function public._loyalty_on_event();

create or replace function public._loyalty_on_rental()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ended_at is not null and old.ended_at is null and new.status = 'accepted' then
    perform public._loyalty_earn(new.customer_id, new.provider_id, 'rental', new.id,
      case when new.unit = 'month' then new.unit_price * greatest(new.months_charged, 1) else new.total end);
  end if;
  return new;
end; $$;
drop trigger if exists trg_loyalty_rental on public.rental_requests;
create trigger trg_loyalty_rental after update of ended_at on public.rental_requests
  for each row execute function public._loyalty_on_rental();

-- العقود: عند انتهاء العقد، بقيمة الفترات اللي صارت فعلاً
create or replace function public._loyalty_contract_tick()
returns void language plpgsql security definer set search_path = public as $$
declare f record; v_stop timestamptz; v_amt numeric; v_m int;
begin
  for f in
    select x.id, x.driver_id, x.ended_at, x.offered_price, o.id order_id, o.user_id, o.contract_unit, o.unit_count, o.start_date, o.end_date
    from contract_offers x join contract_orders o on o.id = x.contract_order_id
    where x.status = 'accepted' and o.start_date is not null and o.contract_unit is not null
      and coalesce(x.ended_at, (o.end_date + 1)::timestamp at time zone 'Asia/Damascus') <= now()
      and not exists (select 1 from loyalty_events e where e.kind = 'earn' and e.service = 'contracts' and e.ref_id = x.id)
  loop
    v_stop := coalesce(f.ended_at, (f.end_date + 1)::timestamp at time zone 'Asia/Damascus');
    if f.contract_unit = 'month' then
      v_m := 0;
      while v_m < f.unit_count and (f.start_date::timestamp at time zone 'Asia/Damascus') + make_interval(months => v_m) < v_stop loop
        v_m := v_m + 1;
      end loop;
      v_amt := f.offered_price * v_m;
    else
      v_amt := public._ct_total(f.offered_price, f.order_id);
    end if;
    perform public._loyalty_earn(f.user_id, f.driver_id, 'contracts', f.id, v_amt);
  end loop;
end; $$;
revoke execute on function public._loyalty_contract_tick() from public, anon, authenticated;
