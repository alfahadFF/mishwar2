// اختبار ترحيل المناسبات على Postgres (PGlite). التشغيل: cd /tmp/pg && node /home/user/.tools/pgtest_events.mjs [full|parts]
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
const files=process.argv[2]==='parts'? fs.readdirSync(H+'sql-events').sort().map(f=>H+'sql-events/'+f) : [H+'events-driver-migration.sql']
let lastRows
for (const r of [1,2]) for (const f of files){ const res=await q(fs.readFileSync(f,'utf8'), f.split('/').pop()+' run'+r); lastRows=res.at(-1).rows }
console.log('✅ ran twice:', files.length,'file(s) | check:', JSON.stringify(lastRows.map(r=>Object.values(r).join(': '))))
await db.exec(`grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to anon, authenticated;`)
const CU='11111111-1111-1111-1111-111111111111', BUS='22222222-2222-2222-2222-222222222222', WED='33333333-3333-3333-3333-333333333333', B3='44444444-4444-4444-4444-444444444444'
await db.exec(`insert into auth.users(id, created_at) values ('${CU}',now()),('${BUS}',now()),('${WED}',now()-interval '30 days'),('${B3}',now()-interval '30 days');
insert into profiles(id,full_name,phone,event_vehicle_type,vehicle_seats,vehicle_model,vehicle_year,vehicle_color,svc_events,svc_wedding) values
 ('${CU}','أحمد محمد','0944123456',null,null,null,null,null,false,false),
 ('${BUS}','أبو سامر','0955111222','bus_mid_27',27,'هيونداي كاونتي',2018,'أبيض',true,false),
 ('${WED}','مازن','0966333444','car',4,'مرسيدس E200',2021,'أسود',false,true),
 ('${B3}','أبو علي','0944555666','bus_mid_21',21,'كيا',2015,'أزرق',true,false);
insert into wallets(user_id, balance) values ('${WED}', 5);`)
const as=async(u,sql,p=[])=>{ await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u||''}',false)`); if(u) await db.exec('set role authenticated'); try{ return (await db.query(sql,p)).rows }catch(e){ return 'ERR: '+e.message.split('\n')[0] } finally{ await db.exec('reset role') } }
const one=async(u,sql,p)=>{ const r=await as(u,sql,p); return typeof r==='string'? r : Object.values(r[0]||{})[0] }
// الزبون ينشر (إدخال مباشر كما في التطبيق)
const OID='eeeeeeee-0000-0000-0000-000000000001'
console.log('customer insert:', await as(CU,`insert into event_orders(id,user_id,event_type,gathering_point,gathering_lat,gathering_lng,gathering_time,destinations,duration_hours,num_people,vehicles,total_seats) values ($1,$2,'wedding','الشعلان، دمشق',33.515,36.285,now()+interval '3 days','[{"label":"صالة الأفراح","lat":33.50,"lng":36.24}]',5,46,'[{"type":"wedding_car","seats":4,"count":1,"style":"lux","deco":true},{"type":"bus_mid_21","seats":21,"count":2}]',46) returning status`,[OID,CU]))
console.log('customer update status directly:', await as(CU,`update event_orders set status='accepted' where id='${OID}' returning id`))
console.log('driver reads orders table:', JSON.stringify(await as(BUS,`select count(*) c from event_orders`)))
console.log('BUS feed:', JSON.stringify(await as(BUS,`select f->>'event_type' t, f->>'distance_km' km, f ? 'user_id' leak, jsonb_path_query_array(f->'items','$[*].left') lefts from driver_events_feed(33.5138,36.2765) f`)))
console.log('WED feed:', JSON.stringify(await as(WED,`select f->>'event_type' t from driver_events_feed(33.5138,36.2765) f`)))
console.log('CU feed (own order):', JSON.stringify(await as(CU,`select count(*) from driver_events_feed(33.5138,36.2765)`)))
console.log('far driver:', JSON.stringify(await as(BUS,`select count(*) from driver_events_feed(33.70,36.10)`)))
console.log('BUS offers on wedding car:', await one(BUS,`select driver_send_event_offer($1,'wedding_car',100)`,[OID]))
const busOffer=await one(BUS,`select driver_send_event_offer($1,'bus_mid_21',120,'باص مكيّف')`,[OID]); console.log('BUS offer on bus_21:', busOffer.slice(0,8))
console.log('BUS second offer:', await one(BUS,`select driver_send_event_offer($1,'bus_mid_21',110)`,[OID]))
console.log('BUS direct insert:', await as(BUS,`insert into event_offers(event_order_id,driver_id,offered_price,item_type) values ('${OID}','${BUS}',1,'bus_mid_21')`))
console.log('BUS direct update:', JSON.stringify(await as(BUS,`update event_offers set status='accepted' where id='${busOffer}' returning id`)))
const wedOffer=await one(WED,`select driver_send_event_offer($1,'wedding_car',80)`,[OID])
console.log('WED offer on bus:', await one(WED,`select driver_send_event_offer($1,'bus_mid_21',80)`,[OID]))
console.log('customer offers (identity hidden):', JSON.stringify(await as(CU,`select o->>'price' p, o->'vehicle'->>'model' m, o->>'driver_phone' ph from customer_event_offers($1) o`,[OID])))
console.log('BUS sees customer offers:', JSON.stringify(await as(BUS,`select count(*) from customer_event_offers($1)`,[OID])))
console.log('other user accepts:', await one(BUS,`select accept_event_offer($1)`,[busOffer]))
console.log('accept BUS (free period):', JSON.stringify(await one(CU,`select accept_event_offer($1)`,[busOffer])))
console.log('BUS feed after accept:', JSON.stringify(await as(BUS,`select count(*) from driver_events_feed(33.5138,36.2765)`)))
console.log('BUS jobs:', JSON.stringify(await as(BUS,`select j->>'customer_phone' ph, j->>'commission' c, j->>'item_type' it from driver_event_jobs() j`)))
console.log('accept WED (after free, balance 5):', JSON.stringify(await one(CU,`select accept_event_offer($1)`,[wedOffer])), '| WED wallet:', JSON.stringify(await one(WED,`select my_wallet()`)))
console.log('WED feed (blocked):', JSON.stringify(await as(WED,`select count(*) from driver_events_feed(33.5138,36.2765)`)))
const b3=await one(B3,`select driver_send_event_offer($1,'bus_mid_21',100)`,[OID])
await one(B3,`select driver_withdraw_event_offer($1)`,[b3]); const b3b=await one(B3,`select driver_send_event_offer($1,'bus_mid_21',95)`,[OID]); console.log('B3 re-offer after withdraw:', String(b3b).slice(0,8))
console.log('accept B3 → filled:', JSON.stringify(await one(CU,`select accept_event_offer($1)`,[b3b])))
console.log('my_event_orders:', JSON.stringify(await as(CU,`select o->>'status' s, jsonb_path_query_array(o->'items','$[*].left') l from my_event_orders() o`)))
console.log('B3 wallet tx:', JSON.stringify(await as(B3,`select my_wallet()->'balance' b`)))
await one(BUS,`select driver_complete_event($1)`,[busOffer]); await one(WED,`select driver_complete_event($1)`,[wedOffer]); await one(B3,`select driver_complete_event($1)`,[b3b])
console.log('order after all complete:', JSON.stringify(await as(CU,`select status from event_orders`)))
console.log('BUS changes own vehicle:', JSON.stringify(await as(BUS,`update profiles set event_vehicle_type='bus_large_50' where id='${BUS}' returning id`)))
console.log('BUS changes own phone:', JSON.stringify(await as(BUS,`update profiles set phone='0900' where id='${BUS}' returning phone`)))
// ---- دوال الشاشات ----
if (process.argv[3]==='screens'){
  for (const r of [1,2]){ const res=await q(fs.readFileSync(H+'app-screens-migration.sql','utf8'),'screens run'+r); if(r===2) console.log('screens check:', JSON.stringify(res.at(-1).rows)) }
  await db.exec(`select set_config('request.jwt.claim.sub','',false); update profiles set vehicle_class='md5' where id='${B3}'; update wallets set balance=100 where user_id='${B3}'; update profiles set vehicle_class='md3' where id='${BUS}'`)
  const CO='cccccccc-0000-0000-0000-000000000001'
  console.log('cargo insert:', JSON.stringify(await as(CU,`insert into cargo_orders(id,customer_id,cargo_type,vehicle_class,pickup_points,dropoff_points,budget_type,budget_from,budget_to,status) values ($1,$2,'أثاث','md4','[{"lat":33.515,"lng":36.285,"label":"أ"}]','[{"lat":33.49,"lng":36.30,"label":"ب"}]','fixed',50,80,'open') returning id`,[CO,CU])))
  console.log('B3 feed:', JSON.stringify(await as(B3,`select count(*) from carrier_cargo_feed(33.5138,36.2765,10)`)), '| BUS(md3) feed:', JSON.stringify(await as(BUS,`select count(*) from carrier_cargo_feed(33.5138,36.2765,10)`)))
  const off=await one(B3,`select carrier_send_cargo_offer($1,70,'جاهز')`,[CO])
  console.log('B3 my offers:', JSON.stringify(await as(B3,`select f->>'price' p, f->>'status' s, f->>'cargo_type' t from carrier_my_cargo_offers() f`)))
  console.log('customer offers:', JSON.stringify(await as(CU,`select f->>'price' p, f->>'carrier_vehicle' v, f ? 'driver_id' leak from customer_cargo_offers($1) f`,[CO])))
  console.log('other sees customer offers:', JSON.stringify(await as(BUS,`select count(*) from customer_cargo_offers($1)`,[CO])))
  console.log('my_cargo_orders before:', JSON.stringify(await as(CU,`select o->>'status' s, o->>'carrier_phone' ph from my_cargo_orders() o`)))
  console.log('accept:', await as(CU,`select accept_cargo_offer($1)`,[off]))
  console.log('my_cargo_orders after:', JSON.stringify(await as(CU,`select o->>'status' s, o->>'carrier_phone' ph, o->>'agreed_price' p from my_cargo_orders() o`)))
  console.log('B3 jobs:', JSON.stringify(await as(B3,`select j->>'customer_phone' ph from carrier_my_cargo_jobs() j`)))
  console.log('complete:', JSON.stringify(await as(B3,`select carrier_complete_cargo($1)`,[CO])))
  console.log('profile:', JSON.stringify(await one(BUS,`select my_driver_profile()`)))
}
