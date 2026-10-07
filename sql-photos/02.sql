-- صور مقدّم الخدمة (2 من 2): الفحص
select 'دالة الصور' as البند, case when exists (select 1 from pg_proc where proname = 'provider_photos' and pronamespace = 'public'::regnamespace)
  then 'موجودة' else 'ناقصة' end as النتيجة
union all select 'تجربة الاستدعاء', (select case when public.provider_photos('taxi', array[]::uuid[]) = '{}'::jsonb then 'صحيح' else 'خطأ' end);
