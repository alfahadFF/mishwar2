import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
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
create function public.cargo_vehicle_fits(a text, b text) returns boolean language sql as $$ select true $$;
`);
for (const f of ['01','02','03','04']) await db.exec(fs.readFileSync('/home/user/sql-work/'+f+'.sql','utf8'));
for (const f of ['01','02']) await db.exec(fs.readFileSync('/home/user/sql-office/'+f+'.sql','utf8'));
await db.exec(`grant all on all tables in schema public to authenticated;`);
const A='11111111-1111-1111-1111-111111111111', B='22222222-2222-2222-2222-222222222222';
await db.exec(`insert into profiles(id,phone) values('${A}','+963911'),('${B}','+963922');`);
const as = async (u,q) => { try { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u}',false); set role authenticated;`); const r=await db.query(q); return r.rows[0]; } catch(e){ return 'ERR:'+e.message } finally { await db.exec('reset role') } };
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1};
const o={office_name:'مكتب النور',manager:'أحمد',city:'دمشق',lat:33.5,lng:36.3,cr_number:'CR-1'};
await as(A,`select public.set_work_intent('office')`); ok((await db.query(`select work_role from profiles where id='${A}'`)).rows[0].work_role==='office','intent office');
let r=await as(A,`select public.save_office_profile('${JSON.stringify({...o,lat:null})}'::jsonb) a`); ok(String(r).includes('OFFICE_LOCATION'),'needs location');
r=await as(A,`select public.save_office_profile('${JSON.stringify(o)}'::jsonb) a`); ok(r.a?.ok,'save office');
let p=(await db.query(`select * from profiles where id='${A}'`)).rows[0]; ok(p.type==='business'&&p.full_name==='مكتب النور'&&p.work_registered_at&&p.work_role===null,'office fields');
r=await as(A,`select public.my_work_profile() a`); ok(r.a.office_name==='مكتب النور'&&r.a.cr_number==='CR-1','work profile office');
r=await as(A,`select public.save_work_profile('{"role":"driver"}'::jsonb) a`); ok(String(r).includes('WORK_TYPE_CHANGE'),'office cannot become driver');
await db.exec(`update profiles set type='driver' where id='${B}'`);
r=await as(B,`select public.save_office_profile('${JSON.stringify(o)}'::jsonb) a`); ok(String(r).includes('WORK_TYPE_CHANGE'),'driver cannot become office');
await as(B,`select public.set_rental_service(true)`); ok((await db.query(`select svc_rental from profiles where id='${B}'`)).rows[0].svc_rental===true,'driver rental flag');
await as(A,`select public.set_rental_service(true)`); ok((await db.query(`select svc_rental from profiles where id='${A}'`)).rows[0].svc_rental===null,'office flag untouched');
