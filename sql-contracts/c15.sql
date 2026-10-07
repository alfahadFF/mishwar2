-- ---------- 9) فحص ----------
select 'دوال العقود' as "الفحص", count(*)::text || ' من 17' as "النتيجة" from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('_ct_end_date','_ct_items_left','_ct_can_serve','_wallet_charge_at','_ct_total',
   'contract_settle_my_dues','driver_contracts_feed','driver_send_contract_offer','driver_withdraw_contract_offer',
   'my_contract_orders','customer_contract_offers','accept_contract_offer','reject_contract_offer','cancel_contract_order',
   'end_contract_offer','driver_my_contract_offers','driver_contract_jobs')
union all
select 'حساب تاريخ النهاية', case when exists (select 1 from pg_trigger where tgname = 'trg_ct_set_end') then 'مفعّل' else 'غير مفعّل' end
union all
select 'عرض جديد بعد السحب', case when exists (select 1 from pg_indexes where indexname = 'uq_contract_offer_active') then 'مسموح' else 'ممنوع' end
union all
select 'عمولة العقود', (select (rate*100)::int || '%' from public.service_commissions where service = 'contracts');
