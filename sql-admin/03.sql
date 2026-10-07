-- شاشات الإدارة (3 من 6): التحقق من حسابات العمل
create or replace function public.admin_verify_queue()
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select jsonb_build_object('id', p.id, 'type', p.type::text, 'full_name', p.full_name, 'phone', p.phone, 'wallet_id', p.wallet_id,
           'registered_at', p.work_registered_at,
           'days_left', greatest(0, 30 - floor(extract(epoch from now() - p.work_registered_at) / 86400))::int,
           'kind', p.event_vehicle_type, 'category', p.taxi_category, 'cargo_class', p.vehicle_class, 'seats', p.vehicle_seats,
           'model', p.vehicle_model, 'year', p.vehicle_year, 'color', p.vehicle_color, 'plate', p.vehicle_plate,
           'owner', p.vehicle_owner, 'fuel', p.fuel, 'engine_cc', p.engine_cc,
           'license_no', p.license_no, 'license_place', p.license_place, 'license_expiry', p.license_expiry,
           'driver_photo', p.avatar_url, 'vehicle_photo', p.vehicle_photo_url, 'license_photo', p.license_photo_path,
           'office_name', p.office_name, 'manager', p.office_manager, 'city', p.office_city, 'cr_number', p.cr_number,
           'cr_photo', p.cr_photo_path, 'reject_reason', p.work_reject_reason)
    from profiles p
   where p.work_registered_at is not null and p.work_verified_at is null and p.deleted_at is null
   order by p.work_registered_at;
end; $$;

create or replace function public.admin_verify_decide(p_user uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(btrim(p_reason), '');
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if not p_approve and v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  if p_approve then
    update profiles set work_verified_at = now(), work_reject_reason = null
     where id = p_user and work_registered_at is not null and work_verified_at is null;
  else
    update profiles set work_reject_reason = v_reason
     where id = p_user and work_registered_at is not null and work_verified_at is null;
  end if;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into work_decisions(user_id, decision, reason, by_kind, by_user)
  values (p_user, case when p_approve then 'approved' else 'rejected' end, v_reason, 'admin', auth.uid());
  insert into user_notifications(user_id, kind, title, body, data)
  values (p_user, 'verify',
          case when p_approve then '✅ تم التحقق من حسابك' else '⚠️ لم يكتمل التحقق من حسابك' end,
          case when p_approve then 'اكتمل التحقق من بياناتك، ويستمر استقبال الطلبات دون انقطاع.'
               else 'السبب: ' || v_reason || '. عدّل بياناتك أو صورك من نموذج العمل قبل انتهاء المهلة.' end, '{}'::jsonb);
end; $$;

-- حساب عمل جديد ← إشعار للإدارة • تعديل البيانات بعد الرفض ← إشعار للإدارة ويُمسح سبب الرفض
create or replace function public._work_admin_watch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.work_registered_at is null and new.work_registered_at is not null then
    perform public._notify_admins('work_new', 'حساب عمل جديد بانتظار التحقق',
      coalesce(new.full_name, new.office_name, new.wallet_id), jsonb_build_object('user_id', new.id));
  elsif new.work_reject_reason is not null and new.work_reject_reason is not distinct from old.work_reject_reason
        and new.work_verified_at is null
        and (new.avatar_url, new.vehicle_photo_url, new.license_photo_path, new.cr_photo_path, new.license_no,
             new.vehicle_plate, new.vehicle_model, new.full_name, new.office_name, new.cr_number)
            is distinct from
            (old.avatar_url, old.vehicle_photo_url, old.license_photo_path, old.cr_photo_path, old.license_no,
             old.vehicle_plate, old.vehicle_model, old.full_name, old.office_name, old.cr_number) then
    new.work_reject_reason := null;
    perform public._notify_admins('work_updated', 'حساب عدّل بياناته بعد الرفض',
      coalesce(new.full_name, new.office_name, new.wallet_id), jsonb_build_object('user_id', new.id));
  end if;
  return new;
end; $$;
drop trigger if exists trg_zz_work_admin_watch on public.profiles;
create trigger trg_zz_work_admin_watch before update on public.profiles
  for each row execute function public._work_admin_watch();

revoke execute on function public._work_admin_watch() from public, anon, authenticated;
revoke execute on function public.admin_verify_queue(), public.admin_verify_decide(uuid, boolean, text) from public, anon;
grant execute on function public.admin_verify_queue(), public.admin_verify_decide(uuid, boolean, text) to authenticated;
