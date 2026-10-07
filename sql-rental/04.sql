-- التأجير (4 من 11): البحث للزبون (بدون أي هوية — المسافة فقط)
create or replace function public._rental_km(a_lat float8, a_lng float8, b_lat float8, b_lng float8)
returns numeric language sql immutable as $$
  select round((6371 * 2 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2)
         + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))::numeric, 1);
$$;


create or replace function public._rental_public(l rental_listings, p_lat float8, p_lng float8)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'brand_model', l.brand_model, 'year', l.year, 'transmission', l.transmission,
           'seats', l.seats, 'color', l.color, 'fuel', l.fuel, 'ac', l.ac, 'photos', l.photos, 'conditions', l.conditions,
           'pricing_mode', l.pricing_mode, 'units', l.units, 'prices', l.prices, 'status', l.status,
           'approx', jsonb_build_array(round(l.lat::numeric, 2), round(l.lng::numeric, 2)),
           'km', case when p_lat is not null then public._rental_km(p_lat, p_lng, l.lat, l.lng) end);
$$;
revoke execute on function public._rental_public(rental_listings, float8, float8) from public, anon, authenticated;

create or replace function public.rental_search(p_lat float8, p_lng float8, p_unit text default null)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select public._rental_public(l, p_lat, p_lng)
    from rental_listings l
   where l.status = 'active'
     and l.provider_id is distinct from auth.uid()
     and (p_unit is null or p_unit = any(l.units))
     and not public.wallet_blocked(l.provider_id)
     and public._rental_km(p_lat, p_lng, l.lat, l.lng) <= 50
   order by public._rental_km(p_lat, p_lng, l.lat, l.lng)
   limit 100;
$$;
grant execute on function public.rental_search(float8, float8, text) to authenticated;

create or replace function public.rental_listing_view(p_id uuid, p_lat float8, p_lng float8)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._rental_public(l, p_lat, p_lng) || jsonb_build_object('mine', l.provider_id = auth.uid())
    from rental_listings l where l.id = p_id and l.status <> 'deleted';
$$;
grant execute on function public.rental_listing_view(uuid, float8, float8) to authenticated;
