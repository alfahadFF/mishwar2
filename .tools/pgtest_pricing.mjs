// Local SQL integration test for taxi pricing migrations.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const root = '/home/user/Mishwar';
const db = new PGlite();
let passed = 0;
const ok = (condition, name) => { if (!condition) throw new Error(`FAIL ${name}`); console.log(`PASS ${name}`); passed++; };
await db.exec(`
  create role anon; create role authenticated; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table public.profiles(id uuid primary key, country text, type text, event_vehicle_type text,
    fuel text, engine_cc int, taxi_category text, luxury_requested boolean, is_admin boolean default false,
    full_name text, phone text, vehicle_model text, vehicle_color text);
  create table public.taxi_driver_positions(driver_id uuid, category text, updated_at timestamptz default now(),
    lat double precision, lng double precision);
  create table public.service_commissions(service text primary key, rate numeric(5,4) not null);
  insert into service_commissions values ('taxi',0.12),('taxi_shared',0.12),('cargo',0.12);
  create table public.taxi_orders(id uuid primary key default gen_random_uuid(), user_id uuid, driver_id uuid,
    pickup_lat double precision not null, pickup_lng double precision not null,
    dropoff_lat double precision not null, dropoff_lng double precision not null,
    distance_km numeric(8,2) not null, duration_min integer, vehicle_category text not null,
    estimated_fare numeric(10,2) not null, currency text default 'USD', fare_local numeric(14,2), local_currency text,
    pricing_country text, pricing_exchange_rate numeric(14,4), commission_rate numeric(6,4),
    commission_local numeric(14,2), driver_net_local numeric(14,2), final_fare numeric(10,2),
    status text default 'pending', search_radius_km integer default 5, created_at timestamptz default now(),
    accepted_at timestamptz, started_at timestamptz, completed_at timestamptz);
  create table public.wallets(user_id uuid primary key, balance numeric(12,2) not null default 0);
  create table public.wallet_transactions(id bigserial primary key, user_id uuid, service text, kind text,
    amount numeric(12,2), ref_id uuid, gross_amount numeric(12,2), created_at timestamptz default now());
  create table public.wallet_payments(service text, ref_id uuid);
  create table public.user_notifications(id bigserial primary key, user_id uuid, kind text, title text, body text, data jsonb);
  create table public.admin_notifications(id bigserial primary key, kind text, title text, body text, data jsonb);
  create function public._is_admin() returns boolean language sql stable as $$
    select auth.uid() is null or exists(select 1 from profiles where id=auth.uid() and is_admin) $$;
  create function public._notify_admins(k text,t text,b text,d jsonb) returns void language sql as $$
    insert into admin_notifications(kind,title,body,data) values(k,t,b,d) $$;
  create function public._wallet_discount_pct() returns numeric language sql stable as $$ select 3::numeric $$;
  create function public.free_until(p_user uuid) returns timestamptz language sql stable as $$ select null::timestamptz $$;
  create function public._amt(p numeric) returns text language sql immutable as $$ select coalesce(round(p,2)::text,'0') $$;
  create function public._wallet_charge(p_user uuid,p_service text,p_ref uuid,p_gross numeric)
    returns numeric language plpgsql security definer as $$
    declare v_rate numeric; v_fee numeric;
    begin
      select rate into v_rate from service_commissions where service=p_service;
      v_fee:=round(coalesce(v_rate,0)*p_gross,2);
      insert into wallets(user_id,balance) values(p_user,100) on conflict(user_id) do nothing;
      update wallets set balance=balance-v_fee where user_id=p_user;
      insert into wallet_transactions(user_id,service,kind,amount,ref_id,gross_amount)
        values(p_user,p_service,'commission',-v_fee,p_ref,p_gross);
      return v_fee;
    end $$;
  create function public._push_km(a double precision,b double precision,c double precision,d double precision)
    returns double precision language sql immutable as $$ select 0::double precision $$;
  create function public._push_new_orders_ok(u uuid) returns boolean language sql stable as $$ select true $$;
  create function public._taxi_suspended(u uuid) returns boolean language sql stable as $$ select false $$;
  create function public._push_send(u uuid[],t text,b text,d jsonb,k text) returns void language plpgsql as $$ begin return; end $$;
`);
for (const f of ['01.sql','02.sql','03.sql','04.sql']) {
  await db.exec(fs.readFileSync(`${root}/sql-pricing/${f}`,'utf8'));
}
const base = (await db.query(`select * from public.taxi_pricing_rules where id=1`)).rows[0];
ok(Number(base.minimum_distance_km)===3 && Number(base.minimum_fare_usd)===1.5 && Number(base.rate_per_km_usd)===0.34 && Number(base.rate_per_trip_minute_usd)===0.03,'global pricing constants seeded');
const sy = (await db.query(`select * from public.taxi_pricing_countries where country_code='SY'`)).rows[0];
ok(Number(sy.previous_exchange_rate)===13200 && Number(sy.pricing_exchange_rate)===132 && Number(sy.rounding_unit)===10 && sy.enabled===true && sy.auto_update_exchange_rate===false,'Syria rate reflects two removed zeros and ten-unit rounding');
const rates = (await db.query(`select service,rate::float8 rate from service_commissions where service in ('taxi','taxi_shared','cargo') order by service`)).rows;
ok(rates.find(x=>x.service==='taxi').rate===0.1 && rates.find(x=>x.service==='taxi_shared').rate===0.1 && rates.find(x=>x.service==='cargo').rate===0.12,'10 percent applies to both taxi services; other service rates stay unchanged');
const surface=(await db.query(`select to_regprocedure('public.taxi_price_quotes(numeric,numeric)') is not null quotes,
 to_regprocedure('public.admin_taxi_pricing_settings()') is not null settings,
 to_regprocedure('public.admin_save_taxi_exchange_rate(text,numeric,numeric,numeric)') is not null fx,
 (select count(*)=8 from information_schema.columns where table_schema='public' and table_name='taxi_orders'
   and column_name in ('duration_min','fare_local','local_currency','pricing_country','pricing_exchange_rate','commission_rate','commission_local','driver_net_local')) cols,
 exists(select 1 from pg_trigger where tgname='trg_taxi_sync_price' and not tgisinternal) trigger`)).rows[0];
