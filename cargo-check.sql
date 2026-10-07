-- فحص جدول النقل قبل بناء شاشة الناقل (قراءة فقط — لا يغيّر شيئاً)
select 'قيد حالة الطلب' as الفحص,
       coalesce((select pg_get_constraintdef(c.oid) from pg_constraint c
                 where c.conrelid='public.cargo_orders'::regclass and c.contype='c'
                   and pg_get_constraintdef(c.oid) ilike '%status%' limit 1), 'لا يوجد قيد') as النتيجة
union all
select 'الحالة الافتراضية',
       coalesce((select column_default from information_schema.columns
                 where table_schema='public' and table_name='cargo_orders' and column_name='status'), '—')
union all
select 'الحالات المستخدمة فعلاً',
       coalesce((select string_agg(status || ' (' || n || ')', ', ') from
                 (select status, count(*) n from public.cargo_orders group by status) x), 'لا توجد طلبات')
union all
select 'عمود carrier_id',
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='cargo_orders' and column_name='carrier_id')
            then 'موجود' else 'غير موجود' end
union all
select 'جدول cargo_offers',
       case when to_regclass('public.cargo_offers') is not null then 'موجود' else 'غير موجود' end
union all
select 'مرجع driver_id في العروض',
       coalesce((select pg_get_constraintdef(c.oid) from pg_constraint c
                 where to_regclass('public.cargo_offers') is not null
                   and c.conrelid=to_regclass('public.cargo_offers') and c.contype='f'
                   and pg_get_constraintdef(c.oid) ilike '%driver_id%' limit 1), '—')
union all
select 'جدول profiles',
       coalesce((select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns
                 where table_schema='public' and table_name='profiles'), 'غير موجود');
