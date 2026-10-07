-- فحص سريع بعد تنفيذ taxi-shared-route-join.sql (قراءة فقط — لا يغيّر شيئاً)
select 'الدوال' as الفحص,
       string_agg(proname, ', ' order by proname) as النتيجة,
       case when count(*) = 6 then '✅' else '❌ ناقص' end as الحالة
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('km_to_polyline','_take_seat','request_shared_join','driver_respond_join','passenger_answer_counter','passenger_cancel_join')
union all
select 'أعمدة الطلبات',
       string_agg(column_name, ', ' order by column_name),
       case when count(*) >= 8 then '✅' else '❌ ناقص' end
from information_schema.columns
where table_schema = 'public' and table_name = 'taxi_shared_requests'
  and column_name in ('pickup_lat','pickup_lng','dropoff_lat','dropoff_lng','detour_km','detour_min','detour_polyline','extra_fee','join_type')
union all
select 'أعمدة الرحلات',
       string_agg(column_name, ', ' order by column_name),
       case when count(*) >= 3 then '✅' else '❌ ناقص' end
from information_schema.columns
where table_schema = 'public' and table_name = 'taxi_shared_trips'
  and column_name in ('route_polyline','distance_km','duration_min','waypoints')
union all
select 'البث المباشر (Realtime)',
       coalesce(string_agg(tablename, ', '), 'غير مفعّل'),
       case when count(*) = 1 then '✅' else '❌' end
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'taxi_shared_requests'
union all
select 'Replica identity',
       case relreplident when 'f' then 'full' when 'd' then 'default' else relreplident::text end,
       case when relreplident = 'f' then '✅' else '❌' end
from pg_class where oid = 'public.taxi_shared_requests'::regclass
union all
select 'حالات الطلب المسموحة',
       pg_get_constraintdef(oid),
       case when pg_get_constraintdef(oid) like '%cancelled%' and pg_get_constraintdef(oid) like '%counter%' then '✅' else '❌' end
from pg_constraint where conname = 'taxi_shared_requests_status_check';
