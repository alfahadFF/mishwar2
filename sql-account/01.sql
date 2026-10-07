-- حسابي (1 من 4): صور التأجير — صورة واحدة على الأقل وحتى 3
create or replace function public.save_rental_listing(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_units text[]; v_prices jsonb := '{}'::jsonb; u text; v_price numeric; v_id uuid; v_cond text[]; v_photos jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  foreach u in array array['front','back','side'] loop
    if coalesce(p->'photos'->>u, '') <> '' then v_photos := v_photos || jsonb_build_object(u, p->'photos'->>u); end if;
  end loop;
  if v_photos = '{}'::jsonb then raise exception 'RENTAL_PHOTOS'; end if;
  if coalesce(trim(p->>'brand_model'), '') = '' or p->>'lat' is null or p->>'lng' is null then raise exception 'RENTAL_MISSING'; end if;
  select array_agg(distinct x) into v_units from jsonb_array_elements_text(coalesce(p->'units', '[]'::jsonb)) x
   where x in ('hour','day','week','month');
  if v_units is null then raise exception 'RENTAL_NO_UNITS'; end if;
  foreach u in array v_units loop
    v_price := nullif(p->'prices'->>u, '')::numeric;
    if v_price is not null and v_price <= 0 then v_price := null; end if;
    if p->>'pricing_mode' = 'fixed' and v_price is null then raise exception 'RENTAL_FIXED_PRICE'; end if;
    if v_price is not null then v_prices := v_prices || jsonb_build_object(u, v_price); end if;
  end loop;
  select coalesce(array_agg(distinct x), '{}') into v_cond from jsonb_array_elements_text(coalesce(p->'conditions', '[]'::jsonb)) x
   where x in ('license','id','deposit','age21','fuel_same','no_smoking','contract');
  if p_id is null then
    insert into rental_listings(provider_id, brand_model, year, transmission, seats, color, fuel, ac, photos, lat, lng,
                                conditions, pricing_mode, units, prices)
    values (auth.uid(), trim(p->>'brand_model'), (p->>'year')::int, p->>'transmission', (p->>'seats')::int,
            nullif(trim(p->>'color'), ''), nullif(p->>'fuel', ''), (p->>'ac')::boolean, v_photos,
            (p->>'lat')::float8, (p->>'lng')::float8, v_cond, p->>'pricing_mode', v_units, v_prices)
    returning id into v_id;
  else
    update rental_listings set brand_model = trim(p->>'brand_model'), year = (p->>'year')::int, transmission = p->>'transmission',
           seats = (p->>'seats')::int, color = nullif(trim(p->>'color'), ''), fuel = nullif(p->>'fuel', ''), ac = (p->>'ac')::boolean,
           photos = v_photos, lat = (p->>'lat')::float8, lng = (p->>'lng')::float8, conditions = v_cond,
           pricing_mode = p->>'pricing_mode', units = v_units, prices = v_prices, updated_at = now()
     where id = p_id and provider_id = auth.uid() and status in ('active','paused')
     returning id into v_id;
    if v_id is null then raise exception 'NOT_ALLOWED'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end; $$;
grant execute on function public.save_rental_listing(uuid, jsonb) to authenticated;
revoke execute on function public.save_rental_listing(uuid, jsonb) from anon;
