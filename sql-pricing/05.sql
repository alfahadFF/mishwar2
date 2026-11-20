-- تسعير التكسي (5): حفظ مصدر المسار مع الطلب.
-- ترحيل آمن وقابل لإعادة التشغيل على قاعدة موجودة؛ شغّله بعد sql-pricing/04.sql.
alter table public.taxi_orders
  add column if not exists route_source text;

-- يجب أن يعيد الفحص true قبل نشر نسخة التطبيق التي ترسل route_source.
select exists (
  select 1 from information_schema.columns
   where table_schema = 'public'
     and table_name = 'taxi_orders'
     and column_name = 'route_source'
) as route_source_column_ready;
