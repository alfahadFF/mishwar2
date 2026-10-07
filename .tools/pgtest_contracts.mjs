// اختبار ترحيل العقود على Postgres (PGlite). التشغيل: cd /tmp/pg && node /home/user/.tools/pgtest_contracts.mjs [full|parts]
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
create table public.wallets(user_id uuid, updated_at timestamptz default now());`,'env')
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
const PD=process.argv[3]||'sql-contracts'; const files=process.argv[2]==='parts'? fs.readdirSync(H+PD).sort().map(f=>H+PD+'/'+f) : [H+'contracts-driver-migration.sql']
let lastRows
for (const r of [1,2]) for (const f of files){ const res=await q(fs.readFileSync(f,'utf8'), f.split('/').pop()+' run'+r); lastRows=res.at(-1).rows }
console.log('✅ ran twice:', files.length,'file(s) | check:', JSON.stringify(lastRows.map(r=>Object.values(r).join(': '))))
await db.exec(`grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to anon, authenticated;`)
const CU='11111111-1111-1111-1111-111111111111', BUS='22222222-2222-2222-2222-222222222222', CAR='33333333-3333-3333-3333-333333333333', B3='44444444-4444-4444-4444-444444444444', VAN='55555555-5555-5555-5555-555555555555'
await db.exec(`insert into auth.users(id, created_at) values ('${CU}',now()),('${BUS}',now()),('${CAR}',now()-interval '30 days'),('${B3}',now()-interval '30 days'),('${VAN}',now()-interval '30 days');
insert into profiles(id,full_name,phone,event_vehicle_type,vehicle_seats,vehicle_model,vehicle_year,vehicle_color,svc_events,svc_wedding) values
 ('${CU}','أحمد محمد','0944123456',null,null,null,null,null,false,false),
 ('${BUS}','أبو سامر','0955111222','bus_mid_27',27,'هيونداي كاونتي',2018,'أبيض',false,false),
 ('${CAR}','مازن','0966333444','car',4,'كيا ريو',2019,'فضي',false,false),
 ('${B3}','أبو علي','0944555666','bus_mid_21',21,'كيا',2015,'أزرق',false,false),
 ('${VAN}','سليم','0933777888','van_11',11,'هونداي H1',2016,'أبيض',false,false);
