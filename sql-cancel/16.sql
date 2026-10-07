-- إلغاءات السائق (16 من 16): الفحص النهائي
select 'دوال إلغاءات السائق' as البند, (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('_taxi_cancel_count','_taxi_suspended','_notify_admins','_register_cancel','driver_cancel_taxi','driver_cancel_shared_trip',
   '_shared_trip_guard','_taxi_cancel_undo','driver_accept_taxi','my_driver_status','admin_taxi_drivers',
   'admin_lift_taxi_suspension','admin_driver_cancels'))::text || ' من 13' as النتيجة
union all select 'جدول الإلغاءات', case when to_regclass('public.taxi_driver_cancels') is not null then 'موجود' else 'ناقص' end
union all select 'عمود الإيقاف', case when exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'profiles' and column_name = 'taxi_suspended') then 'موجود' else 'ناقص' end
union all select 'حماية الرحلة المشتركة', case when exists (select 1 from pg_trigger where tgname = 'trg_shared_trip_guard') then 'مفعّلة' else 'ناقصة' end;
