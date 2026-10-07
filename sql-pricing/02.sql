-- تسعير التكسي (2 من 4): معادلة السعر بالدولار، والتحويل/التقريب المحلي، وحماية الطلب
create or replace function public._taxi_price_quote(p_distance numeric,p_minutes numeric,p_category text,p_country text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.taxi_pricing_rules%rowtype; c public.taxi_pricing_countries%rowtype;
  v_group text; v_multiplier numeric; v_commission numeric; v_fare_usd numeric;
  v_fare_local numeric; v_commission_usd numeric; v_commission_local numeric;
begin
  select * into r from public.taxi_pricing_rules where id=1;
  if not found or not r.is_active then raise exception 'TAXI_PRICING_DISABLED'; end if;
  select * into c from public.taxi_pricing_countries where country_code=p_country and enabled;
  if not found or c.pricing_exchange_rate is null or c.rounding_unit is null then
    raise exception 'TAXI_PRICING_UNAVAILABLE';
  end if;
  if p_distance is null or p_distance < 0 or coalesce(p_minutes,0) < 0 then raise exception 'BAD_TAXI_ROUTE'; end if;
  v_group := case p_category when 'economy' then 'economic' when 'ordinary' then 'standard'
    when 'luxury' then 'luxury' when 'van_8' then 'van' when 'van_11' then 'van' end;
  if v_group is null then raise exception 'BAD_TAXI_CATEGORY'; end if;
  v_multiplier := (r.vehicle_multipliers->>v_group)::numeric;
  if v_multiplier is null then raise exception 'TAXI_PRICING_CONFIG_INVALID'; end if;
  if p_distance <= r.minimum_distance_km then
    v_fare_usd := r.minimum_fare_usd;
  else
    v_fare_usd := r.base_fare_usd + ((p_distance*r.rate_per_km_usd)
      + (coalesce(p_minutes,0)*r.rate_per_trip_minute_usd))*v_multiplier;
  end if;
  v_fare_usd := round(v_fare_usd,2);
  select rate into v_commission from public.service_commissions where service='taxi';
  v_commission := coalesce(v_commission,0.10);
  v_fare_local := round((v_fare_usd*c.pricing_exchange_rate)/c.rounding_unit)*c.rounding_unit;
  v_commission_usd := round(v_fare_usd*v_commission,2);
  v_commission_local := round(v_fare_local*v_commission,2);
  return jsonb_build_object('fare_usd',v_fare_usd,'fare_local',v_fare_local,
    'currency',c.currency_code,'country_code',c.country_code,'exchange_rate',c.pricing_exchange_rate,
    'rounding_unit',c.rounding_unit,'commission_rate',v_commission,
    'commission_usd',v_commission_usd,'commission_local',v_commission_local,
    'driver_net_usd',v_fare_usd-v_commission_usd,'driver_net_local',v_fare_local-v_commission_local);
end; $$;
revoke all on function public._taxi_price_quote(numeric,numeric,text,text) from public,anon,authenticated;

create or replace function public.taxi_price_quotes(p_distance_km numeric,p_duration_minutes numeric)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_country text; c public.taxi_pricing_countries%rowtype; r public.taxi_pricing_rules%rowtype;
begin
  select country into v_country from public.profiles where id=auth.uid();
  if v_country is null then v_country:='SY'; end if;
  select * into c from public.taxi_pricing_countries where country_code=v_country;
  select * into r from public.taxi_pricing_rules where id=1;
  if not found or not r.is_active then raise exception 'TAXI_PRICING_DISABLED'; end if;
  if c.country_code is null or not c.enabled then raise exception 'TAXI_PRICING_UNAVAILABLE'; end if;
  return jsonb_build_object('country_code',v_country,'currency',c.currency_code,
    'pricing_exchange_rate',c.pricing_exchange_rate,'rounding_unit',c.rounding_unit,
    'minimum_distance_km',r.minimum_distance_km,'minimum_fare_usd',r.minimum_fare_usd,
    'base_fare_usd',r.base_fare_usd,'rate_per_km_usd',r.rate_per_km_usd,
    'rate_per_trip_minute_usd',r.rate_per_trip_minute_usd,'vehicle_multipliers',r.vehicle_multipliers,
    'commission_rate',coalesce((select rate from public.service_commissions where service='taxi'),0.10),
    'quotes',jsonb_build_object(
      'ordinary',public._taxi_price_quote(p_distance_km,p_duration_minutes,'ordinary',v_country),
      'economy',public._taxi_price_quote(p_distance_km,p_duration_minutes,'economy',v_country),
      'luxury',public._taxi_price_quote(p_distance_km,p_duration_minutes,'luxury',v_country),
      'van_8',public._taxi_price_quote(p_distance_km,p_duration_minutes,'van_8',v_country),
      'van_11',public._taxi_price_quote(p_distance_km,p_duration_minutes,'van_11',v_country)));
end; $$;
revoke all on function public.taxi_price_quotes(numeric,numeric) from public;
grant execute on function public.taxi_price_quotes(numeric,numeric) to anon,authenticated;

create or replace function public._taxi_sync_price()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_country text; q jsonb;
begin
  if tg_op='UPDATE' and new.user_id is not distinct from old.user_id
    and new.distance_km is not distinct from old.distance_km
    and new.duration_min is not distinct from old.duration_min
    and new.vehicle_category is not distinct from old.vehicle_category then
    new.estimated_fare:=old.estimated_fare; new.currency:=old.currency;
    new.fare_local:=old.fare_local; new.local_currency:=old.local_currency;
    new.pricing_country:=old.pricing_country; new.pricing_exchange_rate:=old.pricing_exchange_rate;
    new.commission_rate:=old.commission_rate; new.commission_local:=old.commission_local;
    new.driver_net_local:=old.driver_net_local; return new;
  end if;
  select country into v_country from public.profiles where id=new.user_id;
  if v_country is null then v_country:='SY'; end if;
  q:=public._taxi_price_quote(new.distance_km,new.duration_min,new.vehicle_category,v_country);
  new.estimated_fare:=(q->>'fare_usd')::numeric; new.currency:='USD';
  new.fare_local:=(q->>'fare_local')::numeric; new.local_currency:=q->>'currency';
  new.pricing_country:=v_country; new.pricing_exchange_rate:=(q->>'exchange_rate')::numeric;
  new.commission_rate:=(q->>'commission_rate')::numeric;
  new.commission_local:=(q->>'commission_local')::numeric;
  new.driver_net_local:=(q->>'driver_net_local')::numeric;
  return new;
end; $$;
revoke all on function public._taxi_sync_price() from public,anon,authenticated;
drop trigger if exists trg_taxi_sync_price on public.taxi_orders;
create trigger trg_taxi_sync_price before insert or update on public.taxi_orders
for each row execute function public._taxi_sync_price();
