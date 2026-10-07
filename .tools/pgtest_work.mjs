import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const D='/home/user/sql-work/';
await db.exec(`
create schema auth; create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create schema storage; create table storage.buckets(id text primary key, name text, public boolean); create table storage.objects(id serial, bucket_id text, name text);
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
create role authenticated; create role anon;
create type user_type as enum('personal','driver','transporter','special_driver','business');
create table profiles(id uuid primary key, full_name text, phone text, avatar_url text, type user_type default 'personal', country text default 'SY',
 event_vehicle_type text, taxi_category text, vehicle_seats int, vehicle_class text, vehicle_model text, vehicle_year int, vehicle_color text, vehicle_plate text, vehicle_photo_url text,
 svc_events boolean, svc_wedding boolean, deleted_at timestamptz, updated_at timestamptz, wallet_id text);
create table wallets(user_id uuid primary key, balance numeric default 0);
create table user_notifications(id serial, user_id uuid, kind text, title text, body text, data jsonb);
create function public.cargo_vehicle_fits(p_order text, p_carrier text) returns boolean language sql immutable as $$
  with m(k, g, r) as (values ('pk800','pickup',1),('md3','medium',1),('truck','truck',1))
  select coalesce((select c.g = o.g and c.r >= o.r from m o, m c where o.k = p_order and c.k = p_carrier), false); $$;
`);
for (const f of ['01','02','03','04']) await db.exec(fs.readFileSync(D+f+'.sql','utf8'));
await db.exec(`grant all on all tables in schema public to authenticated;`);
const A='11111111-1111-1111-1111-111111111111', B='22222222-2222-2222-2222-222222222222';
await db.exec(`insert into profiles(id,phone) values('${A}','+963911'),('${B}','+963922');`);
const as = async (u,q) => { try { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u}',false); set role authenticated;`); const r=await db.query(q); return r.rows[0]; } catch(e){ return 'ERR:'+e.message } finally { await db.exec('reset role') } };
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1};
const base={role:'driver',full_name:'سامر',kind:'car',category:'economy',seats:4,model:'Kia Rio',year:2018,color:'أبيض',plate:'دمشق ١٢٣-٤٥٦',owner:'سامر',fuel:'hybrid',license_no:'L1',license_place:'دمشق',license_expiry:'2027-01-01',events:true,wedding:true,airport:true,contracts:true};
const S=(u,o)=>as(u,`select public.save_work_profile('${JSON.stringify(o)}'::jsonb) a`);
let r=(await db.query(`select public._norm_plate(' ١٢٣-45 أ ') a, public._norm_plate('12345أ') b`)).rows[0]; ok(r.a===r.b && r.a==='12345أ','norm plate');
r=await as(A,`select public.set_work_intent('driver')`); ok((await db.query(`select work_role from profiles where id='${A}'`)).rows[0].work_role==='driver','intent');
r=await as(A,`select public.my_account() a`); ok(r.a.work_role==='driver','my_account work_role');
r=await S(A,{...base,fuel:'x'}); ok(String(r).includes('WORK_FUEL'),'bad fuel');
r=await S(A,{...base,category:null}); ok(String(r).includes('WORK_CATEGORY'),'car needs category');
r=await S(A,base); ok(r.a?.ok,'save driver car');
let p=(await db.query(`select * from profiles where id='${A}'`)).rows[0];
ok(p.type==='driver'&&p.taxi_category==='economy'&&p.event_vehicle_type==='car'&&p.svc_wedding&&p.svc_airport&&p.svc_contracts&&p.work_role===null&&p.work_registered_at,'driver fields');
ok((await db.query(`select count(*)::int c from user_notifications where user_id='${A}'`)).rows[0].c===1,'welcome notif');
r=await S(B,{...base,plate:'دمشق 123456'}); ok(String(r).includes('PLATE_TAKEN'),'plate taken');
r=await S(B,{...base,role:'driver',kind:'bus_mid_27',plate:'999',category:null,wedding:true,airport:true}); ok(r.a?.ok,'bus save');
p=(await db.query(`select * from profiles where id='${B}'`)).rows[0]; ok(p.taxi_category===null&&!p.svc_wedding&&!p.svc_airport&&p.svc_events&&p.vehicle_seats===27,'bus restrictions');
r=await S(B,{...base,role:'carrier',cargo_class:'md3',plate:'999'}); ok(String(r).includes('WORK_TYPE_CHANGE'),'cannot switch driver->carrier');
await db.exec(`update profiles set type='personal' where id='${B}'`);
r=await S(B,{...base,role:'carrier',cargo_class:'md3',plate:'999'}); p=(await db.query(`select * from profiles where id='${B}'`)).rows[0];
ok(r.a?.ok&&p.type==='transporter'&&p.vehicle_class==='md3'&&p.event_vehicle_type===null&&!p.svc_events&&!p.svc_contracts,'carrier save');
r=await S(A,{...base,model:'Kia Picanto'}); ok(r.a?.ok,'re-save same plate ok');
ok((await db.query(`select count(*)::int c from user_notifications where user_id='${A}'`)).rows[0].c===1,'no second welcome');
// block logic
ok((await db.query(`select public.wallet_blocked('${A}') b`)).rows[0].b===false,'not blocked fresh');
await db.exec(`update profiles set work_registered_at=now()-interval '31 days' where id='${A}'`);
ok((await db.query(`select public.wallet_blocked('${A}') b`)).rows[0].b===true,'blocked after 30d no verify');
await db.exec(`update profiles set work_verified_at=now() where id='${A}'`);
ok((await db.query(`select public.wallet_blocked('${A}') b`)).rows[0].b===false,'verified unblocks');
await db.exec(`update profiles set license_expiry=current_date-interval '2 months' where id='${A}'`);
ok((await db.query(`select public.wallet_blocked('${A}') b`)).rows[0].b===false,'expired 2m still ok');
await db.exec(`update profiles set license_expiry=current_date-interval '3 months 1 day' where id='${A}'`);
ok((await db.query(`select public.wallet_blocked('${A}') b`)).rows[0].b===true,'expired >3m blocked');
await db.exec(`insert into wallets values('${B}',-1)`); ok((await db.query(`select public.wallet_blocked('${B}') b`)).rows[0].b===true,'negative still blocks');
// reminders
await db.exec(`update profiles set work_verified_at=null, work_registered_at=now()-interval '29 days 12 hours', license_expiry=current_date-interval '1 day', work_reminders='{}' where id='${A}'`);
r=await as(A,`select public.my_work_status() a`); ok(r.a.work&&!r.a.verified&&r.a.blocked===null,'status');
let n=(await db.query(`select title from user_notifications where user_id='${A}' order by id`)).rows.map(x=>x.title); ok(n.length===4,'reminders v7 v1 l0 sent: '+n.join('|'));
await as(A,`select public.my_work_status() a`); ok((await db.query(`select count(*)::int c from user_notifications where user_id='${A}'`)).rows[0].c===4,'no duplicate reminders');
r=await as(A,`select public.my_work_profile() a`); ok(r.a.plate==='دمشق ١٢٣-٤٥٦'&&r.a.fuel==='hybrid','work profile');
// ct_can_serve
await db.exec(`update profiles set svc_contracts=false where id='${A}'`); ok((await db.query(`select public._ct_can_serve('car','${A}') b`)).rows[0].b===false,'contracts no');
await db.exec(`update profiles set svc_contracts=null where id='${A}'`); ok((await db.query(`select public._ct_can_serve('car','${A}') b`)).rows[0].b===true,'legacy null yes');
