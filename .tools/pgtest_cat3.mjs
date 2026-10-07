import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create schema storage; create table storage.buckets(id text primary key, name text, public boolean); create table storage.objects(id serial, bucket_id text, name text);
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
create role authenticated; create role anon;
create type user_type as enum('personal','driver','transporter','special_driver','business');
create table profiles(id uuid primary key, full_name text, phone text, avatar_url text, type user_type default 'personal', country text default 'SY',
 event_vehicle_type text, taxi_category text, vehicle_seats int, vehicle_class text, vehicle_model text, vehicle_year int, vehicle_color text, vehicle_plate text, vehicle_photo_url text,
 svc_events boolean, svc_wedding boolean, deleted_at timestamptz, updated_at timestamptz, wallet_id text, is_admin boolean default false);
create table wallets(user_id uuid primary key, balance numeric default 0);
create table user_notifications(id serial, user_id uuid, kind text, title text, body text, data jsonb);
create table app_settings(key text primary key, value text not null);
create function public.cargo_vehicle_fits(a text, b text) returns boolean language sql as $$ select true $$;
create function public._is_admin() returns boolean language sql as $$ select coalesce((select is_admin from profiles where id=auth.uid()),true) $$;
create function public._notify_admins(k text,t text,b text,d jsonb) returns void language sql as $$ insert into user_notifications(user_id,kind,title,body,data) select id,k,t,b,d from profiles where is_admin $$;
`);
for (const f of ['01','02','03','04']) await db.exec(fs.readFileSync('/home/user/sql-work/'+f+'.sql','utf8'));
for (const f of ['01','02']) await db.exec(fs.readFileSync('/home/user/sql-office/'+f+'.sql','utf8'));
await db.exec(`create table if not exists taxi_driver_positions(driver_id uuid primary key, lat float8, lng float8, category text, updated_at timestamptz);`);
for (const f of ['01','02']) await db.exec(fs.readFileSync('/home/user/sql-cat2/'+f+'.sql','utf8'));
// old state: an approved luxury small car before migration
const PRE=1;
await db.exec(`grant all on all tables in schema public to authenticated;`);
const A='11111111-1111-1111-1111-111111111111', B='22222222-2222-2222-2222-222222222222', ADM='33333333-3333-3333-3333-333333333333';
await db.exec(`insert into profiles(id,phone) values('${A}','+963911'),('${B}','+963922'); insert into profiles(id,phone,is_admin) values('${ADM}','+963933',true);`);
const as = async (u,q) => { try { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u}',false); set role authenticated;`); const r=await db.query(q); return r.rows[0]; } catch(e){ return 'ERR:'+e.message } finally { await db.exec('reset role') } };
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1};
const base={role:'driver',full_name:'سامي',kind:'car',model:'Kia Rio',year:2015,color:'أبيض',plate:'123 دمشق',owner:'سامي',fuel:'petrol',license_no:'1',license_place:'دمشق',license_expiry:'2030-01-01'};
const save=(u,o)=>as(u,`select public.save_work_profile('${JSON.stringify(o)}'::jsonb) a`);
const cat=async u=>(await db.query(`select taxi_category c, engine_cc, luxury_requested l from profiles where id='${u}'`)).rows[0];
let r=await save(A,base); ok(String(r).includes('WORK_CC'),'cc required for petrol car');
r=await save(A,{...base,engine_cc:1300}); ok(r.a?.ok && (await cat(A)).c==='economy','1300 -> economy');
r=await save(A,{...base,engine_cc:1600}); ok((await cat(A)).c==='ordinary','1600 -> ordinary');
r=await save(A,{...base,engine_cc:2000,fuel:'hybrid'}); ok((await cat(A)).c==='economy','hybrid -> economy');
r=await save(A,{...base,fuel:'electric'}); ok(r.a?.ok && (await cat(A)).c==='economy','electric no cc -> economy');

r=await save(A,{...base,engine_cc:1500}); await db.exec(`update profiles set taxi_category='luxury', luxury_requested=true where id='${A}'`);
await db.exec(`insert into taxi_driver_positions(driver_id, category) values ('${A}','luxury')`);
for (const f of ['01','02']) await db.exec(fs.readFileSync('/home/user/sql-cat3/'+f+'.sql','utf8'));
let c=await cat(A); ok(c.c==='ordinary'&&c.l===null,'migration recomputed old luxury 1500 -> ordinary');
ok((await db.query(`select category from taxi_driver_positions where driver_id='${A}'`)).rows[0].category==='ordinary','position category synced');
for (const [cc,exp] of [[1396,'economy'],[1399,'economy'],[1400,'ordinary'],[2000,'ordinary'],[2001,'luxury'],[3500,'luxury']]) {
  r=await save(A,{...base,engine_cc:cc,luxury:false}); ok(r.a?.ok && (await cat(A)).c===exp, cc+' -> '+exp);
}
r=await save(A,{...base,fuel:'hybrid',engine_cc:2500}); ok((await cat(A)).c==='economy','hybrid economy');
r=await save(A,{...base,fuel:'electric',engine_cc:''}); ok((await cat(A)).c==='economy','electric economy');
ok((await db.query(`select category from taxi_driver_positions where driver_id='${A}'`)).rows[0].category==='economy','save syncs position');
ok((await db.query(`select count(*)::int n from user_notifications where kind='luxury_request'`)).rows[0].n===0,'no admin luxury notification');
r=await save(B,{...base,kind:'van_8',plate:'999'}); ok((await cat(B)).c==='van_8','van unaffected');
r=await as(A,`select public.my_work_profile() a`); ok(r.a.ordinary_max_cc===2000 && r.a.economy_max_cc===1399 && !('luxury' in r.a),'profile returns limits');
ok((await db.query(`select count(*)::int n from pg_proc where proname='admin_set_luxury'`)).rows[0].n===0,'admin_set_luxury dropped');
