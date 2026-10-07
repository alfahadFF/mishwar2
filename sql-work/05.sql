-- السائق والناقل (5 من 5): الفحص
select 'الأعمدة' as البند, (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('vehicle_owner','plate_norm','fuel','license_no','license_place','license_expiry','license_photo_path',
                      'svc_airport','svc_contracts','work_role','work_registered_at','work_verified_at','work_reminders'))::text || ' من 13' as النتيجة
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('_norm_plate','_work_block_reason','save_work_profile','my_work_status','set_work_intent','my_work_profile'))::text || ' من 6'
union all select 'اللوحة الفريدة', case when exists (select 1 from pg_indexes where indexname = 'profiles_plate_uniq') then 'مفعّلة' else 'ناقصة' end
union all select 'توحيد اللوحة', case when public._norm_plate(' ١٢٣-45 أ ') = public._norm_plate('12345أ') then 'صحيح' else 'خطأ' end
union all select 'تخزين الصور', (select count(*) from storage.buckets where id in ('work-photos','work-docs'))::text || ' من 2'
union all select 'ربط الإيقاف', case when (select prosrc from pg_proc where proname = 'wallet_blocked' and pronamespace = 'public'::regnamespace)
  like '%_work_block_reason%' then 'مفعّل' else 'ناقص' end;