ok(Object.values(surface).every(Boolean),'price RPCs, fare columns, and sync trigger registered');
const short = (await db.query(`select public._taxi_price_quote(3,60,'luxury','SY') q`)).rows[0].q;
ok(Number(short.fare_usd)===1.5 && Number(short.fare_local)===200 && Number(short.commission_local)===20 && Number(short.driver_net_local)===180,'up to 3 km uses fixed minimum and rounds local fare');
const standard = (await db.query(`select public._taxi_price_quote(4,10,'ordinary','SY') q`)).rows[0].q;
ok(Number(standard.fare_usd)===3.16 && Number(standard.fare_local)===420 && Number(standard.commission_local)===42 && Number(standard.driver_net_local)===378,'standard formula uses distance and expected duration');
const van8 = (await db.query(`select public._taxi_price_quote(4,10,'van_8','SY') q`)).rows[0].q;
const van11 = (await db.query(`select public._taxi_price_quote(4,10,'van_11','SY') q`)).rows[0].q;
ok(Number(van8.fare_usd)===Number(van11.fare_usd) && Number(van8.fare_local)===550,'both van capacities use the independent 1.60 multiplier');
const uid='11111111-1111-1111-1111-111111111111', driver='22222222-2222-2222-2222-222222222222', admin='33333333-3333-3333-3333-333333333333';
await db.exec(`insert into profiles(id,country,type,event_vehicle_type,fuel,engine_cc,taxi_category,is_admin,full_name,phone)
 values ('${uid}','SY','personal',null,null,null,null,false,'راكب','+963911111111'),
 ('${driver}','SY','driver','car','hybrid',1800,'ordinary',false,'سائق','+963922222222'),
 ('${admin}','SY','admin',null,null,null,null,true,'إدارة','+963933333333');
 insert into wallets(user_id,balance) values ('${driver}',100);`);
await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
const inserted=(await db.query(`insert into taxi_orders(user_id,driver_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,duration_min,vehicle_category,estimated_fare,status)
 values ('${uid}','${driver}',33.5,36.2,33.6,36.3,4,10,'ordinary',999,'in_progress') returning id,estimated_fare,fare_local,pricing_exchange_rate,commission_local,driver_net_local,currency`)).rows[0];
ok(Number(inserted.estimated_fare)===3.16 && Number(inserted.fare_local)===420 && Number(inserted.pricing_exchange_rate)===132 && inserted.currency==='USD','insert trigger recalculates and snapshots USD billing plus local quote');
await db.exec(`update public.taxi_pricing_countries set pricing_exchange_rate=140 where country_code='SY'; update taxi_orders set status='accepted' where id='${inserted.id}'`);
const old=(await db.query(`select fare_local,pricing_exchange_rate from taxi_orders where id='${inserted.id}'`)).rows[0];
ok(Number(old.fare_local)===420 && Number(old.pricing_exchange_rate)===132,'status changes preserve the original quote and exchange rate');
await db.exec(`select set_config('request.jwt.claim.sub','${driver}',false); update taxi_orders set status='in_progress' where id='${inserted.id}'`);
await db.exec(`create or replace function public.free_until(p_user uuid) returns timestamptz language sql stable as $$ select now()+interval '1 day' $$`);
const freeTrip=(await db.query(`select public.driver_taxi_active() v`)).rows[0].v;
ok(freeTrip.commission_waived===true && Number(freeTrip.commission_local)===0 && Number(freeTrip.driver_net_local)===420,'active driver view reflects commission-free period');
await db.exec(`create or replace function public.free_until(p_user uuid) returns timestamptz language sql stable as $$ select null::timestamptz $$`);
const completed=(await db.query(`select public.driver_taxi_complete($1) v`,[inserted.id])).rows[0].v;
const driverFee=(await db.query(`select amount::float8 amount from wallet_transactions where user_id='${driver}' and service='taxi' order by id desc limit 1`)).rows[0].amount;
ok(completed.status==='completed' && Number(completed.commission)===0.32 && Number(completed.commission_local)===42 && Number(completed.driver_net_local)===378 && driverFee===-0.32,'driver completion charges 10 percent in USD and reports matching local net');
await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
const alert=(await db.query(`select admin_save_taxi_exchange_rate('SY',132,137,10) v`)).rows[0].v;
const saved=(await db.query(`select pricing_exchange_rate,market_exchange_rate,rounding_unit from taxi_pricing_countries where country_code='SY'`)).rows[0];
ok(alert.alert===true && Number(alert.deviation_percent)>3 && Number(saved.pricing_exchange_rate)===132 && Number(saved.market_exchange_rate)===137,'manual market rate above 3 percent alerts without changing pricing rate');
const notif=(await db.query(`select count(*)::int n from admin_notifications where kind='taxi_exchange_rate_review'`)).rows[0].n;
ok(notif===1,'exchange-rate review creates one admin alert');
console.log(`
${passed} pricing checks passed`);
await db.close();
