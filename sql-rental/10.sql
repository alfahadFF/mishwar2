-- التأجير (10 من 11): سياراتي وطلباتي عند المؤجّر + طلباتي عند الزبون
create or replace function public.my_rental_listings()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select public._rental_public(l, null, null) || jsonb_build_object('lat', l.lat, 'lng', l.lng,
           'pending', (select count(*) from rental_requests q where q.listing_id = l.id and q.status = 'pending'),
           'booking', (select jsonb_build_object('request_id', q.id, 'customer_name', p.full_name, 'customer_phone', p.phone,
                              'unit', q.unit, 'unit_count', q.unit_count, 'start_at', q.start_at,
                              'end_at', public._rental_end(q.start_at, q.unit, q.unit_count), 'total', q.total,
                              'months_charged', q.months_charged, 'commission_total', q.commission_total)
                         from rental_requests q left join profiles p on p.id = q.customer_id where q.id = l.rented_request))
    from rental_listings l where l.provider_id = auth.uid() and l.status <> 'deleted'
   order by l.created_at desc;
$$;
grant execute on function public.my_rental_listings() to authenticated;

-- طلبات واصلة للمؤجّر: بدون هوية الزبون قبل الموافقة
create or replace function public.rental_provider_requests()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', q.id, 'listing_id', l.id, 'brand_model', l.brand_model, 'year', l.year,
           'unit', q.unit, 'unit_count', q.unit_count, 'start_at', q.start_at,
           'end_at', public._rental_end(q.start_at, q.unit, q.unit_count), 'unit_price', q.unit_price, 'total', q.total,
           'listed_price', nullif(l.prices->>q.unit, '')::numeric, 'created_at', q.created_at)
    from rental_requests q join rental_listings l on l.id = q.listing_id
   where q.provider_id = auth.uid() and q.status = 'pending'
   order by q.created_at desc;
$$;
grant execute on function public.rental_provider_requests() to authenticated;

-- طلبات الزبون: بيانات المؤجّر (الاسم والرقم) تظهر بعد القبول فقط
create or replace function public.my_rentals()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'reason', q.reason,
                   'unit', q.unit, 'unit_count', q.unit_count, 'start_at', q.start_at,
                   'end_at', public._rental_end(q.start_at, q.unit, q.unit_count), 'unit_price', q.unit_price, 'total', q.total,
                   'listing', public._rental_public(l, null, null),
                   'provider_name', case when q.status = 'accepted' then p.full_name end,
                   'provider_phone', case when q.status = 'accepted' then p.phone end,
                   'car_location', case when q.status = 'accepted' then jsonb_build_array(l.lat, l.lng) end) order by q.created_at desc)
               from rental_requests q join rental_listings l on l.id = q.listing_id left join profiles p on p.id = q.provider_id
              where q.customer_id = auth.uid() and q.created_at > now() - interval '60 days'), '[]'::jsonb),
    'generals', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'unit', g.unit, 'unit_count', g.unit_count,
                   'start_at', g.start_at, 'unit_price', g.unit_price, 'total', round(g.unit_price * g.unit_count, 2),
                   'offers', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id)
                                || jsonb_build_object('listing', public._rental_public(l, g.lat, g.lng))), '[]'::jsonb)
                                from rental_general_offers o join rental_listings l on l.id = o.listing_id
                               where o.general_id = g.id and o.status = 'pending' and l.status = 'active')) order by g.created_at desc)
               from rental_general g
              where g.customer_id = auth.uid() and g.status = 'open' and g.start_at > now() - interval '15 minutes'), '[]'::jsonb));
$$;
grant execute on function public.my_rentals() to authenticated;
