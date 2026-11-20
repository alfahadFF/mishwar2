-- تشخيص قراءة فقط لمشاكل الرحلات المشتركة والتكسي والإشعارات.
-- لا يحجز مقعداً ولا يغيّر أي بيانات. شغّل المقاطع بالترتيب، ثم أرسل النتائج.

-- 1) وجود الجداول الأساسية.
select x.object_name, to_regclass(x.object_name) is not null as exists
from (values
  ('public.taxi_shared_requests'),
  ('public.taxi_shared_trips'),
  ('public.user_notifications'),
  ('public.device_push_tokens'),
  ('public.taxi_driver_positions')
) as x(object_name);

-- 2) مشغّلات إشعار الرحلة المشتركة، وإشعارات الطلبات للمركبات من الفئة نفسها.
select c.relname as table_name, t.tgname as trigger_name,
       p.proname as function_name, t.tgenabled as enabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('taxi_shared_requests', 'user_notifications', 'taxi_orders')
order by c.relname, t.tgname;

-- 3) دوال RPC المطلوبة وصلاحية تنفيذها للمستخدم المسجّل.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('request_shared_join', 'driver_respond_join',
                    'passenger_answer_counter', 'driver_taxi_ping', 'nearby_taxis',
                    '_notify_shared_join', '_push_on_notification', '_push_on_taxi_new', '_push_send')
order by p.proname, arguments;

-- 4) هل جدول الطلبات المشتركة مضاف إلى Realtime؟
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('taxi_shared_requests', 'user_notifications');

-- 5) هل دالة الإرسال تستخدم إعداد القناة والصوت المتوقعين؟
select p.proname,
       p.prosrc ilike '%mishwar_notifications_v2%' as uses_shared_notification_channel,
       p.prosrc ilike '%sound%' as sets_notification_sound,
       p.prosrc ilike '%exp.host/--/api/v2/push/send%' as calls_expo_push
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = '_push_send';

-- 6) شغّل هذا المقطع فقط إذا كان public.device_push_tokens موجوداً.
-- يعرض أعداداً مجمّعة فقط، ولا يعرض الرموز أو معرّفات المستخدمين.
select coalesce(platform, 'غير محدد') as platform, count(*) as token_count,
       count(*) filter (where updated_at > now() - interval '30 days') as refreshed_last_30_days
from public.device_push_tokens
group by platform order by platform;

-- 7) شغّل هذا المقطع فقط إذا كان public.taxi_driver_positions موجوداً.
-- صفر حديث ضمن فئة السائق يساعد على كشف أن موقعه لم يُرسل خلال آخر دقيقتين.
select category, count(*) as drivers_seen_last_2_minutes
from public.taxi_driver_positions
where updated_at > now() - interval '2 minutes'
group by category order by category;
