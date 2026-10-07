-- حسابي (3 من 4): حذف الحساب
-- لا يُحذف إذا كان في المحفظة رصيد، أو لديه طلب لم ينتهِ، أو سيارته مؤجّرة الآن.
-- الحذف = مسح البيانات الشخصية وإيقاف الدخول، مع إبقاء الطلبات القديمة بلا بيانات صاحبها،
-- ويصبح الرقم متاحاً لتسجيل حساب جديد.
create or replace function public.delete_my_account()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'NOT_AUTH'; end if;
  if coalesce((select balance from wallets where user_id = me), 0) > 0 then raise exception 'ACCOUNT_HAS_BALANCE'; end if;
  if exists (select 1 from rental_listings where provider_id = me and status::text = 'rented') then raise exception 'ACCOUNT_RENTED_CAR'; end if;
  if exists (select 1 from taxi_orders where (user_id = me or driver_id = me)
              and status::text in ('pending','searching','accepted','arrived','in_progress'))
  or exists (select 1 from taxi_shared_requests r join taxi_shared_trips t on t.id = r.trip_id
              where r.passenger_id = me and r.status::text in ('pending','counter','accepted','confirmed')
                and t.status::text not in ('completed','cancelled'))
  or exists (select 1 from taxi_shared_trips where driver_id = me and status::text not in ('completed','cancelled'))
  or exists (select 1 from cargo_orders where (customer_id = me or carrier_id = me) and status::text in ('pending','accepted','in_progress'))
  or exists (select 1 from event_orders where user_id = me and status::text in ('pending','accepted','in_progress'))
  or exists (select 1 from contract_orders where user_id = me and status::text in ('pending','accepted','in_progress'))
  or exists (select 1 from rental_requests where customer_id = me and (status::text = 'pending' or (status::text = 'accepted' and ended_at is null)))
  or exists (select 1 from rental_general where customer_id = me and status::text = 'open')
  then raise exception 'ACCOUNT_ACTIVE_ORDER'; end if;

  -- سيارات التأجير: إخفاؤها ورفض الطلبات المعلّقة عليها
  update rental_requests set status = 'rejected', reason = 'deleted'
   where provider_id = me and status = 'pending';
  update rental_listings set status = 'deleted' where provider_id = me and status::text in ('active','paused');

  delete from sos_settings where user_id = me;
  delete from device_push_tokens where user_id = me;
  delete from taxi_driver_positions where driver_id = me;

  update profiles set phone = null, email = null, full_name = null, avatar_url = null, national_id = null,
         vehicle_plate = null, deleted_at = now(), updated_at = now()
   where id = me;

  -- إيقاف الدخول وتحرير الرقم
  update auth.users set email = 'deleted.' || replace(me::text, '-', '') || '@users.mishwar.app',
         phone = null, encrypted_password = '', raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '100 years', updated_at = now()
   where id = me;
  begin
    delete from auth.identities where user_id = me;
    delete from auth.sessions where user_id = me;
  exception when insufficient_privilege then null;
  end;
  return jsonb_build_object('ok', true);
end; $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
