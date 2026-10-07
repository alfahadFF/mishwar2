-- الحوافز (7 من 7): الفحص النهائي
select 'الجداول' as البند, (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('incentive_volume','incentive_rewards'))::text || ' من 2' as النتيجة
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('_provider_level_of','_provider_level','_level_bonus','_level_delay','_incentive_contract_tick','_incentive_pct',
   '_incentive_settle','my_incentives','_taxi_priority_wait','taxi_priority_wait'))::text || ' من 10'
union all select 'أولوية التكسي', case when exists (select 1 from pg_trigger where tgname = 'trg_taxi_priority') then 'مفعّلة' else 'ناقصة' end
union all select 'المستوى بالتقييم', case when (select prosrc from pg_proc where proname = '_provider_rating') like '%limit 100%' then 'آخر 100' else 'قديم' end
union all select 'الحوافز مع فتح التطبيق', case when (select prosrc from pg_proc where proname = 'settle_all_my_dues') like '%_incentive_settle%' then 'مربوط' else 'ناقص' end;
