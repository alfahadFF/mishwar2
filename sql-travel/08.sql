-- السفريات (8 من 8): عمولة 10% على السائق فقط بعد تأكيد الحجز.
-- يستخدم الخصم آلية المحفظة الحالية، بما فيها الإعفاء المجاني.
insert into public.service_commissions(service, rate)
values ('travel', 0.10)
on conflict (service) do update set rate = excluded.rate;

create or replace function public._travel_apply_booking_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_provider_type text;
begin
  if new.status <> 'confirmed' then return new; end if;
  select type::text into v_provider_type from public.profiles where id = new.provider_id;
  if v_provider_type is distinct from 'driver' then return new; end if;
  new.commission_amount := public._wallet_charge(new.provider_id, 'travel', new.id, new.total);
  return new;
end; $$;

revoke all on function public._travel_apply_booking_commission() from public, anon, authenticated;
drop trigger if exists trg_travel_booking_commission on public.travel_bookings;
create trigger trg_travel_booking_commission
before insert on public.travel_bookings
for each row execute function public._travel_apply_booking_commission();
