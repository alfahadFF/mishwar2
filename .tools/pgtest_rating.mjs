// اختبار دفع التكسي على Postgres (PGlite). التشغيل: cd /tmp/pg && node /home/user/.tools/pgtest_contracts.mjs [full|parts]
import { createRequire } from 'module'
const require = createRequire('/tmp/pg/')
const { PGlite } = await import(require.resolve('@electric-sql/pglite'))
import fs from 'fs'
const db=new PGlite(); const H='/home/user/'
const q=async(sql,l)=>{ try{ return await db.exec(sql) }catch(e){ console.log('❌',l,e.message); process.exit(1) } }
await q(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table public.profiles(id uuid primary key references auth.users(id), email text, full_name text, phone text, avatar_url text, type text, created_at timestamptz default now(), updated_at timestamptz default now(), account_type text, governorate text, national_id text);
create table public.wallets(user_id uuid, balance_syp bigint not null, is_trial_active boolean, trial_days_remaining integer, commission_rate_percent numeric, updated_at timestamptz default now(), id uuid primary key, trial_used boolean);
create table public.wallet_transactions(id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete cascade, amount_syp bigint not null, type text not null, reference_info text, created_at timestamptz default now());`,'env')
await q(fs.readFileSync(H+'cargo-transport-migration.sql','utf8'),'transport')
await q(`alter table cargo_orders drop constraint if exists cargo_orders_status_check; alter table cargo_orders alter column status set default 'open'; alter table cargo_orders add column if not exists carrier_id uuid;`,'real')
await q(fs.readFileSync(H+'event-orders-migration-fixed.sql','utf8').replace(/-- تحقق[\s\S]*$/,''),'events base')
await q(fs.readFileSync(H+'order-points-migration.sql','utf8').replace(/alter table public\.contract_orders[^;]*;/g,'').replace(/do \$\$[\s\S]*?end \$\$;/,'').replace(/select table_name[\s\S]*$/,''),'order-points(no events)')
await q(fs.readFileSync(H+'cargo-offers-migration.sql','utf8'),'offers')
await q(fs.readFileSync(H+'cargo-carrier-migration.sql','utf8'),'carrier')
await q(`alter table public.event_orders add column if not exists gathering_lat double precision; alter table public.event_orders add column if not exists gathering_lng double precision; alter table public.event_orders add column if not exists route_info jsonb; alter table public.event_orders alter column final_point type jsonb using null;`,'points')
await q(fs.readFileSync(H+'events-driver-migration.sql','utf8'),'events-driver')
await q(fs.readFileSync(H+'contract-orders-migration.sql','utf8').replace(/select table_name[\s\S]*$/,''),'contracts base')
await q(fs.readFileSync(H+'contract-orders-fix.sql','utf8').replace(/-- تحقق[\s\S]*$/,''),'contracts fix')
await q(`alter table public.contract_orders add column if not exists route_info jsonb;`,'ct points')
await q(fs.readFileSync(H+'contracts-driver-migration.sql','utf8'),'contracts-driver')
for (const f of ['m1.sql','m2.sql','m3.sql']) await q(fs.readFileSync(H+'sql-cargo-edit/'+f,'utf8'),'cargo-edit '+f)
for (const f of ['u1.sql','u2.sql','u3.sql','u4.sql','u5.sql']) await q(fs.readFileSync(H+'sql-free/'+f,'utf8'),'free '+f)
await db.exec(`insert into auth.users(id, created_at) values ('99999999-9999-9999-9999-999999999999', now()); insert into profiles(id, full_name, phone) values ('99999999-9999-9999-9999-999999999999','قديم','0911000000');`)
for (const r of [1,2]) for (const f of ['w1.sql','w2.sql','w3.sql','w4.sql','w5.sql','w6.sql']) { const res=await q(fs.readFileSync(H+'sql-wallet/'+f,'utf8'), f+' run'+r); if(f==='w6.sql'&&r===2) console.log('check:', JSON.stringify(res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await db.exec(`grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to anon, authenticated; grant all on all sequences in schema public to authenticated;`)
const CU='11111111-1111-1111-1111-111111111111', CR='22222222-2222-2222-2222-222222222222', BUS='33333333-3333-3333-3333-333333333333', P2='44444444-4444-4444-4444-444444444444'
await db.exec(`insert into auth.users(id, created_at) values ('${CU}',now()),('${CR}',now()-interval '30 days'),('${BUS}',now()-interval '30 days'),('${P2}',now());
insert into profiles(id,full_name,phone,vehicle_class,event_vehicle_type,vehicle_seats,svc_events) values
 ('${CU}','أحمد محمد','0944123456',null,null,null,false),('${CR}','أبو خالد النقل','+963955111222','md5',null,null,false),
 ('${BUS}','أبو سامر','0966333444',null,'bus_mid_21',21,true),('${P2}','سارة','0933777888',null,null,null,false);
insert into wallets(user_id,balance) values ('${CR}',50),('${BUS}',50);`)
const as=async(u,sql,p=[])=>{ await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u||''}',false)`); if(u) await db.exec('set role authenticated'); try{ return (await db.query(sql,p)).rows }catch(e){ return 'ERR: '+e.message.split('\n')[0] } finally{ await db.exec('reset role') } }
const one=async(u,sql,p)=>{ const r=await as(u,sql,p); return typeof r==='string'? r : Object.values(r[0]||{})[0] }
const J=x=>JSON.stringify(x)
await q(fs.readFileSync(H+'taxi-migration.sql','utf8'),'taxi')
await q(`alter table taxi_orders drop constraint taxi_orders_status_check; alter table taxi_orders add column if not exists duration_min int, add column if not exists route_source text; insert into taxi_orders(user_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,vehicle_category,estimated_fare,status) values ('${CU}',1,1,1,1,1,'ordinary',1,'weird_legacy')`,'real cols')
const PF=Array.from({length:39},(_,i)=>String(i+1).padStart(2,'0')+'.sql')
for (const r of [1,2]) for (const f of PF) { const res=await q(fs.readFileSync(H+'sql-pay/'+f,'utf8'), f+' run'+r); if(f==='39.sql'&&r===2) console.log('check:', J(res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await q(fs.readFileSync(H+'taxi-shared-migration-fixed.sql','utf8'),'shared')
await q(fs.readFileSync(H+'taxi-shared-route-join.sql','utf8').replace(/do \$\$ begin\s*begin alter publication[\s\S]*?end \$\$;/,''),'shared-join')
const ADM='55555555-5555-5555-5555-555555555555'
await db.exec(`insert into auth.users(id,created_at) values ('${ADM}',now()); insert into profiles(id,full_name,account_type) values ('${ADM}','المدير','admin')`)
const CF=Array.from({length:16},(_,i)=>String(i+1).padStart(2,'0')+'.sql')
for (const r of [1,2]) for (const f of CF) { const res=await q(fs.readFileSync(H+'sql-cancel/'+f,'utf8'), 'cancel '+f+' run'+r); if(f==='16.sql'&&r===2) console.log('check:', J(res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await db.exec(`grant all on all tables in schema public to anon, authenticated; delete from taxi_orders;`)
const SF=Array.from({length:22},(_,i)=>String(i+1).padStart(2,'0')+'.sql')
for (const r of [1,2]) for (const f of SF) { const res=await q(fs.readFileSync(H+'sql-shared/'+f,'utf8'), 'shared '+f+' run'+r); if(f==='22.sql'&&r===2) console.log('check:', J(res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await db.exec(`grant all on all tables in schema public to anon, authenticated;`)
const DR=CR  // old account -> not in free period
await as(null,`update profiles set vehicle_model='كيا ريو', vehicle_color='أبيض' where id=$1`,[DR])
await as(null,`select set_wallet_pin('2580')`); await one(CU,`select set_wallet_pin('2580')`); await as(null,`select admin_wallet_adjust($1,100,'شحن')`,[CU])
const line=JSON.stringify([[33.50,36.20],[33.50,36.30],[33.50,36.40]])
const pub=(h)=>as(DR,`insert into taxi_shared_trips(driver_id,pickup_text,pickup_lat,pickup_lng,dropoff_text,dropoff_lat,dropoff_lng,departure_time,available_seats,total_seats,price_per_seat,route_polyline,duration_min) values ($1,'دمشق',33.5,36.2,'حمص',33.5,36.4,(date_trunc('day', now() at time zone 'Asia/Damascus') + interval '1 day' + make_interval(mins=>$2)) at time zone 'Asia/Damascus',3,3,10,$3::jsonb,60) returning id`,[DR,h,line])
const t1=(await pub(480))[0].id
console.log('overlap 1.5h:', J(await pub(510)))
for (const h of [600,720,840]) await pub(h)
console.log('5th same day:', J(await pub(960)))
console.log('forge start:', J(await as(DR,`update taxi_shared_trips set started_at=now() where id=$1 returning id`,[t1])))
console.log('join auto CU:', J(await one(CU,`select request_shared_join($1,33.5,36.25,33.5,36.35,false,0,0,null)`,[t1])))
await as(P2,`select request_shared_join($1,33.6,36.25,33.5,36.35,false,3,5,null)`,[t1])
const r2=(await as(null,`select id from taxi_shared_requests where passenger_id=$1`,[P2]))[0].id
await as(DR,`select driver_respond_join($1,'counter',2)`,[r2])
console.log('P2 counter accept:', J(await one(P2,`select passenger_answer_counter($1,true)`,[r2])))
console.log('driver passengers:', J(await as(DR,`select x->>'fare' fare, x->>'phone' ph, x ? 'name' has_name from driver_shared_passengers($1) x`,[t1])))
console.log('CU joins view:', J(await one(CU,`select x - 'departure_time' - 'request_id' - 'trip_id' from my_shared_joins() x`)))
console.log('CU payable:', J(await as(CU,`select p->>'gross' g, p->>'to_pay' tp from my_payables() p where p->>'service'='taxi_shared'`)))
const b0=await one(DR,`select my_wallet()->>'balance'`)
console.log('position before start:', await one(DR,`select driver_shared_position($1,33.5,36.22)`,[t1]))
console.log('complete before start:', await one(DR,`select driver_complete_shared_trip($1)`,[t1]))
console.log('start:', J(await one(DR,`select driver_start_shared_trip($1)`,[t1])), '| bal', b0,'→', await one(DR,`select my_wallet()->>'balance'`), '| start again:', await one(DR,`select driver_start_shared_trip($1)`,[t1]))
const P3='66666666-6666-6666-6666-666666666666'
await db.exec(`insert into auth.users(id,created_at) values ('${P3}',now()); insert into profiles(id,full_name,phone) values ('${P3}','راكب3','0999000111')`)
console.log('visible after start (seats left):', J(await as(P3,`select count(*) from taxi_shared_trips where id=$1`,[t1])))
console.log('join after start:', J(await one(P3,`select request_shared_join($1,33.5,36.3,33.5,36.38,false,0,0,null)`,[t1])), '| bal now', await one(DR,`select my_wallet()->>'balance'`))
console.log('visible when full:', J(await as(P3,`select count(*) from taxi_shared_trips where id=$1`,[t1])))
console.log('position:', J(await one(DR,`select driver_shared_position($1,33.5,36.3)`,[t1])))
console.log('passenger started notif:', J(await as(CU,`select n->>'title' t from my_notifications() n where n->>'kind'='shared_started'`)))
console.log('CU pay:', J(await one(CU,`select pay_from_wallet('taxi_shared',$1,1,'2580')`,[(await as(null,`select id from taxi_shared_requests where passenger_id=$1`,[CU]))[0].id])), '| DR bal', await one(DR,`select my_wallet()->>'balance'`))
console.log('DR notif:', J(await as(DR,`select n->>'body' b from my_notifications() n where n->>'kind'='payment_in'`)), '| DR tx:', J(await as(DR,`select x->>'kind' k, x->>'amount' a, x->>'counterparty' c from my_wallet_transactions() x where x->>'service'='taxi_shared'`)))
console.log('driver trips:', J(await as(DR,`select x->>'passengers' p, x->>'overdue' o from driver_my_shared_trips() x`)))
console.log('complete:', J(await one(DR,`select driver_complete_shared_trip($1)`,[t1])), '| trips now:', J(await as(DR,`select x->>'status' s, x->>'started_at' st from driver_my_shared_trips() x`)), J(await as(null,`select status from taxi_shared_trips where id=$1`,[t1])))
// overdue unstarted trip blocks publishing
await db.exec(`set session_replication_role=replica; update taxi_shared_trips set departure_time=now()-interval '10 minutes' where id=(select id from taxi_shared_trips where driver_id='${DR}' and status='pending' and started_at is null order by departure_time limit 1); set session_replication_role=origin`)
console.log('overdue flag:', J(await as(DR,`select x->>'overdue' o from driver_my_shared_trips() x`)), '| publish blocked:', J(await pub(1500)))
// forgotten started trip auto close
const t9=(await as(null,`select id from taxi_shared_trips where driver_id=$1 and status='pending' and started_at is null and departure_time<now()`,[DR]))[0].id
await one(DR,`select driver_start_shared_trip($1)`,[t9])
await db.exec(`set session_replication_role=replica; update taxi_shared_trips set started_at=now()-interval '4 hours' where id='${t9}'; set session_replication_role=origin`)
console.log('auto close:', J(await one(DR,`select count(*) from driver_my_shared_trips() x where x->>'id'=$1`,[t9])), J(await as(null,`select status from taxi_shared_trips where id=$1`,[t9])))
const tc=(await as(DR,`select x->>'id' id from driver_my_shared_trips() x where (x->>'overdue')='false' limit 1`))[0].id
await one(CU,`select request_shared_join($1,33.5,36.25,33.5,36.35,false,0,0,null)`,[tc])
console.log('cancel shared after update:', J(await one(DR,`select driver_cancel_shared_trip($1,'emergency')`,[tc])), J(await as(null,`select status from taxi_shared_trips where id=$1`,[tc])))
for (const r of [1,2]) for (const f of ['01.sql','02.sql','03.sql','04.sql','05.sql']) { const res=await q(fs.readFileSync(H+'sql-taxicat/'+f,'utf8'),'taxicat '+f); if(f==='05.sql'&&r===2) console.log('check:', J(res.rows? res.rows : res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await db.exec(`grant all on all tables in schema public to anon, authenticated;`)
const D1=BUS
await as(null,`update profiles set taxi_suspended=false where id=$1`,[D1])
const mk=async()=>{ await as(CU,`insert into taxi_orders(user_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,vehicle_category,estimated_fare) values ($1,33.51,36.28,33.52,36.30,3,'economy',5)`,[CU]); return (await as(CU,`select id from taxi_orders where status='pending' order by created_at desc limit 1`))[0].id }
const oc=await mk()
console.log('no category sees:', J(await as(D1,`select count(*) from taxi_orders where id=$1`,[oc])), '| accept:', await one(D1,`select driver_accept_taxi($1)`,[oc]), '| ping:', J(await one(D1,`select driver_taxi_ping(33.515,36.28)`)))
await as(null,`update profiles set taxi_category='luxury' where id=$1`,[D1])
console.log('luxury sees economy:', J(await as(D1,`select count(*) from taxi_orders where id=$1`,[oc])), '| accept:', await one(D1,`select driver_accept_taxi($1)`,[oc]))
await as(null,`update profiles set taxi_category='economy' where id=$1`,[D1])
console.log('ping:', J(await one(D1,`select driver_taxi_ping(33.515,36.28)`)), '| customer nearby (free):', J(await as(CU,`select nearby_taxis(33.51,36.28,5) x`)))
console.log('far at 5:', J(await as(CU,`select count(*) from nearby_taxis(33.51,36.35,5)`)), '| far at 10:', J(await as(CU,`select count(*) from nearby_taxis(33.51,36.35,10)`)))
console.log('economy sees:', J(await as(D1,`select count(*) from taxi_orders where id=$1`,[oc])), '| accept:', J(await one(D1,`select driver_accept_taxi($1)`,[oc])), '| status cat:', J(await one(D1,`select my_driver_status()->>'taxi_category'`)))
console.log('customer nearby (busy):', J(await as(CU,`select nearby_taxis(33.51,36.28,5) x`)))
await one(D1,`select driver_taxi_start($1)`,[oc])
const o2=await mk()
console.log('accept 2nd while in trip:', J(await one(D1,`select driver_accept_taxi($1)`,[o2])))
console.log('active:', J(await one(D1,`select driver_taxi_active()`)))
console.log('arrive 2nd before finishing:', await one(D1,`select driver_taxi_arrived($1)`,[o2]))
console.log('nearby when full:', J(await as(CU,`select count(*) from nearby_taxis(33.51,36.28,5)`)))
const o3=await mk()
console.log('accept 3rd:', await one(D1,`select driver_accept_taxi($1)`,[o3]))
const bal0=J(await as(null,`select balance from wallets where user_id=$1`,[D1]))
console.log('complete 1st:', J(await one(D1,`select driver_taxi_complete($1)`,[oc])), '| balance before/after:', bal0, J(await as(null,`select balance from wallets where user_id=$1`,[D1])))
console.log('active after:', J(await one(D1,`select driver_taxi_active()`)), '| 2nd arrived:', J(await one(D1,`select driver_taxi_arrived($1)`,[o2])))
await db.exec(`update taxi_driver_positions set updated_at=now()-interval '3 minutes'`)
console.log('stale hidden:', J(await as(CU,`select count(*) from nearby_taxis(33.51,36.28,5)`)), '| direct table read:', J(await as(CU,`select count(*) from taxi_driver_positions`)))
// ===== الأمان والطوارئ =====
await db.exec(`alter table event_offers add column if not exists completed_at timestamptz; alter table contract_offers add column if not exists ended_at timestamptz; alter table profiles add column if not exists vehicle_model text; alter table profiles add column if not exists vehicle_color text;`)
for (const r of [1,2]) for (const f of ['01','02','03','04','05','06','07','08','09']) { const res=await q(fs.readFileSync(H+'sql-safety/'+f+'.sql','utf8'),'safety '+f); if(f==='09'&&r===2) console.log('check:', J(res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await db.exec(`grant all on all tables in schema public to anon, authenticated; revoke execute on function public._person_json(uuid) from public, anon, authenticated; revoke execute on function public._share_ctx(text,uuid) from public, anon, authenticated;`)
await as(null,`update profiles set vehicle_plate='دمشق 123456', vehicle_model='كيا ريو', vehicle_color='أبيض' where id=$1`,[D1])
console.log('settings default:', J(await one(CU,`select my_sos_settings()`)))
console.log('save 3 family:', await one(CU,`select save_sos_settings('[{"name":"أ","phone":"1"},{"name":"ب","phone":"2"},{"name":"ج","phone":"3"}]'::jsonb,'112')`))
console.log('save ok:', J(await one(CU,`select save_sos_settings('[{"name":"أبي","phone":"0911"},{"name":"","phone":" "}]'::jsonb,'112')`)))
console.log('direct settings read:', J(await as(CU,`select count(*) from sos_settings`)), '| direct _person_json:', await one(CU,`select _person_json($1)`,[D1]))
// o2 is arrived for D1 (customer CU)
console.log('driver ping duty:', J(await one(D1,`select live_ping(33.511,36.281)`)), '| customer ping no duty:', J(await one(CU,`select live_ping(33.5,36.2)`)))
console.log('my_taxi_active:', J(await one(CU,`select jsonb_build_object('plate',x->'vehicle_plate','pos',x->'driver_pos'->'lat') from my_taxi_active() x`)))
console.log('share by driver:', await one(D1,`select create_trip_share('taxi',$1)`,[o2]), '| rental:', await one(CU,`select create_trip_share('rental',$1)`,[o2]))
const tk=await one(CU,`select create_trip_share('taxi',$1)->>'token'`,[o2]); const tk2=await one(CU,`select create_trip_share('taxi',$1)->>'token'`,[o2])
console.log('token same:', tk===tk2, tk.length)
await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); set role anon`)
console.log('anon view trip:', J((await db.query(`select get_live_share($1) x`,[tk])).rows[0].x))
console.log('anon bad token:', J((await db.query(`select get_live_share('zzz') x`)).rows[0].x))
await db.exec('reset role')
// SOS by customer during trip
const s1=await one(CU,`select sos_start('family',33.5,36.2)`)
console.log('sos start:', J(s1))
console.log('sos again all:', J(await one(CU,`select sos_start('all',33.5,36.2)->>'mode'`)), '| active:', J(await one(CU,`select my_sos_active()->>'mode'`)))
console.log('customer ping in sos:', J(await one(CU,`select live_ping(33.52,36.21)`)), '| points:', J(await as(null,`select count(*) from sos_points`)))
console.log('admin notif:', J(await as(null,`select title, body from user_notifications where kind='sos'`)))
await db.exec(`set role anon`)
console.log('anon sos (customer):', J((await db.query(`select get_live_share($1) x`,[s1.token])).rows[0].x))
await db.exec('reset role')
const s2=await one(D1,`select sos_start('all',33.511,36.281)`)
await db.exec(`set role anon`)
console.log('anon sos (driver):', J((await db.query(`select get_live_share($1) x`,[s2.token])).rows[0].x))
await db.exec('reset role')
console.log('sos end:', J(await one(CU,`select sos_end()`)), J(await one(CU,`select sos_end()`)), '| active:', J(await one(CU,`select my_sos_active()`)))
await db.exec(`set role anon`)
console.log('anon ended sos:', J((await db.query(`select get_live_share($1) x`,[s1.token])).rows[0].x))
await db.exec('reset role')
console.log('sos no order (P2):', J(await one(P2,`select sos_start('family',33.4,36.1)->>'token'`)).length, J(await as(null,`select service from sos_cases where user_id=$1`,[P2])))
console.log('complete o2:', J(await one(D1,`select driver_taxi_complete($1)->>'status'`,[o2])))
await db.exec(`set role anon`)
console.log('anon trip after end:', J((await db.query(`select get_live_share($1) x`,[tk])).rows[0].x))
await db.exec('reset role')
console.log('share inactive:', await one(CU,`select create_trip_share('taxi',$1)`,[oc]))
for (const s of ['taxi_shared','taxi_shared_trip','cargo','events','contracts']) console.log('ctx', s, J(await one(null,`select _share_ctx($1, gen_random_uuid())`,[s])))
console.log('active ctx all users:', J(await as(null,`select _my_active_ctx(id) from profiles`)))
await one(CU,`select customer_cancel_taxi($1)`,[o3])
const o4=await mk(); await one(D1,`select driver_accept_taxi($1)`,[o4]); await one(D1,`select live_ping(33.6,36.3)`)
console.log('my_taxi_active now:', J(await one(CU,`select jsonb_build_object('plate',x->'vehicle_plate','pos',x->'driver_pos') from my_taxi_active() x`)))
// ===== التأجير =====
await db.exec(`create schema if not exists storage; create table if not exists storage.buckets(id text primary key, name text, public boolean);
create table if not exists storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text); alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;`)
const k3=fs.readFileSync(H+'sql-contracts-6/k3.sql','utf8'); await q(k3.slice(k3.indexOf('create or replace function public._wallet_charge_at'), k3.indexOf('-- إجمالي قيمة العرض')),'charge_at')
await db.exec(`insert into service_commissions(service,rate) values ('rental',0.12) on conflict (service) do update set rate=0.12`)
const RF=['01','02','03','04','05','06','07','08','09','10','11']
for (const r of [1,2]) for (const f of RF) { const res=await q(fs.readFileSync(H+'sql-rental/'+f+'.sql','utf8'),'rental '+f); if(f==='11'&&r===2) console.log('check:', J(res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await db.exec(`grant all on all tables in schema public to anon, authenticated;`)
const PR=CR // المؤجّر (رصيد 50)
const base={brand_model:'كيا ريو',year:2020,transmission:'auto',seats:5,photos:{front:'f',back:'b',side:'s'},lat:33.51,lng:36.28,conditions:['license','deposit','bogus'],pricing_mode:'fixed',units:['day','month','x'],prices:{day:25,month:500}}
console.log('missing photo:', await one(PR,`select save_rental_listing(null,$1)`,[{...base,photos:{front:'f'}}]))
console.log('fixed without price:', await one(PR,`select save_rental_listing(null,$1)`,[{...base,prices:{day:25}}]))
const L1=(await one(PR,`select save_rental_listing(null,$1)`,[base])).id
const L2=(await one(PR,`select save_rental_listing(null,$1)`,[{...base,brand_model:'هيونداي',pricing_mode:'offers',units:['day','week'],prices:{}}])).id
console.log('saved cond/units:', J(await as(null,`select conditions, units, prices from rental_listings where id=$1`,[L1])))
const sr=await as(CU,`select x from rental_search(33.52,36.29) x`)
console.log('search count:', sr.length, '| keys:', Object.keys(sr[0].x).sort().join(','), '| approx:', J(sr[0].x.approx), 'km', sr[0].x.km)
console.log('far search:', J(await as(CU,`select count(*) from rental_search(34.5,36.29)`)), '| own hidden:', J(await as(PR,`select count(*) from rental_search(33.52,36.29)`)))
const st=new Date(Date.now()+3600e3).toISOString()
console.log('fixed wrong price:', await one(CU,`select rental_request_listing($1,'day',3,$2,20)`,[L1,st]))
const R1=(await one(CU,`select rental_request_listing($1,'day',3,$2,25)`,[L1,st])).id
const R2=(await one(P2,`select rental_request_listing($1,'day',2,$2,25)`,[L1,st])).id
console.log('dup:', await one(CU,`select rental_request_listing($1,'day',1,$2,25)`,[L1,st]), '| offers own price:', J(await one(CU,`select rental_request_listing($1,'week',1,$2,90)`,[L2,st])))
console.log('provider sees:', J(await as(PR,`select x->>'total' t, x->>'listed_price' lp, x ? 'customer_name' has_name from rental_provider_requests() x`)))
console.log('other accepts:', await one(CU,`select rental_provider_respond($1,'accept')`,[R1]))
console.log('accept:', J(await one(PR,`select rental_provider_respond($1,'accept')`,[R1])), '| balance:', J(await as(null,`select balance from wallets where user_id=$1`,[PR])))
console.log('R2 auto:', J(await as(null,`select status, reason from rental_requests where id=$1`,[R2])), '| listing:', J(await as(null,`select status from rental_listings where id=$1`,[L1])), '| search now:', J(await as(CU,`select count(*) from rental_search(33.52,36.29)`)))
console.log('customer sees provider:', J(await one(CU,`select jsonb_path_query_array(my_rentals()->'requests','$[*].provider_phone')`)))
console.log('booking for provider:', J(await one(PR,`select x->'booking'->>'customer_phone' from my_rental_listings() x where x->>'id'=$1`,[L1])))
console.log('republish:', J(await one(PR,`select rental_listing_action($1,'republish')`,[L1])), J(await as(null,`select status from rental_listings where id=$1`,[L1])))
// الطلب العام
const G=(await one(P2,`select rental_post_general('month',3,$1,400,33.52,36.29)`,[st])).id
console.log('provider generals:', J(await as(PR,`select x->>'total' t, jsonb_array_length(x->'listings') n from rental_provider_generals() x`)))
console.log('respond with week-only listing:', await one(PR,`select rental_respond_general($1,$2)`,[G,L2]))
console.log('respond:', J(await one(PR,`select rental_respond_general($1,$2)`,[G,L1])), '| again list:', J(await as(PR,`select count(*) from rental_provider_generals()`)))
const off=(await one(P2,`select my_rentals()->'generals'->0->'offers'->0`)); console.log('offer listing keys has provider?', J(Object.keys(off.listing).includes('provider_id')), 'km', off.listing.km)
const bal1=J(await as(null,`select balance from wallets where user_id=$1`,[PR]))
console.log('choose:', J(await one(P2,`select rental_choose_offer($1)`,[off.id])), '| bal', bal1, '→', J(await as(null,`select balance from wallets where user_id=$1`,[PR])))
const RG=(await as(null,`select id from rental_requests where general_id=$1`,[G]))[0].id
await db.exec(`update rental_requests set start_at=now()-interval '2 months 1 day', created_at=now() where id='${RG}'`)
console.log('settle:', J(await one(PR,`select rental_settle_my_dues()`)), J(await one(PR,`select rental_settle_my_dues()`)), J(await as(null,`select months_charged, commission_total from rental_requests where id=$1`,[RG])))
console.log('republish stops:', J(await one(PR,`select rental_listing_action($1,'republish')`,[L1])), J(await as(null,`select ended_at is not null e from rental_requests where id=$1`,[RG])))
await db.exec(`update rental_requests set start_at=now()-interval '5 months' where id='${RG}'`)
console.log('settle after end:', J(await one(PR,`select rental_settle_my_dues()`)))
console.log('pause:', J(await one(PR,`select rental_listing_action($1,'pause')`,[L2])), '| CU offer on L2 now:', J(await as(null,`select status, reason from rental_requests where listing_id=$1`,[L2])))
await db.exec(`update wallets set balance=-5 where user_id='${PR}'`)
console.log('blocked hides:', J(await as(CU,`select count(*) from rental_search(33.52,36.29)`)))
console.log('direct table read:', J(await as(CU,`select count(*) from rental_listings`)))
await q(fs.readFileSync(H+'sql-dues/01.sql','utf8'),'dues')
await db.exec(`update wallets set balance=50 where user_id='${PR}'`)
console.log('settle_all:', J(await one(PR,`select settle_all_my_dues()`)), '| anon:', J(await one(null,`select settle_all_my_dues()`)))
// ===== التقييم =====
await db.exec(`alter table event_offers add column if not exists completed_at timestamptz; alter table cargo_orders add column if not exists completed_at timestamptz;
alter table contract_orders add column if not exists contract_unit text, add column if not exists unit_count int;
alter table contract_offers add column if not exists ended_at timestamptz;`)
const RF2=['01','02','03','04','05','06','07']
for (const r of [1,2]) for (const f of RF2) { const res=await q(fs.readFileSync(H+'sql-rating/'+f+'.sql','utf8'),'rating '+f); if(f==='07'&&r===2) console.log('RATING check:', J(res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await db.exec(`grant all on all tables in schema public to anon, authenticated;`)
await db.exec(`delete from provider_reviews; delete from user_notifications;`)
// تكسي
const tx=(await as(null,`insert into taxi_orders(user_id,driver_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,vehicle_category,estimated_fare) values ($1,null,33.5,36.2,33.6,36.3,3,'economy',5) returning id`,[CU]))[0].id
await as(null,`update taxi_orders set driver_id=$2, status='arrived' where id=$1`,[tx,CR])
console.log('R taxi complete:', J(await one(CR,`select driver_taxi_complete($1)`,[tx])), J(await as(null,`select status, driver_id=$2 d from taxi_orders where id=$1`,[tx,CR])))
await as(null,`update taxi_orders set status='completed' where id=$1`,[tx])
// مشترك: مشاركة موجودة سابقاً t1؟ نعمل رحلة مكتملة بطلب مؤكد
await db.exec(`update taxi_shared_requests set status='confirmed' where false`)
await db.exec(`select set_config('app.shared_rpc','1',false)`)
const sst=await as(null,`insert into taxi_shared_trips(driver_id,pickup_text,pickup_lat,pickup_lng,dropoff_text,dropoff_lat,dropoff_lng,departure_time,available_seats,total_seats,price_per_seat) values ($1,'أ',33.5,36.2,'ب',33.6,36.3,now()+interval '3 days',3,3,5) returning id`,[BUS])
console.log('ins trip', typeof sst==='string'? sst : 'ok')
await as(null,`insert into taxi_shared_requests(trip_id,passenger_id,status) values ($1,$2,'confirmed'),($1,$3,'cancelled')`,[sst[0].id,CU,P2])
await as(null,`update taxi_shared_trips set started_at=now() where id=$1`,[sst[0].id])
console.log('R shared trip found:', sst.length)
if (sst.length) { await db.exec(`select set_config('app.shared_rpc','1',false)`); await as(null,`update taxi_shared_trips set status='completed' where id=$1`,[sst[0].id]); await db.exec(`select set_config('app.shared_rpc','',false)`) }
// تأجير: الطلب RG انتهى سابقاً (ended_at) — نعمل واحد جديد
await db.exec(`update wallets set balance=100 where user_id='${PR}'`)
const L3=(await one(PR,`select save_rental_listing(null,$1)`,[{...base,brand_model:'تويوتا'}])).id
const R3=(await one(CU,`select rental_request_listing($1,'day',1,$2,25)`,[L3,new Date(Date.now()+3600e3).toISOString()])).id
await one(PR,`select rental_provider_respond($1,'accept')`,[R3]); await one(PR,`select rental_listing_action($1,'republish')`,[L3])
console.log('R pending CU:', J(await as(CU,`select x->>'service' s, x->>'provider_name' n from my_pending_ratings() x`)))
console.log('R notifs:', J(await as(null,`select count(*) from user_notifications where kind='rating'`)))
const pend=await as(CU,`select x->>'id' id, x->>'service' s from my_pending_ratings() x`)
const idOf=s=>pend.find(p=>p.s===s)?.id
console.log('R empty:', await one(CU,`select submit_rating($1,null,'{}')`,[idOf('taxi')]), '| bad stars:', await one(CU,`select submit_rating($1,7,'{}')`,[idOf('taxi')]))
console.log('R other user:', await one(P2,`select submit_rating($1,5,'{}')`,[idOf('taxi')]))
console.log('R taxi 5:', J(await one(CU,`select submit_rating($1,5,array['on_time','polite','hack'])`,[idOf('taxi')])), '| again:', await one(CU,`select submit_rating($1,4,'{}')`,[idOf('taxi')]))
console.log('R rental 3 tags only? stars 3:', J(await one(CU,`select submit_rating($1,3,array['late'])`,[idOf('rental')])))
console.log('R summary CR:', J(await one(CR,`select my_rating_summary()`)))
console.log('R badges rental:', J(await one(CU,`select rating_badges('rental_listing', array[$1::uuid])`,[L3])))
const co=await as(null,`insert into cargo_orders(customer_id) values ($1) returning id`,[CU]); console.log('cargo ins', typeof co==='string'?co:'ok')
if(typeof co!=='string'){ await as(null,`update cargo_orders set status='accepted', carrier_id=$2 where id=$1`,[co[0].id,CR]); console.log('cargo complete:', J(await one(CR,`select carrier_complete_cargo($1)`,[co[0].id]))) }
await db.exec(`do $$ declare c record; begin for c in select column_name from information_schema.columns where table_name='event_orders' and is_nullable='NO' and column_default is null and column_name<>'id' loop execute format('alter table event_orders alter column %I drop not null', c.column_name); end loop; end $$;`)
const eo=await as(null,`insert into event_orders(user_id) values ($1) returning id`,[CU]); console.log('event ins', typeof eo==='string'?eo:'ok')
if(typeof eo!=='string'){ const ef=await as(null,`insert into event_offers(event_order_id,driver_id,offered_price,status) values ($1,$2,50,'accepted') returning id`,[eo[0].id,BUS]); await as(null,`update event_orders set status='accepted' where id=$1`,[eo[0].id]); console.log('event complete:', J(await one(BUS,`select driver_complete_event($1)`,[ef[0].id]))) }
console.log('R after cargo/events:', J(await as(null,`select service, count(*) from provider_reviews group by 1 order by 1`)))
// انتهاء صلاحية
await db.exec(`update provider_reviews set expires_at=now()-interval '1 min' where status='pending'`)
console.log('R expired hidden:', J(await as(CU,`select count(*) from my_pending_ratings()`)))
// عقود: أسبوعي بدأ قبل 15 يوم (أسبوعين) + يومي انتهى أمس
await db.exec(`delete from provider_reviews`)
await db.exec(`alter table contract_orders drop constraint if exists contract_orders_duration_type_check; alter table contract_orders alter column contract_role drop not null, alter column num_people drop not null, alter column duration_type drop not null;`)
const mkct=async(unit,n,start,end)=>{ const oo=(await as(null,`insert into contract_orders(contract_category,user_id,contract_unit,unit_count,start_date,end_date,status) values ('school',$1,$2,$3,$4,$5,'accepted') returning id`,[CU,unit,n,start,end])); if(typeof oo==='string'){console.log('mkct',oo);process.exit(1)} const o=oo[0].id
  return (await as(null,`insert into contract_offers(contract_order_id,driver_id,status,offered_price) values ($1,$2,'accepted',10) returning id`,[o,BUS]))[0].id }
const dd=(k)=>new Date(Date.now()+k*864e5).toISOString().slice(0,10)
const cw=await mkct('week',4,dd(-15),dd(13)); const cd=await mkct('day',5,dd(-5),dd(-1)); const cm=await mkct('month',3,dd(-3),dd(80))
await as(null,`update contract_orders set end_date=$2 where id=(select contract_order_id from contract_offers where id=$1)`,[cd,dd(-1)])
await as(null,`update contract_orders set start_date=$2, end_date=$3 where id=(select contract_order_id from contract_offers where id=$1)`,[cw,dd(-14),dd(13)])
console.log('R ct tick:', J(await as(CU,`select x->>'service' s, x->>'period' p from my_pending_ratings() x`)))
console.log('R ct tick again (no dup):', J(await as(null,`select ref_id::text=$1 w, period from provider_reviews order by period`,[cw])))
await db.exec(`update contract_offers set ended_at=now()-interval '2 hours' where id='${cm}'`)
await one(CU,`select my_pending_ratings()`)
console.log('R month ended early:', J(await as(null,`select period from provider_reviews where ref_id=$1`,[cm])))
console.log('DBG day:', J(await as(null,`select o.end_date, (o.end_date+1)::timestamp at time zone 'Asia/Damascus' e, now() n, x.status from contract_offers x join contract_orders o on o.id=x.contract_order_id where x.id=$1`,[cd])), J(await as(null,`select period, due_at from provider_reviews where ref_id=$1`,[cd])))
