-- فئة السيارة تلقائياً (3 من 3): الفحص
select 'الأعمدة' as البند, (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('engine_cc','luxury_requested'))::text || ' من 2' as النتيجة
union all select 'حد الاقتصادية', coalesce((select value from app_settings where key = 'economy_max_cc'), 'ناقص')
union all select 'تحديد الفئة', case when public._car_category('petrol', 1300) = 'economy' and public._car_category('petrol', 1400) = 'ordinary'
  and public._car_category('hybrid', 2000) = 'economy' then 'صحيح' else 'خطأ' end
union all select 'حفظ النموذج', case when (select prosrc from pg_proc where proname = 'save_work_profile' and pronamespace = 'public'::regnamespace)
  like '%_car_category%' then 'محدّث' else 'قديم' end
union all select 'اعتماد الفاخرة', case when exists (select 1 from pg_proc where proname = 'admin_set_luxury') then 'موجود' else 'ناقص' end;
