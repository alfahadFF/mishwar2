-- التسجيل (4 من 4): الفحص
select 'الأعمدة' as البند, (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('country', 'terms_accepted_at'))::text || ' من 2' as النتيجة
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('_parse_phone', '_on_auth_user_created', 'invite_code_valid', '_profiles_guard'))::text || ' من 4'
union all select 'إنشاء الملف عند التسجيل', case when exists (select 1 from pg_trigger where tgname = 'trg_on_auth_user_created') then 'مفعّل' else 'ناقص' end
union all select 'حماية الملف', case when exists (select 1 from pg_trigger where tgname = 'trg_profiles_guard')
  and not exists (select 1 from pg_trigger where tgname = 'trg_protect_vehicle_fields')
  and not exists (select 1 from pg_policies where tablename = 'profiles' and cmd = 'INSERT') then 'مفعّلة' else 'ناقصة' end
union all select 'قراءة الأرقام', case when public._parse_phone('0912345678')->>'phone' = '+963912345678'
  and public._parse_phone('791234567')->>'country' = 'JO' and public._parse_phone('+964 770 123 4567')->>'country' = 'IQ'
  and public._parse_phone('03123456')->>'phone' = '+9613123456' and public._parse_phone('091234567') is null then 'صحيحة' else 'خطأ' end;
