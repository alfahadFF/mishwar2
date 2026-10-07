-- التأجير (11 من 11): الفحص النهائي
select 'الجداول' as البند, (select count(*) from information_schema.tables where table_schema = 'public' and table_name in
  ('rental_listings','rental_requests','rental_general','rental_general_offers'))::text || ' من 4' as النتيجة
union all select 'تخزين الصور', case when exists (select 1 from storage.buckets where id = 'rental-photos') then 'موجود' else 'ناقص' end
union all select 'الدوال', (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
  ('save_rental_listing','rental_listing_action','rental_search','rental_listing_view','rental_request_listing','rental_cancel_request',
   'rental_post_general','rental_cancel_general','rental_provider_generals','rental_respond_general','_rental_book',
   'rental_provider_respond','rental_choose_offer','rental_settle_my_dues','my_rental_listings','rental_provider_requests','my_rentals'))::text || ' من 17'
union all select 'عمولة التأجير', coalesce((select (rate * 100)::int::text || '%' from service_commissions where service = 'rental'), 'ناقصة');
