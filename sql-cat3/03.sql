-- فئة السيارة حسب الاستهلاك (3 من 3): الفحص
select 'الحدود' as البند, (select value from app_settings where key = 'economy_max_cc') || ' / ' ||
  coalesce((select value from app_settings where key = 'ordinary_max_cc'), 'ناقص') as النتيجة
union all select 'تحديد الفئة', case when public._car_category('petrol', 1399) = 'economy' and public._car_category('petrol', 1400) = 'ordinary'
  and public._car_category('diesel', 2000) = 'ordinary' and public._car_category('petrol', 2001) = 'luxury'
  and public._car_category('hybrid', 3000) = 'economy' and public._car_category('electric', null) = 'economy' then 'صحيح' else 'خطأ' end
union all select 'نموذج العمل', case when (select prosrc from pg_proc where proname = 'save_work_profile' limit 1) like '%luxury_requested = null%'
  then 'محدّث' else 'قديم' end
union all select 'اعتماد الفاخرة يدوياً', case when exists (select 1 from pg_proc where proname = 'admin_set_luxury') then 'ما زال موجوداً' else 'ملغى' end;
