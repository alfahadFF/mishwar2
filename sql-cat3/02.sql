-- فئة السيارة حسب الاستهلاك (2 من 3): حفظ نموذج العمل والفئة من الوقود وسعة المحرك فقط
create or replace function public.save_work_profile(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); pr profiles; v_role text := p->>'role'; v_kind text; v_cat text; v_seats int; v_class text;
  v_year int := nullif(p->>'year', '')::int; v_exp date := nullif(p->>'license_expiry', '')::date;
  v_cc int := nullif(p->>'engine_cc', '')::int;
  v_small boolean; v_first boolean;
begin
  if me is null then raise exception 'NOT_AUTH'; end if;
  select * into pr from profiles where id = me;
  if v_role not in ('driver', 'carrier') then raise exception 'WORK_ROLE'; end if;
  if pr.type::text not in ('personal', case v_role when 'driver' then 'driver' else 'transporter' end) then
    raise exception 'WORK_TYPE_CHANGE'; end if;
  if coalesce(btrim(p->>'full_name'), '') = '' then raise exception 'WORK_NAME'; end if;

  if v_role = 'driver' then
    v_kind := p->>'kind';
    v_seats := case v_kind when 'van_8' then 8 when 'van_11' then 11 when 'bus_small_14' then 14 when 'bus_mid_18' then 18
                 when 'bus_mid_21' then 21 when 'bus_mid_27' then 27 when 'bus_large_50' then 50
                 when 'car' then least(greatest(coalesce(nullif(p->>'seats', '')::int, 4), 2), 8) end;
    if v_seats is null then raise exception 'WORK_VEHICLE'; end if;
    v_cat := case when v_kind in ('van_8','van_11') then v_kind end;
    -- السيارة: الفئة من الوقود وسعة المحرك (الكهرباء بلا سعة)
    if v_kind = 'car' then
      if coalesce(p->>'fuel', '') <> 'electric' and (v_cc is null or v_cc not between 500 and 8000) then raise exception 'WORK_CC'; end if;
      v_cat := public._car_category(p->>'fuel', v_cc);
    end if;
    v_small := v_kind in ('car','van_8','van_11');
  else
    v_class := p->>'cargo_class';
    if v_class is null or not public.cargo_vehicle_fits(v_class, v_class) then raise exception 'WORK_VEHICLE'; end if;
  end if;

  if coalesce(btrim(p->>'model'), '') = '' then raise exception 'WORK_MODEL'; end if;
  if v_year is null or v_year < 1960 or v_year > extract(year from now())::int + 1 then raise exception 'WORK_YEAR'; end if;
  if coalesce(btrim(p->>'color'), '') = '' then raise exception 'WORK_COLOR'; end if;
  if public._norm_plate(p->>'plate') is null then raise exception 'WORK_PLATE'; end if;
  if coalesce(btrim(p->>'owner'), '') = '' then raise exception 'WORK_OWNER'; end if;
  if coalesce(p->>'fuel', '') not in ('petrol','diesel','gas','electric','hybrid') then raise exception 'WORK_FUEL'; end if;
  if coalesce(btrim(p->>'license_no'), '') = '' or coalesce(btrim(p->>'license_place'), '') = '' then raise exception 'WORK_LICENSE'; end if;
  if v_exp is null then raise exception 'WORK_LICENSE_DATE'; end if;

  v_first := pr.work_registered_at is null;
  begin
    update profiles set
      full_name = btrim(p->>'full_name'),
      type = (case v_role when 'driver' then 'driver' else 'transporter' end)::user_type,
      event_vehicle_type = v_kind, taxi_category = v_cat, vehicle_seats = v_seats, vehicle_class = v_class,
      vehicle_model = btrim(p->>'model'), vehicle_year = v_year, vehicle_color = btrim(p->>'color'),
      vehicle_plate = btrim(p->>'plate'), plate_norm = public._norm_plate(p->>'plate'), vehicle_owner = btrim(p->>'owner'),
      fuel = p->>'fuel', engine_cc = case when v_kind = 'car' then v_cc end, luxury_requested = null, license_no = btrim(p->>'license_no'), license_place = btrim(p->>'license_place'), license_expiry = v_exp,
      avatar_url = coalesce(nullif(p->>'driver_photo', ''), avatar_url),
      vehicle_photo_url = coalesce(nullif(p->>'vehicle_photo', ''), vehicle_photo_url),
      license_photo_path = coalesce(nullif(p->>'license_photo', ''), license_photo_path),
      svc_events = v_role = 'driver' and coalesce((p->>'events')::boolean, false),
      svc_wedding = v_small and coalesce((p->>'wedding')::boolean, false),
      svc_airport = v_role = 'driver' and v_kind in ('car','van_8','van_11','bus_small_14') and coalesce((p->>'airport')::boolean, false),
      svc_contracts = v_role = 'driver' and coalesce((p->>'contracts')::boolean, false),
      work_role = null, work_registered_at = coalesce(work_registered_at, now()), updated_at = now()
    where id = me;
    if v_cat is not null then update taxi_driver_positions set category = v_cat where driver_id = me; end if;
  exception when unique_violation then raise exception 'PLATE_TAKEN';
  end;

  if v_first then
    insert into user_notifications(user_id, kind, title, body, data)
    values (me, 'verify', 'تم تفعيل حساب العمل',
            'يمكنك استقبال الطلبات الآن. يجب استكمال التحقق من بياناتك خلال 30 يوماً، وإلا يتوقف استقبال الطلبات.', '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', true, 'role', v_role, 'kind', v_kind);
end; $$;
revoke execute on function public.save_work_profile(jsonb) from public, anon;
grant execute on function public.save_work_profile(jsonb) to authenticated;
