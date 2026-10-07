-- شاشات الإدارة (6 من 6): الفحص
select 'الأعمدة' as البند, (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('is_admin', 'suspended_at', 'suspend_reason', 'work_reject_reason'))::text || ' من 4' as النتيجة
union all select 'الجداول', (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('admin_notifications', 'work_decisions'))::text || ' من 2'
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('admin_home', 'admin_notifications_list', 'admin_notifications_read', 'admin_settings', 'admin_save_setting', 'admin_save_commission',
   'admin_verify_queue', 'admin_verify_decide', 'admin_user', 'admin_suspend_user', 'admin_unsuspend_user', 'my_admin_flags'))::text || ' من 12'
union all select 'منع الموقوف', (select count(*) from pg_trigger where tgname like 'trg_block_susp_%')::text || ' من 15'
union all select 'إشعار الحساب الجديد', case when exists (select 1 from pg_trigger where tgname = 'trg_zz_work_admin_watch') then 'مفعّل' else 'ناقص' end
union all select 'الطوارئ للأدمن', case when (select prosrc from pg_proc where proname = '_notify_admins' limit 1) like '%sos%' then 'ملغاة' else 'ما زالت' end
union all select 'صور الرخص للأدمن', case when exists (select 1 from pg_policies where policyname = 'work docs read admin') then 'مفعّل' else 'ناقص' end
union all select 'حساب الأدمن', coalesce((select string_agg(coalesce(wallet_id, phone), '، ') from public.profiles where is_admin), 'لا يوجد بعد');
