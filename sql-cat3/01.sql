-- فئة السيارة حسب الاستهلاك (1 من 3): الحدود الجديدة وإلغاء اعتماد الفاخرة يدوياً
-- اقتصادية: كهرباء أو هايبرد أو أقل من 1400 • عادية: 1400 حتى 2000 • فاخرة: 2001 وفوق
insert into public.app_settings(key, value) values ('economy_max_cc', '1399') on conflict (key) do update set value = '1399';
insert into public.app_settings(key, value) values ('ordinary_max_cc', '2000') on conflict (key) do update set value = '2000';

create or replace function public._car_category(p_fuel text, p_cc int)
returns text language sql stable security definer set search_path = public as $$
  select case when p_fuel in ('electric', 'hybrid')
                or p_cc <= coalesce((select value::int from app_settings where key = 'economy_max_cc'), 1399) then 'economy'
              when p_cc <= coalesce((select value::int from app_settings where key = 'ordinary_max_cc'), 2000) then 'ordinary'
              else 'luxury' end;
$$;
revoke execute on function public._car_category(text, int) from public, anon, authenticated;

drop function if exists public.admin_set_luxury(uuid, boolean);

create or replace function public.my_work_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('type', type::text, 'full_name', full_name, 'phone', phone, 'kind', event_vehicle_type,
    'category', taxi_category, 'seats', vehicle_seats, 'cargo_class', vehicle_class, 'model', vehicle_model,
    'year', vehicle_year, 'color', vehicle_color, 'plate', vehicle_plate, 'owner', vehicle_owner, 'fuel', fuel,
    'engine_cc', engine_cc,
    'license_no', license_no, 'license_place', license_place, 'license_expiry', license_expiry,
    'driver_photo', avatar_url, 'vehicle_photo', vehicle_photo_url, 'license_photo', license_photo_path,
    'events', svc_events, 'wedding', svc_wedding, 'airport', svc_airport, 'contracts', svc_contracts, 'rental', svc_rental,
    'office_name', office_name, 'manager', office_manager, 'city', office_city, 'lat', office_lat, 'lng', office_lng,
    'cr_number', cr_number, 'cr_photo', cr_photo_path,
    'economy_max_cc', (select value::int from app_settings where key = 'economy_max_cc'),
    'ordinary_max_cc', (select value::int from app_settings where key = 'ordinary_max_cc'))
  from profiles where id = auth.uid();
$$;

-- إعادة حساب فئة السائقين الحاليين حسب القاعدة الجديدة
update public.profiles set taxi_category = public._car_category(fuel, engine_cc), luxury_requested = null
 where type::text = 'driver' and event_vehicle_type = 'car' and (engine_cc is not null or fuel = 'electric');
update public.taxi_driver_positions t set category = p.taxi_category
  from public.profiles p where p.id = t.driver_id and p.event_vehicle_type = 'car' and p.taxi_category is not null;
