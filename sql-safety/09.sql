-- الأمان والطوارئ (9 من 9): الفحص النهائي
select 'الجداول' as البند, (select count(*) from information_schema.tables where table_schema = 'public' and table_name in
  ('sos_settings','live_positions','sos_cases','sos_points','live_shares'))::text || ' من 5' as النتيجة
union all select 'نمرة السيارة', case when exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'profiles' and column_name = 'vehicle_plate') then 'موجود' else 'ناقص' end
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('my_sos_settings','save_sos_settings','_live_duty','_live_pos','_person_json','_share_ctx','_my_active_ctx',
   'create_trip_share','live_ping','_sos_json','sos_start','sos_end','my_sos_active','get_live_share','my_taxi_active'))::text || ' من 15'
union all select 'فتح الرابط بدون تسجيل', case when has_function_privilege('anon', 'public.get_live_share(text)', 'execute')
  then 'مفعّل' else 'ناقص' end
union all select 'حماية البيانات الداخلية', case when not has_function_privilege('anon', 'public._person_json(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public._person_json(uuid)', 'execute') then 'مفعّلة' else 'ناقصة' end
union all select 'حماية بيانات سائق التكسي قبل القبول', case when
  position('case when o.status in (''accepted'',''arrived'',''in_progress'') then p.full_name end' in
    pg_get_functiondef('public.my_taxi_active()'::regprocedure)) > 0
  and position('case when o.status in (''accepted'',''arrived'',''in_progress'') then p.vehicle_plate end' in
    pg_get_functiondef('public.my_taxi_active()'::regprocedure)) > 0
  then 'مفعّلة' else 'ناقصة' end;
