-- الولاء (7 من 7): الفحص النهائي
select 'الجداول' as البند, (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('loyalty_accounts','loyalty_events'))::text || ' من 2' as النتيجة
union all select 'نقاط الانتهاء', (select count(*) from pg_trigger where tgname in
  ('trg_loyalty_taxi','trg_loyalty_shared','trg_loyalty_cargo','trg_loyalty_event','trg_loyalty_rental'))::text || ' من 5'
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('_loyalty_add','_loyalty_earn','_loyalty_contract_tick','redeem_points','apply_invite_code','my_loyalty'))::text || ' من 6'
union all select 'العقود مع فتح التطبيق', case when (select prosrc from pg_proc where proname = 'settle_all_my_dues') like '%_loyalty_contract_tick%' then 'مربوط' else 'ناقص' end;
