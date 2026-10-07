# تسعير التكسي

## الحالة
هذه **مسودة محلية**. لم تُشغّل ملفات SQL على Supabase. تُشغّلها الإدارة يدوياً بالترتيب أدناه بعد مراجعة/نسخ احتياطي مناسب.

## القرارات المطبّقة
- الطلب المباشر: حتى 3 كم أجرة ثابتة **$1.50**. بعد 3 كم: `1.50 + ((km × 0.34) + (الدقائق المتوقعة × 0.03)) × معامل الفئة`، ثم تقريب الأجرة المحاسبية بالدولار إلى سنتين.
- الفئات: `ordinary` قياسية ×1.00؛ `economy` اقتصادية ×0.90؛ `luxury` فاخرة ×1.20؛ `van_8` و`van_11` فان ×1.60، بلا ربط بسعة المحرك. الهايبرد يصنّف حسب CC، والكهربائي اقتصادي.
- المحاسبة والمحفظة بالدولار. تحفظ الرحلة أجرتها المحلية وسعر الصرف المستخدم وقت إنشاء الطلب؛ تعديل سعر الإدارة لا يغيّر الرحلات السابقة.
- سوريا: 13,200 ليرة قديمة/USD = 132 ليرة جديدة/USD بعد حذف صفرين؛ تقريب العرض إلى أقرب 10 ليرات جديدة.
- العمولة 10% لكل من `taxi` و`taxi_shared`؛ بقية الخدمات لا تعدّلها هذه الهجرة. رحلة المقعد المشترك تبقى بسعر المقعد الذي يدخله السائق بالدولار، مع توضيح USD في الواجهة؛ معادلة الكيلومترات تخص الطلب المباشر.
- سعر السوق يدخله الأدمن يدوياً. تجاوز فرق 3% يصدر تنبيهاً للمراجعة، ولا يحدّث سعر التسعير تلقائياً. العراق ولبنان والأردن موجودة لكنها غير مفعّلة حتى إدخال سعر التقويم ووحدة التقريب.

## ترتيب التشغيل في Supabase SQL Editor
شغّل محتوى كل ملف كاملاً، ملفاً واحداً في كل مرة، بهذا الترتيب:
1. `01.sql` — الجداول والإعدادات وعمولة 10% وحقول حفظ السعر.
2. `02.sql` — الحاسبة، عروض الفئات، ومشغّل حماية السعر.
3. `03.sql` — RPC الإدارة والتنبيه اليدوي لفرق الصرف.
4. `04.sql` — أجرة الرحلة المحلية وبيانات السائق والإكمال.

كل ملف أقل من 100 سطر. لا تشغّل ملفات قديمة لإعادة إنشاء جداول التكسي بالتوازي مع هذه الهجرة.

## فحص ما بعد التشغيل
شغّل هذا الاستعلام بعد الملفات الأربعة؛ يجب أن تكون جميع القيم `true`:

```sql
select
  exists(select 1 from public.taxi_pricing_rules where id=1 and is_active
    and minimum_distance_km=3 and minimum_fare_usd=1.50
    and rate_per_km_usd=0.34 and rate_per_trip_minute_usd=0.03) as formula,
  exists(select 1 from public.taxi_pricing_countries where country_code='SY'
    and enabled and pricing_exchange_rate=132 and previous_exchange_rate=13200
    and rounding_unit=10 and auto_update_exchange_rate=false) as syria,
  (select count(*)=3 from public.taxi_pricing_countries
    where country_code in ('IQ','LB','JO') and not enabled) as other_countries_disabled,
  (select rate=0.10 from public.service_commissions where service='taxi') as taxi_commission,
  (select rate=0.10 from public.service_commissions where service='taxi_shared') as shared_commission,
  to_regprocedure('public.taxi_price_quotes(numeric,numeric)') is not null as quotes_rpc,
  to_regprocedure('public.admin_taxi_pricing_settings()') is not null as admin_settings_rpc,
  to_regprocedure('public.admin_save_taxi_exchange_rate(text,numeric,numeric,numeric)') is not null as manual_fx_rpc,
  (select count(*)=8 from information_schema.columns where table_schema='public'
    and table_name='taxi_orders' and column_name in ('duration_min','fare_local','local_currency',
      'pricing_country','pricing_exchange_rate','commission_rate','commission_local','driver_net_local')) as fare_columns,
  exists(select 1 from pg_trigger where tgname='trg_taxi_sync_price' and not tgisinternal) as fare_trigger,
  (public._taxi_price_quote(4,10,'ordinary','SY')->>'fare_usd')::numeric=3.16 as formula_sample,
  (public._taxi_price_quote(4,10,'ordinary','SY')->>'fare_local')::numeric=420 as rounded_sample;
```

## فحوص محلية أُجريت
- `.tools/pgtest_pricing.mjs`: 13 فحصاً محلياً على PGlite ناجحاً، بما فيها الحساب، تثبيت سعر الصرف في الرحلات السابقة، الفترة المجانية، عمولة المحفظة، وتنبيه فرق السوق. لا يتصل هذا الاختبار بـSupabase ولا ينفّذ حجزاً حياً.
- TypeScript: `npx tsc --noEmit -p .` نجح بعد نسخ `app/` إلى مجلد مؤقت وتشغيل `npm ci` هناك؛ لم يُشغّل npm داخل `app/`.
