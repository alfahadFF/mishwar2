-- فئة السيارة تلقائياً (1 من 3): سعة المحرك، طلب الفئة الفاخرة، الحد القابل للتعديل
alter table public.profiles add column if not exists engine_cc int;
alter table public.profiles add column if not exists luxury_requested boolean;
insert into public.app_settings(key, value) values ('economy_max_cc', '1300') on conflict (key) do nothing;

-- اقتصادية: كهرباء أو هايبرد أو محرك حتى الحد؛ وإلا عادية
create or replace function public._car_category(p_fuel text, p_cc int)
returns text language sql stable security definer set search_path = public as $$
  select case when p_fuel in ('electric', 'hybrid')
                or p_cc <= coalesce((select value::int from app_settings where key = 'economy_max_cc'), 1300)
              then 'economy' else 'ordinary' end;
$$;
revoke execute on function public._car_category(text, int) from public, anon, authenticated;

-- اعتماد الفئة الفاخرة أو رفضها (للإدارة)
create or replace function public.admin_set_luxury(p_user uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ADMIN'; end if;
  update profiles set
    taxi_category = case when p_approve then 'luxury' else public._car_category(fuel, engine_cc) end,
    luxury_requested = p_approve, updated_at = now()
  where id = p_user and type::text = 'driver' and event_vehicle_type = 'car';
  insert into user_notifications(user_id, kind, title, body, data)
  values (p_user, 'verify', case when p_approve then 'تم اعتماد سيارتك فاخرة' else 'لم تُعتمد سيارتك فاخرة' end,
          case when p_approve then 'تصلك الآن طلبات الفئة الفاخرة.' else 'تبقى فئة سيارتك حسب الوقود وسعة المحرك.' end, '{}'::jsonb);
end; $$;
revoke execute on function public.admin_set_luxury(uuid, boolean) from public, anon;
grant execute on function public.admin_set_luxury(uuid, boolean) to authenticated;

create or replace function public.my_work_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('type', type::text, 'full_name', full_name, 'phone', phone, 'kind', event_vehicle_type,
    'category', taxi_category, 'seats', vehicle_seats, 'cargo_class', vehicle_class, 'model', vehicle_model,
    'year', vehicle_year, 'color', vehicle_color, 'plate', vehicle_plate, 'owner', vehicle_owner, 'fuel', fuel,
    'engine_cc', engine_cc, 'luxury', luxury_requested,
    'license_no', license_no, 'license_place', license_place, 'license_expiry', license_expiry,
    'driver_photo', avatar_url, 'vehicle_photo', vehicle_photo_url, 'license_photo', license_photo_path,
    'events', svc_events, 'wedding', svc_wedding, 'airport', svc_airport, 'contracts', svc_contracts, 'rental', svc_rental,
    'office_name', office_name, 'manager', office_manager, 'city', office_city, 'lat', office_lat, 'lng', office_lng,
    'cr_number', cr_number, 'cr_photo', cr_photo_path, 'economy_max_cc',
    (select value::int from app_settings where key = 'economy_max_cc'))
  from profiles where id = auth.uid();
$$;
