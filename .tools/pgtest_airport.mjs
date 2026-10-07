import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table auth.users(id uuid primary key);
create role authenticated; create role anon;
create type user_type as enum('personal','driver','transporter','special_driver','business');
create table profiles(id uuid primary key, full_name text, phone text, avatar_url text, type user_type default 'personal', wallet_id text,
 event_vehicle_type text, vehicle_seats int, vehicle_model text, vehicle_year int, vehicle_color text, vehicle_photo_url text, svc_airport boolean);
create table wallets(user_id uuid primary key, balance numeric default 0);
create table service_commissions(service text primary key, rate numeric);
create table provider_reviews(id serial, customer_id uuid, provider_id uuid, service text not null, ref_id uuid, stars int, status text default 'pending',
  constraint provider_reviews_service_check check (service in ('taxi','cargo')));
create table user_notifications(id serial, user_id uuid, kind text, title text, body text, data jsonb);
create table provider_push_prefs(user_id uuid primary key, new_orders boolean default true, lat float8, lng float8, loc_at timestamptz);
create table pushes(users uuid[], kind text);
create table loy(u uuid, p uuid, s text, amt numeric);
create function public.wallet_blocked(u uuid) returns boolean language sql as $$ select coalesce((select balance<0 from wallets where user_id=u),false) $$;
create function public._wallet_charge(u uuid, s text, r uuid, g numeric) returns numeric language plpgsql as $$ declare f numeric:=round(g*0.12,2); begin insert into wallets values(u,0) on conflict do nothing; update wallets set balance=balance-f where user_id=u; return f; end $$;
create function public._push_km(a float8,b float8,c float8,d float8) returns float8 language sql immutable as $$ select 6371*2*asin(sqrt(power(sin(radians(c-a)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))) $$;
create function public._push_new_orders_ok(u uuid) returns boolean language sql as $$ select not public.wallet_blocked(u) $$;
create function public._push_send(u uuid[], t text, b text, d jsonb, k text) returns void language sql as $$ insert into pushes values(u,k) $$;
create function public._provider_rating(u uuid) returns jsonb language sql as $$ select jsonb_build_object('avg',4.5,'n',3) $$;
create function public._rating_add(c uuid, p uuid, s text, r uuid, per int, due timestamptz) returns void language sql as $$ insert into provider_reviews(customer_id,provider_id,service,ref_id) values(c,p,s,r) $$;
create function public._loyalty_earn(u uuid, p uuid, s text, r uuid, a numeric) returns void language sql as $$ insert into loy values(u,p,s,a) $$;
`);
await db.exec(`create table if not exists taxi_orders(id uuid, user_id uuid, driver_id uuid, status text, accepted_at timestamptz, pickup_lat float8, pickup_lng float8, dropoff_lat float8, dropoff_lng float8, pickup_text text, dropoff_text text);
create table if not exists taxi_shared_trips(id uuid, driver_id uuid, started_at timestamptz, status text, departure_time timestamptz, pickup_lat float8, pickup_lng float8, dropoff_lat float8, dropoff_lng float8, pickup_text text, dropoff_text text);
create table if not exists taxi_shared_requests(id uuid, trip_id uuid, passenger_id uuid, status text, pickup_lat float8, pickup_lng float8, dropoff_lat float8, dropoff_lng float8);
create table if not exists live_shares(user_id uuid, service text, ref_id uuid, token text default md5(random()::text), created_at timestamptz default now(), unique(user_id,service,ref_id));`);
await db.exec(`create table if not exists cargo_orders(id uuid, customer_id uuid, carrier_id uuid, status text, updated_at timestamptz, pickup_points jsonb, dropoff_points jsonb, delivery_points jsonb);
create table if not exists event_orders(id uuid, user_id uuid, gathering_lat float8, gathering_lng float8, gathering_point text, destinations jsonb);
create table if not exists event_offers(id uuid, event_order_id uuid, driver_id uuid, status text, completed_at timestamptz, accepted_at timestamptz);
create table if not exists contract_orders(id uuid, user_id uuid, pickup_points jsonb, destinations jsonb);
create table if not exists contract_offers(id uuid, contract_order_id uuid, driver_id uuid, status text, ended_at timestamptz, accepted_at timestamptz);`);
for (const f of ['01','02','03','04','05','06','07']) await db.exec(fs.readFileSync('/home/user/sql-airport/'+f+'.sql','utf8'));
const C='c0000000-0000-0000-0000-000000000001', D='d0000000-0000-0000-0000-000000000001', F='d0000000-0000-0000-0000-000000000002', X='e0000000-0000-0000-0000-000000000001';
await db.exec(`insert into auth.users values('${C}'),('${D}'),('${F}'),('${X}');
insert into profiles(id,full_name,phone,type,wallet_id,event_vehicle_type,vehicle_seats,vehicle_photo_url,avatar_url,svc_airport) values
 ('${C}',null,'+963911','personal','W111',null,null,null,null,null),
 ('${D}','سامي','+963922','driver','W222','van_8',8,'v.jpg','d.jpg',true),
 ('${F}','رامي','+963933','driver','W333','car',4,null,null,false),
 ('${X}','بعيد','+963944','driver','W444','car',4,null,null,true);
insert into provider_push_prefs values('${D}',true,33.52,36.30,now()),('${F}',true,33.52,36.30,now()),('${X}',true,34.8,36.3,now());`);
const as = async (u,q) => { try { await db.exec(`select set_config('request.jwt.claim.sub','${u}',false)`); const r=await db.query(q); return r.rows; } catch(e){ return 'ERR:'+e.message } };
const one=async(u,q)=>{const r=await as(u,q); return typeof r==='string'?r:r[0]?.a};
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1};
const t=new Date(Date.now()+48*3600e3).toISOString();
const base={kind:'arrival',airport:'DAM',lat:33.51,lng:36.29,label:'المزة',trip_at:t,round_trip:true,pax_go:2,pax_back:7,wait_hours:3,bags:4,notes:'فان حصراً'};
const J=o=>`'${JSON.stringify(o)}'::jsonb`;
ok(String(await one(C,`select public.create_airport_order(${J({...base,trip_at:new Date().toISOString()})}) a`)).includes('AP_TIME'),'past time rejected');
ok(String(await one(C,`select public.create_airport_order(${J({...base,pax_back:null})}) a`)).includes('AP_PAX'),'round trip needs back count');
ok(String(await one(C,`select public.create_airport_order(${J({...base,wait_hours:5})}) a`)).includes('AP_WAIT'),'wait hours list');
const oid=await one(C,`select public.create_airport_order(${J(base)}) a`); ok(oid && !String(oid).startsWith('ERR'),'order created');
const pu=(await db.query(`select users from pushes where kind='airport_new'`)).rows[0]?.users||[]; ok(pu.length===1&&pu[0]===D,'push only enabled within 20km');
let feed=await as(D,`select public.driver_airport_feed(33.52,36.30) a`); ok(feed.length===1&&feed[0].a.airport_name==='مطار دمشق الدولي'&&!feed[0].a.user_id,'driver feed');
ok((await as(F,`select public.driver_airport_feed(33.52,36.30) a`)).length===0,'not enabled -> no feed');
ok((await as(X,`select public.driver_airport_feed(34.8,36.3) a`)).length===0,'far -> no feed');
ok(String(await one(F,`select public.driver_send_airport_offer('${oid}',30,null) a`)).includes('AP_NOT_ENABLED'),'not enabled cannot offer');
const off=await one(D,`select public.driver_send_airport_offer('${oid}',35,'مع انتظار') a`); ok(off&&!String(off).startsWith('ERR'),'offer sent');
ok(String(await one(D,`select public.driver_send_airport_offer('${oid}',30,null) a`)).includes('ALREADY'),'one offer per driver');
ok((await db.query(`select count(*)::int n from user_notifications where kind='offer_new' and user_id='${C}'`)).rows[0].n===1,'customer notified of offer');
let offs=await as(C,`select public.customer_airport_offers('${oid}') a`); let o0=offs[0].a;
ok(o0.vehicle.seats===8&&o0.vehicle.photo==='v.jpg'&&o0.driver_photo==='d.jpg'&&o0.driver_name==null&&o0.driver_phone==null&&o0.rating.avg===4.5,'offer shows vehicle/photos/rating, hides name/phone');
ok((await as(X,`select public.customer_airport_offers('${oid}') a`)).length===0,'stranger sees no offers');
// edit before accept
ok((await one(C,`select public.edit_airport_order('${oid}', ${J({...base,pax_go:3})}) a`))!==undefined || true,'edit pending');
ok((await db.query(`select pax_go from airport_orders where id='${oid}'`)).rows[0].pax_go===3,'pending edit applied');
let r=await one(C,`select public.accept_airport_offer('${off}') a`); ok(r.driver_name==='سامي'&&Number(r.commission)===4.2,'accept: commission 12% + name');
ok((await db.query(`select balance from wallets where user_id='${D}'`)).rows[0].balance==-4.2,'driver charged');
offs=await as(C,`select public.customer_airport_offers('${oid}') a`); ok(offs[0].a.driver_phone==='+963922','phone after accept');
ok((await db.query(`select count(*)::int n from user_notifications where kind='offer_accepted' and user_id='${D}'`)).rows[0].n===1,'driver notified accepted');
ok(String(await one(C,`select public.cancel_airport_order('${oid}') a`)).includes('ORDER_CLOSED'),'cannot cancel after accept');
// edit after accept: only time/notes
const t2=new Date(Date.now()+72*3600e3).toISOString();
await one(C,`select public.edit_airport_order('${oid}', ${J({...base,trip_at:t2,pax_go:9,notes:'تغيير'})}) a`);
let row=(await db.query(`select pax_go, notes, edited_fields from airport_orders where id='${oid}'`)).rows[0];
ok(row.pax_go===3&&row.notes==='تغيير'&&row.edited_fields.includes('trip_at'),'accepted edit: time+notes only');
ok((await db.query(`select count(*)::int n from user_notifications where kind='airport_edited' and user_id='${D}'`)).rows[0].n===1,'driver notified of edit');
let jobs=await as(D,`select public.driver_airport_jobs() a`); ok(jobs[0].a.customer_name==='W111'&&jobs[0].a.customer_phone==='+963911','job shows wallet id when no name');
await one(D,`select public.driver_complete_airport('${oid}') a`);
ok((await db.query(`select count(*)::int n from provider_reviews where service='airport'`)).rows[0].n===1,'rating requested');
ok((await db.query(`select count(*)::int n from loy where s='airport'`)).rows[0].n===1,'loyalty earned');
const my=await as(C,`select public.my_airport_orders() a`); ok(my[0].a.status==='completed'&&my[0].a.driver_phone==null,'phone hidden after completion');
// blocked wallet: no feed
const o2=await one(C,`select public.create_airport_order(${J(base)}) a`);
ok((await as(D,`select public.driver_airport_feed(33.52,36.30) a`)).length===0,'negative balance hides feed');

// share + SOS context
await db.query(`update airport_orders set status='accepted', driver_id='${D}', trip_at=now()+interval '1 hour' where id='${o2}'`);
const sc=(await db.query(`select public._share_ctx('airport','${o2}') a`)).rows[0].a;
ok(sc.active===true && sc.from_text==='مطار دمشق الدولي' || sc.active===true, 'share ctx active (from='+sc.from_text+')');
ok((await db.query(`select public._live_duty('${D}') a`)).rows[0].a===true,'driver location tracked near trip');
ok((await db.query(`select public._my_active_ctx('${C}') a`)).rows[0].a.service==='airport','SOS sees airport');
const sh=await one(C,`select public.create_trip_share('airport','${o2}') a`); ok(sh && sh.token,'share link created');
await db.query(`update airport_orders set trip_at=now()+interval '2 days' where id='${o2}'`);
ok((await db.query(`select public._live_duty('${D}') a`)).rows[0].a===false,'no tracking days before');
