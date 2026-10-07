-- الجزء 14 من 14 — فحص نهائي (قراءة فقط)

select 'الدوال' as الفحص, count(*)::text || ' من 12' as النتيجة
from pg_proc where pronamespace = 'public'::regnamespace and proname in
 ('_wallet_charge','wallet_blocked','my_wallet','admin_wallet_topup','cargo_vehicle_fits','carrier_cargo_feed',
  'carrier_accept_cargo','carrier_send_cargo_offer','carrier_withdraw_cargo_offer','accept_cargo_offer',
  'carrier_my_cargo_jobs','carrier_complete_cargo')
union all
select 'عمولة النقل', (select (rate*100)::int::text || '%' from public.service_commissions where service = 'cargo')
union all
select 'تطابق 800 كغ ← 1500 كغ', public.cargo_vehicle_fits('pk800','pk1500')::text
union all
select 'تطابق 1500 كغ ← 800 كغ', public.cargo_vehicle_fits('pk1500','pk800')::text
union all
select 'تطابق 3 طن ← شاحنة', public.cargo_vehicle_fits('md3','truck')::text;
