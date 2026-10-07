-- الرحلة المشتركة (22 من 22): الفحص النهائي
select 'دوال الرحلة المشتركة' as البند, (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('_shared_open','_shared_auto_close','_shared_publish_check','_shared_trip_guard','_shared_charge','_shared_join_charge',
   'driver_start_shared_trip','driver_complete_shared_trip','driver_shared_position','driver_my_shared_trips',
   'driver_shared_passengers','my_shared_joins','_pay_items_d'))::text || ' من 13' as النتيجة
union all select 'عمولة الرحلة المشتركة', (select (rate * 100)::int || '%' from public.service_commissions where service = 'taxi_shared')
union all select 'الدفع يشمل المشتركة', case when position('_pay_items_d' in pg_get_functiondef('public.my_payables()'::regprocedure)) > 0
  then 'نعم' else 'لا' end
union all select 'خصم فوري بعد البدء', case when exists (select 1 from pg_trigger where tgname = 'trg_shared_join_charge') then 'مفعّل' else 'ناقص' end;
