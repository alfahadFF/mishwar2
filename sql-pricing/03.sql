-- تسعير التكسي (3 من 4): قراءة إعدادات الإدارة وتحديث يدوي مع تنبيه فرق الصرف
create or replace function public.admin_taxi_pricing_settings()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.taxi_pricing_rules%rowtype;
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  select * into r from public.taxi_pricing_rules where id=1;
  return jsonb_build_object('rules',to_jsonb(r),'countries',
    (select coalesce(jsonb_agg(to_jsonb(c) order by c.country_code),'[]'::jsonb)
       from public.taxi_pricing_countries c));
end; $$;

create or replace function public.admin_save_taxi_exchange_rate(
  p_country_code text,p_pricing_rate numeric,p_market_rate numeric,p_rounding_unit numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.taxi_pricing_countries%rowtype; v_rate numeric; v_market numeric;
  v_round numeric; v_deviation numeric; v_alert boolean:=false; v_alerted numeric;
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_country_code not in ('SY','IQ','LB','JO') then raise exception 'BAD_COUNTRY'; end if;
  if (p_pricing_rate is not null and (p_pricing_rate<=0 or p_pricing_rate>1000000000))
    or (p_market_rate is not null and (p_market_rate<=0 or p_market_rate>1000000000))
    or (p_rounding_unit is not null and (p_rounding_unit<=0 or p_rounding_unit>1000000000)) then
    raise exception 'BAD_EXCHANGE_RATE';
  end if;
  select * into c from public.taxi_pricing_countries where country_code=p_country_code for update;
  if not found then raise exception 'BAD_COUNTRY'; end if;
  v_rate:=coalesce(p_pricing_rate,c.pricing_exchange_rate);
  v_market:=p_market_rate;
  v_round:=coalesce(p_rounding_unit,c.rounding_unit);
  if v_rate is not null and v_market is not null then
    v_deviation:=abs(v_market-v_rate)/v_rate;
    if v_deviation>c.exchange_rate_alert_threshold then
      v_alert:=c.alerted_market_rate is distinct from v_market;
      v_alerted:=v_market;
    else v_alerted:=null; end if;
  else v_alerted:=null; end if;
  update public.taxi_pricing_countries set pricing_exchange_rate=v_rate,market_exchange_rate=v_market,
    rounding_unit=v_round,enabled=(v_rate is not null and v_round is not null),
    alerted_market_rate=v_alerted,updated_at=now()
   where country_code=p_country_code;
  if v_alert then
    perform public._notify_admins('taxi_exchange_rate_review','مراجعة سعر الصرف',
      'تجاوز سعر السوق المعتمد فرق 3%. راجع السعر يدوياً؛ لم يتغير سعر التسعير تلقائياً.',
      jsonb_build_object('country',p_country_code,'pricing_rate',v_rate,'market_rate',v_market,
        'deviation_percent',round(v_deviation*100,2)));
  end if;
  return jsonb_build_object('alert',coalesce(v_deviation>c.exchange_rate_alert_threshold,false),
    'deviation_percent',case when v_deviation is null then null else round(v_deviation*100,2) end,
    'pricing_exchange_rate',v_rate,'market_exchange_rate',v_market,'rounding_unit',v_round);
end; $$;

revoke all on function public.admin_taxi_pricing_settings() from public,anon;
revoke all on function public.admin_save_taxi_exchange_rate(text,numeric,numeric,numeric) from public,anon;
grant execute on function public.admin_taxi_pricing_settings() to authenticated;
grant execute on function public.admin_save_taxi_exchange_rate(text,numeric,numeric,numeric) to authenticated;
