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
const DR=BUS, DR2=CR
const newOrder=async()=>{ await as(CU,`insert into taxi_orders(user_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,vehicle_category,estimated_fare) values ($1,1,1,1,1,1,'ordinary',5)`,[CU]); return (await as(CU,`select id from taxi_orders order by created_at desc limit 1`))[0].id }
let o=await newOrder()
console.log('accept:', J(await one(DR,`select driver_accept_taxi($1)->>'fare'`,[o])))
console.log('cancel no reason:', await one(DR,`select driver_cancel_taxi($1,null)`,[o]), '| other driver cancel:', await one(DR2,`select driver_cancel_taxi($1,'other')`,[o]))
console.log('cancel:', J(await one(DR,`select driver_cancel_taxi($1,'no_answer')`,[o])))
console.log('order after:', J(await as(CU,`select status, driver_id from taxi_orders where id=$1`,[o])), '| DR still sees:', J(await as(DR,`select count(*) from taxi_orders where id=$1`,[o])))
console.log('passenger notif:', J(await as(CU,`select n->>'title' t,n->>'body' b from my_notifications() n where n->>'kind'='taxi_driver_cancelled'`)))
console.log('re-accept within 5 min:', J(await one(DR,`select driver_accept_taxi($1)->>'fare'`,[o])), '| count now:', J(await one(DR,`select my_driver_status()->>'cancel_count'`)))
await one(DR,`select driver_cancel_taxi($1,'car_issue')`,[o])
// 9 more cancels on different orders -> alert at 5, suspend at 10
for (let i=0;i<9;i++){ const x=await newOrder(); await one(DR,`select driver_accept_taxi($1)`,[x]); const r=await one(DR,`select driver_cancel_taxi($1,'emergency')`,[x]); if(i>=3) console.log('cancel', i+2, J(r)) ; await as(CU,`select customer_cancel_taxi($1)`,[x]) }
console.log('admin notifs:', J(await as(ADM,`select n->>'title' t,n->>'body' b from my_notifications() n`)))
console.log('status:', J(await one(DR,`select my_driver_status()`)))
const o3=await newOrder()
console.log('suspended sees pending:', J(await as(DR,`select count(*) from taxi_orders where status='pending'`)), '| other driver sees:', J(await as(DR2,`select count(*) from taxi_orders where status='pending'`)))
console.log('suspended accept:', await one(DR,`select driver_accept_taxi($1)`,[o3]))
console.log('suspended publish shared:', J(await as(DR,`insert into taxi_shared_trips(driver_id,pickup_text,pickup_lat,pickup_lng,dropoff_text,dropoff_lat,dropoff_lng,departure_time,available_seats,total_seats,price_per_seat) values ($1,'a',1,1,'b',2,2,now()+interval '1h',3,3,5) returning id`,[DR])))
// undo the 10th (suspension) cancel: the last cancelled order within 5 min
const last=(await as(null,`select ref_id from taxi_driver_cancels where driver_id=$1 and voided_at is null order by created_at desc limit 1`,[DR]))[0].ref_id
await as(null,`update taxi_orders set status='pending' where id=$1`,[last])
console.log('re-accept suspending order:', J(await one(DR,`select driver_accept_taxi($1)->>'fare'`,[last])), '| status:', J(await one(DR,`select my_driver_status() - 'message'`)))
await one(DR,`select driver_cancel_taxi($1,'other','ظرف')`,[last])
console.log('suspended again:', J(await one(DR,`select my_driver_status()->>'taxi_suspended'`)))
console.log('non-admin list:', await one(DR2,`select admin_taxi_drivers()`), '| admin list:', J(await as(ADM,`select x - 'phone' - 'suspended_at' - 'driver_id' x from admin_taxi_drivers() x`)))
console.log('lift:', J(await one(ADM,`select admin_lift_taxi_suspension($1)`,[DR])), '| lift again:', await one(ADM,`select admin_lift_taxi_suspension($1)`,[DR]))
console.log('driver notif:', J(await as(DR,`select n->>'title' t from my_notifications() n where n->>'kind'='taxi_unsuspended'`)))
console.log('log size:', J(await as(ADM,`select count(*) from admin_driver_cancels($1)`,[DR])), '| driver reads table:', J(await as(DR,`select count(*) from taxi_driver_cancels`)))
// shared trip
const mk=async()=>{ await as(DR2,`insert into taxi_shared_trips(driver_id,pickup_text,pickup_lat,pickup_lng,dropoff_text,dropoff_lat,dropoff_lng,departure_time,available_seats,total_seats,price_per_seat) values ($1,'a',1,1,'b',2,2,now()+interval '1h',3,3,5)`,[DR2]); return (await as(DR2,`select id from taxi_shared_trips where driver_id=$1 order by created_at desc limit 1`,[DR2]))[0].id }
let t=await mk()
console.log('direct cancel empty:', J(await as(DR2,`update taxi_shared_trips set status='cancelled' where id=$1 returning id`,[t])))
console.log('cancel empty trip:', J(await one(DR2,`select driver_cancel_shared_trip($1,'other')`,[t])))
t=await mk()
await as(null,`insert into taxi_shared_requests(trip_id,passenger_id,status) values ($1,$2,'confirmed'),($1,$3,'confirmed')`,[t,CU,P2])
console.log('cancel w/ 2 passengers:', J(await one(DR2,`select driver_cancel_shared_trip($1,'emergency')`,[t])), '| DR2 count:', J(await one(DR2,`select my_driver_status()->>'cancel_count'`)))
console.log('P2 notif:', J(await as(P2,`select n->>'title' t from my_notifications() n where n->>'kind'='shared_trip_cancelled'`)), '| reqs:', J(await as(null,`select status, count(*) from taxi_shared_requests where trip_id=$1 group by 1`,[t])))
