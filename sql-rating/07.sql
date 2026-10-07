-- التقييم (7 من 7): الفحص النهائي
select 'جدول التقييمات' as البند, case when to_regclass('public.provider_reviews') is not null then 'موجود' else 'ناقص' end as النتيجة
union all select 'نقاط الانتهاء', (select count(*) from pg_trigger where tgname in
  ('trg_rating_taxi','trg_rating_shared','trg_rating_cargo','trg_rating_event','trg_rating_rental'))::text || ' من 5'
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('_rating_add','_provider_rating','_rating_contract_tick','my_pending_ratings','submit_rating','skip_rating',
   'my_rating_summary','rating_badges'))::text || ' من 8'
union all select 'تقييم العقود مع فتح التطبيق', case when (select prosrc from pg_proc where proname = 'settle_all_my_dues') like '%_rating_contract_tick%' then 'مربوط' else 'ناقص' end;
