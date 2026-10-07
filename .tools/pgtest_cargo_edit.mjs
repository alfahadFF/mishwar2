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
for (const r of [1,2]) for (const f of ['m1.sql','m2.sql','m3.sql']) { const res=await q(fs.readFileSync(H+'sql-cargo-edit/'+f,'utf8'), f+' run'+r); if(f==='m3.sql'&&r===2) console.log('check:', JSON.stringify(res.at(-1).rows)) }
await db.exec(`grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to anon, authenticated;`)
const CU='11111111-1111-1111-1111-111111111111', CR='22222222-2222-2222-2222-222222222222', OT='33333333-3333-3333-3333-333333333333', SM='44444444-4444-4444-4444-444444444444'
await db.exec(`insert into auth.users(id) values ('${CU}'),('${CR}'),('${OT}'),('${SM}');
insert into profiles(id,full_name,phone,vehicle_class) values ('${CU}','زبون','0944',null),('${CR}','ناقل','0955','md5'),('${OT}','آخر','0966','md3'),('${SM}','صغير','0977','md3');
update profiles set vehicle_class=null where id='${CU}';`)
const as=async(u,sql,p=[])=>{ await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u||''}',false)`); if(u) await db.exec('set role authenticated'); try{ return (await db.query(sql,p)).rows }catch(e){ return 'ERR: '+e.message.split('\n')[0] } finally{ await db.exec('reset role') } }
const one=async(u,sql,p)=>{ const r=await as(u,sql,p); return typeof r==='string'? r : Object.values(r[0]||{})[0] }
const pts='[{"label":"أ","lat":33.5,"lng":36.3}]'
const id=await one(CU,`insert into cargo_orders(customer_id,cargo_type,vehicle_class,pickup_points,dropoff_points,timing_type,budget_type,budget_from,budget_to,status,carrier_id,agreed_price) values ('${OT}','أثاث','md3','${pts}','${pts}','urgent','fixed',50,80,'accepted','${OT}',1) returning id`)
console.log('insert forged:', JSON.stringify(await as(null,`select customer_id=$2 own, status, carrier_id, agreed_price from cargo_orders where id=$1`,[id,CU])))
console.log('other reads:', JSON.stringify(await as(OT,`select count(*) from cargo_orders`)), '| owner reads:', JSON.stringify(await as(CU,`select count(*) from cargo_orders`)))
console.log('direct update:', JSON.stringify(await as(CU,`update cargo_orders set status='completed' where id=$1 returning id`,[id])), '| direct delete:', JSON.stringify(await as(CU,`delete from cargo_orders where id=$1 returning id`,[id])))
console.log('offers:', await one(CR,`select carrier_send_cargo_offer($1,70,null)`,[id]) ? 'CR ok':'', await one(SM,`select carrier_send_cargo_offer($1,60,null)`,[id]) ? 'SM ok':'')
console.log('other edits:', await one(OT,`select edit_cargo_order($1,'{"notes":"x"}')`,[id]))
console.log('edit status field:', await one(CU,`select edit_cargo_order($1,'{"status":"completed"}')`,[id]))
console.log('bad time:', await one(CU,`select edit_cargo_order($1,'{"timing_type":"scheduled"}')`,[id]))
console.log('open edit:', JSON.stringify(await one(CU,`select edit_cargo_order($1,'{"timing_type":"scheduled","scheduled_date":"2026-10-05","scheduled_time":"09:30","notes":"الطابق الثالث","vehicle_class":"md4","budget_to":90}')`,[id])))
console.log('row:', JSON.stringify(await as(null,`select scheduled_date, scheduled_time, notes, vehicle_class, budget_to, edited_at from cargo_orders where id=$1`,[id])))
console.log('offers after class change:', JSON.stringify(await as(null,`select p.full_name, f.status from cargo_offers f join profiles p on p.id=f.driver_id order by 1`)))
const off=await one(null,`select id from cargo_offers where status='pending'`)
console.log('accept:', JSON.stringify(await one(CU,`select accept_cargo_offer($1)`,[off])))
console.log('accepted edit price:', await one(CU,`select edit_cargo_order($1,'{"budget_to":10}')`,[id]))
console.log('accepted edit time:', JSON.stringify(await one(CU,`select edit_cargo_order($1,'{"scheduled_date":"2026-10-06","scheduled_time":"11:00","notes":"الطابق الثالث"}')`,[id])))
console.log('same again:', JSON.stringify(await one(CU,`select edit_cargo_order($1,'{"scheduled_date":"2026-10-06"}')`,[id])))
console.log('carrier jobs:', JSON.stringify(await as(CR,`select j->>'scheduled_date' d, j->>'scheduled_time' t, j->>'notes' n, j->'edited_fields' ef, (j->>'edited_at') is not null e from carrier_my_cargo_jobs() j`)))
console.log('carrier reads row:', JSON.stringify(await as(CR,`select count(*) from cargo_orders`)))
console.log('my orders:', JSON.stringify(await as(CU,`select o->>'notes' n, o->>'status' s from my_cargo_orders() o`)))
console.log('cancel accepted:', await one(CU,`select cancel_cargo_order($1)`,[id]))
const id2=await one(CU,`insert into cargo_orders(cargo_type,vehicle_class,pickup_points,dropoff_points) values ('صناديق','md3','${pts}','${pts}') returning id`)
await one(OT,`select carrier_send_cargo_offer($1,40,null)`,[id2])
console.log('cancel open:', JSON.stringify(await as(CU,`select cancel_cargo_order($1)`,[id2])), JSON.stringify(await as(null,`select o.status, f.status fs from cargo_orders o join cargo_offers f on f.cargo_order_id=o.id where o.id=$1`,[id2])))
console.log('edit cancelled:', await one(CU,`select edit_cargo_order($1,'{"notes":"y"}')`,[id2]))
console.log('carrier complete:', JSON.stringify(await as(CR,`select carrier_complete_cargo($1)`,[id])), await one(null,`select status from cargo_orders where id=$1`,[id]))
