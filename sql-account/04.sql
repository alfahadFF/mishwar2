-- حسابي (4 من 4): الفحص
select 'الدوال' as البند, (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('my_account', 'set_my_name', 'delete_my_account'))::text || ' من 3' as النتيجة
union all select 'عمود الحذف', case when exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'profiles' and column_name = 'deleted_at') then 'موجود' else 'ناقص' end
union all select 'صور التأجير', case when (select prosrc from pg_proc where proname = 'save_rental_listing'
  and pronamespace = 'public'::regnamespace) like '%v_photos = ''{}''::jsonb%' then 'من 1 إلى 3' else 'قديمة' end
union all select 'صلاحية الحذف على auth', case when has_table_privilege('postgres', 'auth.users', 'UPDATE')
  then 'متاحة' else 'غير متاحة' end;
