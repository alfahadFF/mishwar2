# تفعيل خدمة السفريات

نفّذ الملفات **01.sql إلى 08.sql بالترتيب** في Supabase SQL Editor، ملفاً واحداً بكل مرة. فضِّ المحرر قبل كل ملف، والصق الملف كاملاً من دون تحديد جزء منه.

الجزء 08 يضبط عمولة السفريات على **10% من أجرة الحجز، على السائق فقط، بعد تأكيد الرحلة**، ويستخدم آلية المحفظة الحالية بما فيها الإعفاء المجاني.

## فحص واحد بعد الملف 08.sql

```sql
select
  to_regclass('public.travel_listings') is not null as has_listings,
  to_regclass('public.travel_requests') is not null as has_requests,
  to_regclass('public.travel_offers') is not null as has_offers,
  to_regclass('public.travel_bookings') is not null as has_bookings,
  to_regprocedure('public.travel_search()') is not null as has_search_rpc,
  to_regprocedure('public.travel_choose_offer(uuid)') is not null as has_choose_rpc,
  to_regprocedure('public.travel_book_listing(uuid,double precision,double precision,text,integer,integer,boolean,text)') is not null as has_book_rpc,
  coalesce((select rate = 0.10 from public.service_commissions where service = 'travel'),false) as commission_10pct,
  exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='travel_bookings'
            and t.tgname='trg_travel_booking_commission' and not t.tgisinternal) as commission_trigger;
```

التحقّق المحلي يشمل تحليل SQL واختبارات تدفّق عبر PGlite. شغّل الفحص بعد الملف 08؛ لم يُنفّذ أي ملف على قاعدة Supabase الحية من طرفنا.
