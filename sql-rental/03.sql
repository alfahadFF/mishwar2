-- التأجير (3 من 11): نشر الإعلان وتعديله وإيقافه وإعادة نشره
create or replace function public.save_rental_listing(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_units text[]; v_prices jsonb := '{}'::jsonb; u text; v_price numeric; v_id uuid; v_cond text[];
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if coalesce(p->'photos'->>'front', '') = '' or coalesce(p->'photos'->>'back', '') = '' or coalesce(p->'photos'->>'side', '') = '' then
    raise exception 'RENTAL_PHOTOS'; end if;
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
            nullif(trim(p->>'color'), ''), nullif(p->>'fuel', ''), (p->>'ac')::boolean,
            jsonb_build_object('front', p->'photos'->>'front', 'back', p->'photos'->>'back', 'side', p->'photos'->>'side'),
            (p->>'lat')::float8, (p->>'lng')::float8, v_cond, p->>'pricing_mode', v_units, v_prices)
    returning id into v_id;
  else
    update rental_listings set brand_model = trim(p->>'brand_model'), year = (p->>'year')::int, transmission = p->>'transmission',
           seats = (p->>'seats')::int, color = nullif(trim(p->>'color'), ''), fuel = nullif(p->>'fuel', ''), ac = (p->>'ac')::boolean,
           photos = jsonb_build_object('front', p->'photos'->>'front', 'back', p->'photos'->>'back', 'side', p->'photos'->>'side'),
           lat = (p->>'lat')::float8, lng = (p->>'lng')::float8, conditions = v_cond, pricing_mode = p->>'pricing_mode',
           units = v_units, prices = v_prices, updated_at = now()
     where id = p_id and provider_id = auth.uid() and status in ('active','paused')
     returning id into v_id;
    if v_id is null then raise exception 'NOT_ALLOWED'; end if;
  end if;
  return jsonb_build_object('id', v_id);
end; $$;
grant execute on function public.save_rental_listing(uuid, jsonb) to authenticated;

-- pause: إيقاف مؤقت • activate: تفعيل • republish: تم الاستلام — إعادة نشر • delete: حذف
create or replace function public.rental_listing_action(p_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l rental_listings;
begin
  select * into l from rental_listings where id = p_id and provider_id = auth.uid() for update;
  if l.id is null or l.status = 'deleted' then raise exception 'NOT_ALLOWED'; end if;
  if p_action = 'pause' and l.status = 'active' then
    update rental_listings set status = 'paused', updated_at = now() where id = l.id;
    update rental_requests set status = 'rejected', reason = 'paused' where listing_id = l.id and status = 'pending';
    update rental_general_offers set status = 'cancelled' where listing_id = l.id and status = 'pending';
  elsif p_action = 'activate' and l.status = 'paused' then
    update rental_listings set status = 'active', updated_at = now() where id = l.id;
  elsif p_action = 'republish' and l.status = 'rented' then
    perform public.rental_settle_my_dues();
    update rental_requests set ended_at = now() where id = l.rented_request and ended_at is null;
    update rental_listings set status = 'active', rented_request = null, updated_at = now() where id = l.id;
  elsif p_action = 'delete' and l.status in ('active','paused') then
    update rental_listings set status = 'deleted', updated_at = now() where id = l.id;
    update rental_requests set status = 'rejected', reason = 'deleted' where listing_id = l.id and status = 'pending';
    update rental_general_offers set status = 'cancelled' where listing_id = l.id and status = 'pending';
  else raise exception 'BAD_STEP';
  end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.rental_listing_action(uuid, text) to authenticated;