insert into wallets(user_id, balance) values ('${CAR}', 5), ('${B3}', 100);`)
const as=async(u,sql,p=[])=>{ await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u||''}',false)`); if(u) await db.exec('set role authenticated'); try{ return (await db.query(sql,p)).rows }catch(e){ return 'ERR: '+e.message.split('\n')[0] } finally{ await db.exec('reset role') } }
const one=async(u,sql,p)=>{ const r=await as(u,sql,p); return typeof r==='string'? r : Object.values(r[0]||{})[0] }
const M='cccccccc-0000-0000-0000-00000000000m'.replace('m','1'), D='cccccccc-0000-0000-0000-000000000002'
const ins=(id,unit,n,start,veh)=>`insert into contract_orders(id,user_id,contract_category,contract_role,num_people,pickup_points,destinations,days,contract_unit,unit_count,start_date,vehicles,total_seats,budget_type) values ('${id}','${CU}','school','institution',25,'[{"label":"المزة","lat":33.505,"lng":36.25}]','[{"label":"المدرسة","lat":33.52,"lng":36.29}]','{0,1,2,3,4}','${unit}',${n},${start},'${veh}',25,'quote') returning end_date, duration_type`
console.log('insert monthly:', JSON.stringify(await as(CU, ins(M,'month',3,"current_date - 40",'[{"type":"bus_mid_21","seats":21,"count":1},{"type":"car","seats":4,"count":1}]'))))
console.log('insert daily:', JSON.stringify(await as(CU, ins(D,'day',5,"'2026-10-03'",'[{"type":"bus_mid_21","seats":21,"count":1}]'))), '(2026-10-03 سبت، دوام أحد-خميس → 5 أيام = الخميس 10-08)')
console.log('insert as accepted:', await as(CU,`insert into contract_orders(user_id,contract_category,contract_role,num_people,contract_unit,unit_count,status) values ('${CU}','school','parent',2,'week',2,'accepted')`))
console.log('weekly end:', await one(null,`select public._ct_end_date('2026-10-01','week',2,'{}')`), '| monthly end:', await one(null,`select public._ct_end_date('2026-10-01','month',7,'{}')`))
console.log('others read orders:', JSON.stringify(await as(BUS,`select count(*) from contract_orders`)), '| customer direct update:', JSON.stringify(await as(CU,`update contract_orders set status='accepted' where id='${M}' returning id`)))
console.log('BUS feed:', JSON.stringify(await as(BUS,`select f->>'contract_unit' u, f ? 'user_id' leak, jsonb_path_query_array(f->'items','$[*].left') l from driver_contracts_feed(33.51,36.26) f`)))
console.log('CAR feed (no svc flag needed):', JSON.stringify(await as(CAR,`select count(*) from driver_contracts_feed(33.51,36.26)`)), '| far:', JSON.stringify(await as(BUS,`select count(*) from driver_contracts_feed(33.80,36.60)`)))
console.log('BUS offers car item:', await one(BUS,`select driver_send_contract_offer($1,'car',50)`,[M]))
const bo=await one(BUS,`select driver_send_contract_offer($1,'bus_mid_21',100,'باص مكيّف')`,[M]); console.log('BUS offer:', String(bo).slice(0,8))
console.log('BUS second offer:', await one(BUS,`select driver_send_contract_offer($1,'bus_mid_21',90)`,[M]))
console.log('BUS direct insert:', await as(BUS,`insert into contract_offers(contract_order_id,driver_id,offered_price,item_type) values ('${M}','${BUS}',1,'bus_mid_21')`))
console.log('others read offers:', JSON.stringify(await as(CAR,`select count(*) from contract_offers`)))
const co=await one(CAR,`select driver_send_contract_offer($1,'car',50)`,[M])
console.log('customer offers:', JSON.stringify(await as(CU,`select o->>'item_type' it, o->>'price' p, o->>'total' t, o->>'unit' u, o->'vehicle'->>'model' m, o->>'driver_phone' ph from customer_contract_offers($1) o`,[M])))
console.log('accept BUS (free):', JSON.stringify(await one(CU,`select accept_contract_offer($1)`,[bo])))
console.log('accept CAR (5 balance, monthly 50 → 6):', JSON.stringify(await one(CU,`select accept_contract_offer($1)`,[co])), '| CAR wallet:', JSON.stringify(await one(CAR,`select my_wallet()->'balance'`)))
console.log('order status:', await one(CU,`select status from contract_orders where id='${M}'`))
console.log('CAR feed blocked:', JSON.stringify(await as(CAR,`select count(*) from driver_contracts_feed(33.51,36.26)`)))
console.log('CAR settle (month 2 due 10 days ago, after free):', JSON.stringify(await one(CAR,`select contract_settle_my_dues()`)), '| again:', JSON.stringify(await one(CAR,`select contract_settle_my_dues()`)))
console.log('BUS settle (month 2 due inside free period):', JSON.stringify(await one(BUS,`select contract_settle_my_dues()`)), '| trial tx:', JSON.stringify(await as(BUS,`select amount, is_trial from wallet_transactions order by created_at`)))
console.log('CAR jobs:', JSON.stringify(await as(CAR,`select j->>'customer_phone' ph, j->>'months_charged' mc, j->>'commission_total' ct, j->>'next_due' nd, j->>'active' a from driver_contract_jobs() j`)))
console.log('BUS ends contract:', await as(BUS,`select end_contract_offer($1)`,[co]))
console.log('CU ends CAR:', JSON.stringify(await as(CU,`select end_contract_offer($1)`,[co])), '| CAR jobs next_due:', JSON.stringify(await as(CAR,`select j->>'next_due' nd, j->>'active' a from driver_contract_jobs() j`)))
console.log('cancel with accepted:', await as(CU,`select cancel_contract_order($1)`,[M]))
const b3=await one(B3,`select driver_send_contract_offer($1,'bus_mid_21',20)`,[D])
console.log('daily accept B3 (20×5=100 → 12):', JSON.stringify(await one(CU,`select accept_contract_offer($1)`,[b3])), '| B3 balance:', JSON.stringify(await one(B3,`select my_wallet()->'balance'`)))
console.log('B3 settle daily:', JSON.stringify(await one(B3,`select contract_settle_my_dues()`)))
console.log('VAN sees filled daily:', JSON.stringify(await as(VAN,`select count(*) from driver_contracts_feed(33.51,36.26)`)))
console.log('my_contract_orders:', JSON.stringify(await as(CU,`select o->>'contract_unit' u, o->>'status' s, o->>'end_date' e, jsonb_path_query_array(o->'items','$[*].left') l from my_contract_orders() o order by o->>'contract_unit'`)))
console.log('CU ends BUS → completed:', JSON.stringify(await as(CU,`select end_contract_offer($1)`,[bo])), await one(CU,`select status from contract_orders where id='${M}'`))
