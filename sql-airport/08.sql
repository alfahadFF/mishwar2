-- تكسي المطار (8 من 8): الفحص
select 'الجداول' as البند, (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('airports', 'airport_orders', 'airport_offers'))::text || ' من 3' as النتيجة
union all select 'المطارات', (select count(*) from public.airports)::text || ' من 14'
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('create_airport_order','edit_airport_order','cancel_airport_order','my_airport_orders','customer_airport_offers','accept_airport_offer',
   'reject_airport_offer','driver_airport_feed','driver_send_airport_offer','driver_withdraw_airport_offer','driver_airport_jobs',
   'driver_complete_airport'))::text || ' من 12'
union all select 'الإشعارات', (select count(*) from pg_trigger where tgname in ('trg_push_airport_new','trg_notify_airport_offer','trg_airport_done'))::text || ' من 3'
union all select 'العمولة', coalesce((select (rate * 100)::int::text || '%' from public.service_commissions where service = 'airport'), 'ناقصة')
union all select 'التقييم', case when pg_get_constraintdef((select oid from pg_constraint where conname = 'provider_reviews_service_check'))
  like '%airport%' then 'مفعّل' else 'ناقص' end
union all select 'المشاركة والطوارئ', case when (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('_share_ctx', '_my_active_ctx', '_live_duty', 'create_trip_share') and prosrc like '%airport%') = 4
  then 'مفعّل' else 'ناقص' end;
