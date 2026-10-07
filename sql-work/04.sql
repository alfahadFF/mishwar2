-- السائق والناقل (4 من 5): حالة العمل والتذكيرات، وإكمال التسجيل، وبيانات النموذج
-- تذكير التحقق قبل 7 أيام وقبل يوم، وتذكير الرخصة عند انتهائها وقبل التوقف بأسبوع وبيوم
create or replace function public.my_work_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p profiles; v_dead timestamptz; v_stop date; r jsonb; k text; t text; b text;
begin
  select * into p from profiles where id = me;
  if p.id is null or p.work_registered_at is null then return jsonb_build_object('work', false); end if;
  v_dead := p.work_registered_at + interval '30 days';
  v_stop := (p.license_expiry + interval '3 months')::date;
  r := p.work_reminders;
  foreach k in array array['v7','v1','l0','l7','l1'] loop
    continue when r ? k;
    t := null;
    if k in ('v7','v1') and p.work_verified_at is null and now() >= v_dead - (case k when 'v7' then 7 else 1 end) * interval '1 day' then
      t := 'تذكير بالتحقق';
      b := 'يتوقف استقبال الطلبات يوم ' || to_char(v_dead, 'YYYY-MM-DD') || ' إذا لم يكتمل التحقق من بياناتك.';
    elsif k = 'l0' and p.license_expiry < current_date then
      t := 'انتهت صلاحية الرخصة';
      b := 'حدّث بيانات الرخصة قبل ' || to_char(v_stop, 'YYYY-MM-DD') || '، وبعدها يتوقف استقبال الطلبات.';
    elsif k in ('l7','l1') and current_date >= v_stop - (case k when 'l7' then 7 else 1 end) then
      t := 'تذكير بتحديث الرخصة';
      b := 'يتوقف استقبال الطلبات يوم ' || to_char(v_stop, 'YYYY-MM-DD') || ' إذا لم تُحدَّث بيانات الرخصة.';
    end if;
    if t is not null then
      insert into user_notifications(user_id, kind, title, body, data) values (me, 'verify', t, b, '{}'::jsonb);
      r := r || jsonb_build_object(k, now());
    end if;
  end loop;
  if r <> p.work_reminders then update profiles set work_reminders = r where id = me; end if;
  return jsonb_build_object('work', true, 'type', p.type::text, 'verified', p.work_verified_at is not null,
    'verify_deadline', v_dead, 'license_expiry', p.license_expiry, 'license_stop', v_stop,
    'blocked', public._work_block_reason(me),
    'negative', coalesce((select balance < 0 from wallets where user_id = me), false));
end; $$;

-- اختيار نوع العمل عند التسجيل (لإظهار «أكمل تسجيلك» إذا لم يكمل النموذج)
create or replace function public.set_work_intent(p_role text)
returns void language sql security definer set search_path = public as $$
  update profiles set work_role = case when p_role in ('driver', 'carrier') then p_role end
   where id = auth.uid() and type::text = 'personal';
$$;

-- بيانات النموذج لتعبئته عند التعديل
create or replace function public.my_work_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('type', type::text, 'full_name', full_name, 'phone', phone, 'kind', event_vehicle_type,
    'category', taxi_category, 'seats', vehicle_seats, 'cargo_class', vehicle_class, 'model', vehicle_model,
    'year', vehicle_year, 'color', vehicle_color, 'plate', vehicle_plate, 'owner', vehicle_owner, 'fuel', fuel,
    'license_no', license_no, 'license_place', license_place, 'license_expiry', license_expiry,
    'driver_photo', avatar_url, 'vehicle_photo', vehicle_photo_url, 'license_photo', license_photo_path,
    'events', svc_events, 'wedding', svc_wedding, 'airport', svc_airport, 'contracts', svc_contracts)
  from profiles where id = auth.uid();
$$;

-- «حسابي» تعرض أيضاً نوع العمل غير المكتمل
create or replace function public.my_account()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('phone', phone, 'wallet_id', wallet_id, 'full_name', full_name,
                            'type', type::text, 'country', country, 'work_role', work_role,
                            'work', work_registered_at is not null, 'verified', work_verified_at is not null)
    from profiles where id = auth.uid();
$$;

revoke execute on function public.my_work_status() from public, anon;
revoke execute on function public.set_work_intent(text) from public, anon;
revoke execute on function public.my_work_profile() from public, anon;
grant execute on function public.my_work_status() to authenticated;
grant execute on function public.set_work_intent(text) to authenticated;
grant execute on function public.my_work_profile() to authenticated;
