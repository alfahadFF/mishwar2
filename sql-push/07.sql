-- الإشعارات (7 من 7): الفحص النهائي
select 'إضافة الإرسال' as البند, case when exists (select 1 from pg_extension where extname = 'pg_net') then 'مفعّلة' else 'ناقصة' end as النتيجة
union all select 'الجداول', (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('device_push_tokens','provider_push_prefs'))::text || ' من 2'
union all select 'نقاط الإرسال', (select count(*) from pg_trigger where tgname in
  ('trg_push_notification','trg_push_taxi_new','trg_push_rental_general','trg_push_cargo_new','trg_push_event_new','trg_push_contract_new',
   'trg_notify_cargo_offer','trg_notify_event_offer','trg_notify_contract_offer','trg_notify_cargo_direct',
   'trg_notify_shared_join','trg_notify_wallet_negative'))::text || ' من 12'
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('register_push_token','unregister_push_token','set_new_orders_push','my_push_prefs','provider_location_ping','_push_send'))::text || ' من 6';
