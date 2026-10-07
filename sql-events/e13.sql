-- ---------- 10) فحص ----------
select 'الدوال' as "الفحص", count(*)::text || ' من 13' as "النتيجة" from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('_ev_items_left','_ev_can_serve','driver_events_feed','driver_send_event_offer',
   'driver_withdraw_event_offer','my_event_orders','customer_event_offers','accept_event_offer','reject_event_offer',
   'cancel_event_order','driver_my_event_offers','driver_event_jobs','driver_complete_event')
union all
select 'حماية بيانات المركبة', case when exists (select 1 from pg_trigger where tgname = 'trg_protect_vehicle_fields') then 'مفعّلة' else 'غير مفعّلة' end
union all
select 'عرض جديد بعد السحب', case when exists (select 1 from pg_indexes where indexname = 'uq_event_offer_active') then 'مسموح' else 'ممنوع' end
union all
select 'عمولة المناسبات', (select (rate*100)::int || '%' from public.service_commissions where service = 'events');
