-- الأمان والطوارئ (11): لا نرسل إحداثيات سيارات التكسي أو مسارها إلى تطبيق الراكب.
-- التوفّر يُعاد كأعداد مجمّعة ووقت وصول تقريبي حسب نطاق البحث فقط.
-- يظل فحص النطاق المكاني داخل قاعدة البيانات؛ لا تُعاد lat/lng أو via للعميل.

create or replace function public.nearby_taxis(
  p_lat double precision,
  p_lng double precision,
  p_radius int default 5
)
returns setof jsonb
language sql stable security definer set search_path = public as $$
  with eligible as (
    select d.category, (a.n > 0) as busy
      from public.taxi_driver_positions d
      cross join lateral (
        select count(*) as n
          from public.taxi_orders o
         where o.driver_id = d.driver_id
           and o.status in ('accepted','arrived','in_progress')
      ) a
     where d.updated_at > now() - interval '2 minutes'
       and d.driver_id is distinct from auth.uid()
       and a.n < 2
       and d.category = public._taxi_category(d.driver_id)
       and not public._taxi_suspended(d.driver_id)
       and not public.wallet_blocked(d.driver_id)
       and sqrt(
             power((d.lng - p_lng) * 111.32 * cos(radians(p_lat)), 2)
             + power((d.lat - p_lat) * 110.574, 2)
           ) <= case when p_radius >= 10 then 10 else 5 end
  )
  select jsonb_build_object(
           'cat', e.category,
           'free_count', count(*) filter (where not e.busy),
           'busy_count', count(*) filter (where e.busy),
           'eta_min', case
             when count(*) filter (where not e.busy) > 0
               then case when p_radius >= 10 then 10 else 5 end
             else null
           end,
           'eta_max', case
             when count(*) filter (where not e.busy) > 0
               then case when p_radius >= 10 then 25 else 15 end
             else null
           end
         )
    from eligible e
   group by e.category;
$$;
grant execute on function public.nearby_taxis(double precision, double precision, int) to authenticated;

-- لا يُرجع موقع السائق حتى بعد قبول الطلب. تبقى بياناته التعريفية متاحة بعد القبول فقط.
create or replace function public.my_taxi_active()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
      'id', o.id,
      'status', o.status,
      'fare', coalesce(o.final_fare, o.estimated_fare),
      'fare_local', o.fare_local,
      'local_currency', o.local_currency,
      'pricing_exchange_rate', o.pricing_exchange_rate,
      'commission_rate', o.commission_rate,
      'commission_local', o.commission_local,
      'driver_net_local', o.driver_net_local,
      'distance_km', o.distance_km,
      'duration_min', o.duration_min,
      'search_radius_km', o.search_radius_km,
      'category', o.vehicle_category,
      'pickup', jsonb_build_array(o.pickup_lat, o.pickup_lng),
      'dropoff', jsonb_build_array(o.dropoff_lat, o.dropoff_lng),
      'driver_name', case when o.status in ('accepted','arrived','in_progress') then p.full_name end,
      'vehicle_model', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_model end,
      'vehicle_color', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_color end,
      'vehicle_plate', case when o.status in ('accepted','arrived','in_progress') then p.vehicle_plate end,
      'discount_pct', public._wallet_discount_pct(),
      'completed_at', o.completed_at)
    from public.taxi_orders o
    left join public.profiles p on p.id = o.driver_id
   where o.user_id = auth.uid()
     and (o.status in ('pending','searching','accepted','arrived','in_progress')
          or (o.status = 'completed' and o.completed_at > now() - interval '1 day'
              and not exists (select 1 from public.wallet_payments w
                               where w.service = 'taxi' and w.ref_id = o.id)))
   order by o.created_at desc
   limit 1;
$$;
grant execute on function public.my_taxi_active() to authenticated;

-- تحقق بعد التحديث: المخرجات مجمّعة وخالية من مواقع السيارات ومسارها.
select
  'nearby_taxis: ملخص بلا إحداثيات/مسار' as check_name,
  case when position('''free_count''' in pg_get_functiondef(
                 'public.nearby_taxis(double precision,double precision,integer)'::regprocedure)) > 0
         and position('''busy_count''' in pg_get_functiondef(
                 'public.nearby_taxis(double precision,double precision,integer)'::regprocedure)) > 0
         and position('''lat''' in pg_get_functiondef(
                 'public.nearby_taxis(double precision,double precision,integer)'::regprocedure)) = 0
         and position('''lng''' in pg_get_functiondef(
                 'public.nearby_taxis(double precision,double precision,integer)'::regprocedure)) = 0
         and position('''via''' in pg_get_functiondef(
                 'public.nearby_taxis(double precision,double precision,integer)'::regprocedure)) = 0
       then 'مفعّل' else 'تحقّق مطلوب' end as result
union all
select
  'my_taxi_active: لا يعيد موقع السائق' as check_name,
  case when position('''driver_pos''' in pg_get_functiondef(
                 'public.my_taxi_active()'::regprocedure)) = 0
       then 'مفعّل' else 'تحقّق مطلوب' end as result;
