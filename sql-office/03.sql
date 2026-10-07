-- مكتب التأجير (3 من 3): الفحص
select 'الأعمدة' as البند, (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('office_name','office_manager','office_city','office_lat','office_lng','cr_number','cr_photo_path','svc_rental'))::text || ' من 8' as النتيجة
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('save_office_profile','set_rental_service'))::text || ' من 2'
union all select 'نوع المكتب', case when (select prosrc from pg_proc where proname = 'set_work_intent' and pronamespace = 'public'::regnamespace)
  like '%office%' then 'مفعّل' else 'ناقص' end
union all select 'بيانات النموذج', case when (select prosrc from pg_proc where proname = 'my_work_profile' and pronamespace = 'public'::regnamespace)
  like '%cr_number%' then 'محدّثة' else 'قديمة' end;
