-- توفّر التكسي (5 من 5): الفحص النهائي
select 'فئة السيارة' as البند, case when exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'profiles' and column_name = 'taxi_category') then 'موجود' else 'ناقص' end as النتيجة
union all select 'منع الفئة المختلفة', case when exists (select 1 from pg_trigger where tgname = 'trg_taxi_accept_match') then 'مفعّل' else 'ناقص' end
union all select 'مواقع السائقين', case when to_regclass('public.taxi_driver_positions') is not null then 'موجود' else 'ناقص' end
union all select 'الدوال', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('_taxi_category','my_driver_status','driver_taxi_ping','nearby_taxis','driver_accept_taxi','_taxi_driver_json','driver_taxi_active'))::text || ' من 7';
