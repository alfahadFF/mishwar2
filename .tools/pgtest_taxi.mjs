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
for (const f of ['x1.sql','x2.sql','x3.sql','x4.sql']) await q(fs.readFileSync(H+'sql-wallet2/'+f,'utf8'), f)
await q(fs.readFileSync(H+'taxi-migration.sql','utf8'),'taxi')
await q(`alter table taxi_orders drop constraint taxi_orders_status_check; alter table taxi_orders add column if not exists duration_min int, add column if not exists route_source text; insert into taxi_orders(user_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,vehicle_category,estimated_fare,status) values ('${CU}',1,1,1,1,1,'ordinary',1,'weird_legacy')`,'real cols')
await q(fs.readFileSync(H+'taxi-shared-migration-fixed.sql','utf8'),'shared')
await q(fs.readFileSync(H+'taxi-shared-route-join.sql','utf8').replace(/^.*supabase_realtime.*$/gm,''),'shared join')
for (const r of [1,2]) for (const f of ['p1.sql','p2.sql','p3.sql','p4.sql','p5.sql','p6.sql','p7.sql']) { const res=await q(fs.readFileSync(H+'sql-taxi-pay/'+f,'utf8'), f+' run'+r); if(f==='p7.sql'&&r===2) console.log('check:', J(res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await db.exec(`grant all on all tables in schema public to anon, authenticated; delete from taxi_orders;`)
const DR=BUS, DR2=CR
await as(null,`select set_wallet_pin('2580')`); 
await one(CU,`select set_wallet_pin('2580')`)
await as(null,`select admin_wallet_adjust($1,100,'شحن')`,[CU])
console.log('insert forged completed:', J(await as(CU,`insert into taxi_orders(user_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,vehicle_category,estimated_fare,status,driver_id,duration_min,route_source) values ($1,33.5,36.2,33.52,36.3,6.2,'ordinary',20,'completed',$2,12,'osrm_road') returning status, driver_id`,[CU,DR])))
const oid=(await as(CU,`select id from taxi_orders order by created_at desc limit 1`))[0].id
console.log('direct update by customer:', J(await as(CU,`update taxi_orders set status='completed' where id=$1 returning id`,[oid])))
console.log('customer active:', J(await one(CU,`select my_taxi_active()->>'status'`)))
console.log('self accept:', await one(CU,`select driver_accept_taxi($1)`,[oid]))
console.log('step before accept:', await one(DR,`select driver_taxi_step($1,'arrived')`,[oid]))
const b0=await one(DR,`select my_wallet()->>'balance'`)
console.log('accept:', J(await one(DR,`select driver_accept_taxi($1)`,[oid])), '| DR balance', b0,'→', await one(DR,`select my_wallet()->>'balance'`))
console.log('second driver accept:', await one(DR2,`select driver_accept_taxi($1)`,[oid]))
console.log('cancel after accept:', await one(CU,`select customer_cancel_taxi($1)`,[oid]))
console.log('customer sees driver:', J(await one(CU,`select my_taxi_active() - 'pickup' - 'dropoff' - 'completed_at'`)))
console.log('driver active:', J(await one(DR,`select driver_taxi_active()->>'customer_phone'`)))
console.log('complete too early:', await one(DR,`select driver_taxi_step($1,'complete')`,[oid]), '| other driver step:', await one(DR2,`select driver_taxi_step($1,'arrived')`,[oid]))
console.log('payables before complete:', J(await as(CU,`select count(*) from my_payables() p where p->>'service'='taxi'`)))
for (const st of ['arrived','start','complete']) console.log(st, J(await one(DR,`select driver_taxi_step($1,$2)`,[oid,st])))
console.log('payable:', J(await as(CU,`select p->>'title' t,p->>'gross' g,p->>'discount_pct' pc,p->>'discount' d,p->>'to_pay' tp from my_payables() p where p->>'service'='taxi'`)))
console.log('customer notifs:', J(await as(CU,`select n->>'title' t, n->>'body' b from my_notifications() n where n->>'kind' like 'taxi%'`)))
const drb=await one(DR,`select my_wallet()->>'balance'`), cub=await one(CU,`select my_wallet()->>'balance'`)
console.log('pay no pin:', J(await one(CU,`select pay_from_wallet('taxi',$1,1,null)`,[oid])), '| pay:', J(await one(CU,`select pay_from_wallet('taxi',$1,1,'2580')`,[oid])), '| again:', await one(CU,`select pay_from_wallet('taxi',$1,1,'2580')`,[oid]))
console.log('CU', cub,'→',await one(CU,`select my_wallet()->>'balance'`),' DR', drb,'→',await one(DR,`select my_wallet()->>'balance'`))
console.log('active after pay:', J(await one(CU,`select my_taxi_active()`)))
// cancel flow
await as(CU,`insert into taxi_orders(user_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,vehicle_category,estimated_fare) values ($1,1,1,1,1,1,'ordinary',5)`,[CU])
const o2=(await as(CU,`select id from taxi_orders where status='pending'`))[0].id
console.log('other cancels:', await one(P2,`select customer_cancel_taxi($1)`,[o2]), '| cancel:', J(await one(CU,`select customer_cancel_taxi($1)`,[o2])), '| accept cancelled:', await one(DR,`select driver_accept_taxi($1)`,[o2]))
// blocked driver
await as(null,`update wallets set balance=-5 where user_id=$1`,[DR2])
await as(CU,`insert into taxi_orders(user_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,vehicle_category,estimated_fare) values ($1,1,1,1,1,1,'ordinary',5)`,[CU])
const o3=(await as(CU,`select id from taxi_orders where status='pending'`))[0].id
console.log('blocked driver accept:', await one(DR2,`select driver_accept_taxi($1)`,[o3]))
await one(DR,`select driver_accept_taxi($1)`,[o3])
await as(CU,`insert into taxi_orders(user_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,distance_km,vehicle_category,estimated_fare) values ($1,1,1,1,1,1,'ordinary',5)`,[P2])
console.log('P2 insert as CU user_id mismatch (RLS):', 'skip')
// shared
const line='[[33.50,36.20],[33.50,36.30]]'
const TR=await one(DR,`insert into taxi_shared_trips(driver_id,pickup_text,pickup_lat,pickup_lng,dropoff_text,dropoff_lat,dropoff_lng,departure_time,available_seats,total_seats,price_per_seat,route_polyline) values ($1,'أ',33.5,36.2,'ب',33.5,36.3,now()+interval '1 hour',3,3,4,'${line}') returning id`,[DR])
const drs=await one(DR,`select my_wallet()->>'balance'`)
const auto=await one(P2,`select request_shared_join($1,33.501,36.22,33.501,36.28,false,0,0,null)`,[TR])
console.log('auto join:', J(auto), '| DR bal', drs, '→', await one(DR,`select my_wallet()->>'balance'`))
const appr=await one(CU,`select request_shared_join($1,33.53,36.22,33.501,36.28,false,3,5,null)`,[TR])
await one(DR,`select driver_respond_join($1,'counter',2)`,[appr.id]); await one(CU,`select passenger_answer_counter($1,true)`,[appr.id])
console.log('after counter accept DR bal:', await one(DR,`select my_wallet()->>'balance'`), '(expect -0.48 -0.72)')
console.log('driver passengers:', J(await as(DR,`select x->>'name' n, x->>'price' p, x->>'paid' pd, x->>'dropped_at' d from driver_shared_passengers() x`)))
console.log('P2 rides:', J(await as(P2,`select x->>'driver_name' n, x->>'driver_phone' ph, x->>'price' p from my_shared_rides() x`)))
console.log('P2 payables before drop:', J(await as(P2,`select count(*) from my_payables() p where p->>'service'='taxi_shared'`)))
console.log('other marks dropped:', await one(DR2,`select driver_mark_dropped($1)`,[auto.id]), '| passenger marks:', await one(P2,`select driver_mark_dropped($1)`,[auto.id]))
console.log('drop:', J(await one(DR,`select driver_mark_dropped($1)`,[auto.id])), '| again:', await one(DR,`select driver_mark_dropped($1)`,[auto.id]))
console.log('P2 payable:', J(await as(P2,`select p->>'title' t,p->>'gross' g,p->>'to_pay' tp from my_payables() p`)))
await one(P2,`select set_wallet_pin('3690')`); await as(null,`select admin_wallet_adjust($1,10,'شحن')`,[P2])
console.log('P2 pay:', J(await one(P2,`select pay_from_wallet('taxi_shared',$1,1,'3690')`,[auto.id])))
console.log('driver passengers after:', J(await as(DR,`select x->>'name' n, x->>'paid' pd from driver_shared_passengers() x`)), '| P2 rides after:', J(await as(P2,`select count(*) from my_shared_rides()`)))
console.log('DR notifs:', J(await as(DR,`select n->>'title' t, n->>'body' b from my_notifications() n`)))
console.log('CU cannot pay P2 item:', await one(CU,`select pay_from_wallet('taxi_shared',$1,1,'2580')`,[auto.id]))
