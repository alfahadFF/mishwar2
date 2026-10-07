-- التقييم (6 من 7): تقييمي لمقدم الخدمة + نجوم العروض للزبون (بدون كشف الهوية)
create or replace function public.my_rating_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select public._provider_rating(auth.uid()) || jsonb_build_object(
    'tags', coalesce((select jsonb_object_agg(t, c) from (
               select t, count(*) c from provider_reviews r, unnest(r.tags) t
                where r.provider_id = auth.uid() and r.status = 'done' group by t) x), '{}'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('stars', stars, 'tags', tags, 'service', service, 'at', rated_at) order by rated_at desc)
                          from (select * from provider_reviews where provider_id = auth.uid() and status = 'done'
                                 order by rated_at desc limit 20) y), '[]'::jsonb));
$$;
grant execute on function public.my_rating_summary() to authenticated;

-- p_kind: rental_listing | cargo_offer | event_offer | contract_offer | shared_trip | taxi_order
-- الناتج: {المعرّف: {avg, n}} بدون أي هوية
create or replace function public.rating_badges(p_kind text, p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.id, public._provider_rating(x.pid)), '{}'::jsonb)
    from (
      select id, provider_id pid from rental_listings where p_kind = 'rental_listing' and id = any(p_ids)
      union all select id, driver_id from cargo_offers where p_kind = 'cargo_offer' and id = any(p_ids)
      union all select id, driver_id from event_offers where p_kind = 'event_offer' and id = any(p_ids)
      union all select id, driver_id from contract_offers where p_kind = 'contract_offer' and id = any(p_ids)
      union all select id, driver_id from taxi_shared_trips where p_kind = 'shared_trip' and id = any(p_ids)
      union all select id, driver_id from taxi_orders where p_kind = 'taxi_order' and id = any(p_ids)
                 and (user_id = auth.uid() or driver_id = auth.uid())
    ) x where x.pid is not null and cardinality(p_ids) <= 200;
$$;
grant execute on function public.rating_badges(text, uuid[]) to authenticated;
