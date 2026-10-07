-- الدفع وإنهاء التكسي (39 من 39): التحقق
select 'دوال المحفظة والتكسي' as البند, (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('set_wallet_pin','wallet_transfer','my_wallet','admin_find_user','admin_wallet_adjust','admin_wallet_report',
   'my_notifications','driver_accept_taxi','driver_taxi_arrived','driver_taxi_start','driver_taxi_complete',
   'customer_cancel_taxi','my_taxi_active','driver_taxi_active','my_payables','pay_from_wallet'))::text || ' من 16' as النتيجة
union all select 'خصم الدفع من التطبيق', (select value || '%' from public.app_settings where key = 'wallet_pay_discount_pct')
union all select 'عمولة التكسي', (select (rate * 100)::int || '%' from public.service_commissions where service = 'taxi')
union all select 'الإشعارات الفورية', case when exists (select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename = 'user_notifications') then 'مفعّلة' else 'غير مفعّلة' end;
