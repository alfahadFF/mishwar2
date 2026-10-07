-- السفريات (2 من 7): تسجيل سائق السفريات وبيانات الحساب.
create or replace function public.set_work_intent(p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if p_role not in ('driver','carrier','office','travel') then raise exception 'WORK_ROLE'; end if;
  update public.profiles set work_role = p_role
   where id = auth.uid() and type::text = 'personal';
end; $$;

-- يستخدم نموذج السائق نفسه، مع إبقاء الخدمات السابقة كما هي ومن دون إظهار خياراتها في نموذج السفر.
create or replace function public.save_travel_driver_profile(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_flags jsonb; v_payload jsonb; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  select jsonb_build_object('events', coalesce(svc_events,false), 'wedding', coalesce(svc_wedding,false),
    'airport', coalesce(svc_airport,false), 'contracts', coalesce(svc_contracts,false))
    into v_flags from public.profiles where id = auth.uid();
  if v_flags is null then raise exception 'PROFILE_NOT_FOUND'; end if;
  v_payload := coalesce(p, '{}'::jsonb) || jsonb_build_object('role','driver') || v_flags;
  v_result := public.save_work_profile(v_payload);
  update public.profiles set svc_travel = true where id = auth.uid() and type::text = 'driver';
  return v_result || jsonb_build_object('travel',true);
end; $$;

create or replace function public.set_travel_service(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  update public.profiles set svc_travel = coalesce(p_on,false)
   where id = auth.uid() and type::text in ('driver','business') and work_registered_at is not null;
  if not found then raise exception 'TRAVEL_ACCOUNT'; end if;
end; $$;

create or replace function public.my_work_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('type',type::text,'full_name',full_name,'phone',phone,'kind',event_vehicle_type,
    'category',taxi_category,'seats',vehicle_seats,'cargo_class',vehicle_class,'model',vehicle_model,
    'year',vehicle_year,'color',vehicle_color,'plate',vehicle_plate,'owner',vehicle_owner,'fuel',fuel,
    'engine_cc',engine_cc,'license_no',license_no,'license_place',license_place,'license_expiry',license_expiry,
    'driver_photo',avatar_url,'vehicle_photo',vehicle_photo_url,'license_photo',license_photo_path,
    'events',svc_events,'wedding',svc_wedding,'airport',svc_airport,'contracts',svc_contracts,
    'rental',svc_rental,'travel',coalesce(svc_travel,false),
    'office_name',office_name,'manager',office_manager,'city',office_city,'lat',office_lat,'lng',office_lng,
    'cr_number',cr_number,'cr_photo',cr_photo_path)
  from public.profiles where id = auth.uid();
$$;

revoke execute on function public.set_work_intent(text) from public, anon;
revoke execute on function public.save_travel_driver_profile(jsonb) from public, anon;
revoke execute on function public.set_travel_service(boolean) from public, anon;
revoke execute on function public.my_work_profile() from public, anon;
grant execute on function public.set_work_intent(text) to authenticated;
grant execute on function public.save_travel_driver_profile(jsonb) to authenticated;
grant execute on function public.set_travel_service(boolean) to authenticated;
grant execute on function public.my_work_profile() to authenticated;
