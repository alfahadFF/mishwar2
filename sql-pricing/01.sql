-- تسعير التكسي (1 من 4): الإعدادات العامة، أسعار الصرف، وأعمدة حفظ عرض السعر
create table if not exists public.taxi_pricing_rules (
  id smallint primary key default 1 check (id = 1),
  pricing_currency text not null default 'USD',
  minimum_distance_km numeric(8,2) not null default 3,
  minimum_fare_usd numeric(10,2) not null default 1.50,
  base_fare_usd numeric(10,2) not null default 1.50,
  rate_per_km_usd numeric(10,4) not null default 0.34,
  rate_per_trip_minute_usd numeric(10,4) not null default 0.03,
  vehicle_multipliers jsonb not null default '{"economic":0.90,"standard":1.00,"luxury":1.20,"van":1.60}'::jsonb,
  engine_classes jsonb not null default '{"economic_max_cc":1399,"standard_min_cc":1400,"standard_max_cc":2000,"luxury_min_cc":2001}'::jsonb,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.taxi_pricing_rules(id) values (1) on conflict (id) do nothing;

create table if not exists public.taxi_pricing_countries (
  country_code text primary key check (country_code in ('SY','IQ','LB','JO')),
  currency_code text not null,
  pricing_exchange_rate numeric(14,4),
  previous_exchange_rate numeric(14,4),
  market_exchange_rate numeric(14,4),
  rounding_unit numeric(14,4),
  exchange_rate_alert_threshold numeric(6,4) not null default 0.03,
  auto_update_exchange_rate boolean not null default false,
  enabled boolean not null default false,
  alerted_market_rate numeric(14,4),
  updated_at timestamptz not null default now(),
  check (pricing_exchange_rate is null or pricing_exchange_rate > 0),
  check (market_exchange_rate is null or market_exchange_rate > 0),
  check (rounding_unit is null or rounding_unit > 0)
);
insert into public.taxi_pricing_countries
  (country_code,currency_code,pricing_exchange_rate,previous_exchange_rate,rounding_unit,exchange_rate_alert_threshold,auto_update_exchange_rate,enabled)
values
  ('SY','SYP',132,13200,10,0.03,false,true),
  ('IQ','IQD',null,null,null,0.03,false,false),
  ('LB','LBP',null,null,null,0.03,false,false),
  ('JO','JOD',null,null,null,0.03,false,false)
on conflict (country_code) do nothing;

alter table public.taxi_pricing_rules enable row level security;
alter table public.taxi_pricing_countries enable row level security;
revoke all on public.taxi_pricing_rules, public.taxi_pricing_countries from anon, authenticated;

insert into public.service_commissions(service,rate) values ('taxi',0.10),('taxi_shared',0.10)
on conflict (service) do update set rate=excluded.rate;

alter table public.taxi_orders
  add column if not exists duration_min integer,
  add column if not exists fare_local numeric(14,2),
  add column if not exists local_currency text,
  add column if not exists pricing_country text,
  add column if not exists pricing_exchange_rate numeric(14,4),
  add column if not exists commission_rate numeric(6,4),
  add column if not exists commission_local numeric(14,2),
  add column if not exists driver_net_local numeric(14,2),
  add column if not exists currency text not null default 'USD';

-- يصنّف الهايبرد حسب سعة المحرك، والكهربائي اقتصادياً لعدم وجود سعة CC حرارية.
create or replace function public._car_category(p_fuel text,p_cc int)
returns text language sql stable security definer set search_path=public as $$
  select case when p_fuel='electric' or p_cc is null or p_cc <= 1399 then 'economy'
              when p_cc <= 2000 then 'ordinary' else 'luxury' end;
$$;
revoke all on function public._car_category(text,int) from public,anon,authenticated;

update public.profiles set taxi_category=public._car_category(fuel,engine_cc),luxury_requested=null
 where type::text='driver' and event_vehicle_type='car' and (engine_cc is not null or fuel='electric');
update public.taxi_driver_positions t set category=p.taxi_category
  from public.profiles p where p.id=t.driver_id and p.event_vehicle_type='car' and p.taxi_category is not null;
