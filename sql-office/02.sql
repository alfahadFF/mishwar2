-- مكتب التأجير (2 من 3): إكمال التسجيل، وبيانات النموذج، وخيار التأجير للسائق
create or replace function public.set_work_intent(p_role text)
returns void language sql security definer set search_path = public as $$
  update profiles set work_role = case when p_role in ('driver', 'carrier', 'office') then p_role end
   where id = auth.uid() and type::text = 'personal';
$$;

-- «تؤجر المركبة بدون سائق؟» في نموذج السائق
create or replace function public.set_rental_service(p_on boolean)
returns void language sql security definer set search_path = public as $$
  update profiles set svc_rental = coalesce(p_on, false) where id = auth.uid() and type::text = 'driver';
$$;

create or replace function public.my_work_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('type', type::text, 'full_name', full_name, 'phone', phone, 'kind', event_vehicle_type,
    'category', taxi_category, 'seats', vehicle_seats, 'cargo_class', vehicle_class, 'model', vehicle_model,
    'year', vehicle_year, 'color', vehicle_color, 'plate', vehicle_plate, 'owner', vehicle_owner, 'fuel', fuel,
    'license_no', license_no, 'license_place', license_place, 'license_expiry', license_expiry,
    'driver_photo', avatar_url, 'vehicle_photo', vehicle_photo_url, 'license_photo', license_photo_path,
    'events', svc_events, 'wedding', svc_wedding, 'airport', svc_airport, 'contracts', svc_contracts, 'rental', svc_rental,
    'office_name', office_name, 'manager', office_manager, 'city', office_city, 'lat', office_lat, 'lng', office_lng,
    'cr_number', cr_number, 'cr_photo', cr_photo_path)
  from profiles where id = auth.uid();
$$;

revoke execute on function public.set_rental_service(boolean) from public, anon;
grant execute on function public.set_rental_service(boolean) to authenticated;
