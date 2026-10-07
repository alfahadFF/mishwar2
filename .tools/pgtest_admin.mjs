import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table auth.users(id uuid primary key, created_at timestamptz default now());
create role authenticated; create role anon;
create schema storage; create table storage.objects(id serial, bucket_id text, name text); alter table storage.objects enable row level security;
create type user_type as enum('personal','driver','transporter','special_driver','business','admin');
create table profiles(id uuid primary key, full_name text, phone text, avatar_url text, type user_type default 'personal', account_type text, wallet_id text,
 event_vehicle_type text, taxi_category text, vehicle_class text, vehicle_seats int, vehicle_model text, vehicle_year int, vehicle_color text, vehicle_plate text,
 vehicle_owner text, fuel text, engine_cc int, license_no text, license_place text, license_expiry date, vehicle_photo_url text, license_photo_path text,
 office_name text, office_manager text, office_city text, cr_number text, cr_photo_path text, work_registered_at timestamptz, work_verified_at timestamptz,
 taxi_suspended boolean default false, deleted_at timestamptz);
create table wallets(user_id uuid primary key, balance numeric default 0);
create table app_settings(key text primary key, value text not null);
insert into app_settings values ('free_days','14'),('wallet_pay_discount_pct','3'),('wallet_daily_transfer_limit','1000'),('economy_max_cc','1399'),('ordinary_max_cc','2000');
create table service_commissions(service text primary key, rate numeric); insert into service_commissions values ('taxi',0.12),('airport',0.12);
create table user_notifications(id serial, user_id uuid, kind text, title text, body text, data jsonb);
create table pushes(users uuid[], kind text);
create function public._push_send(u uuid[], t text, b text, d jsonb, k text) returns void language sql as $$ insert into pushes values(u,k) $$;
create function public._provider_rating(u uuid) returns jsonb language sql as $$ select jsonb_build_object('avg',4.5,'n',3) $$;
create function public._wallet_lookup(q text) returns uuid language sql as $$ select id from profiles where wallet_id = q or phone = q $$;
create function public._work_block_reason(p_user uuid) returns text language sql as $$ select null::text $$;
create function public.wallet_blocked(p uuid) returns boolean language sql as $$ select coalesce((select balance<0 from wallets where user_id=p),false) or public._work_block_reason(p) is not null $$;
create table taxi_orders(id uuid default gen_random_uuid(), user_id uuid, driver_id uuid, status text);
create table cargo_orders(id uuid, customer_id uuid, carrier_id uuid, status text);
create table cargo_offers(id uuid, cargo_order_id uuid, driver_id uuid);
create table event_orders(id uuid, user_id uuid); create table event_offers(id uuid, driver_id uuid, status text);
create table contract_orders(id uuid, user_id uuid); create table contract_offers(id uuid, driver_id uuid, status text);
create table airport_orders(id uuid, user_id uuid, driver_id uuid, status text); create table airport_offers(id uuid, driver_id uuid);
`);
for (const f of ['01','02','03','04','05']) await db.exec(fs.readFileSync('/home/user/sql-admin/'+f+'.sql','utf8'));
const A='a0000000-0000-0000-0000-000000000001', U='b0000000-0000-0000-0000-000000000001', D='d0000000-0000-0000-0000-000000000001';
await db.exec(`insert into auth.users(id) values('${A}'),('${U}'),('${D}');
insert into profiles(id,full_name,phone,wallet_id,type) values ('${A}','مدير','+1','A1','personal'),('${U}',null,'+2','U1','personal'),('${D}','سائق','+3','D1','personal');
update profiles set is_admin=true where wallet_id='A1';`);
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1};
const as = async (u,q) => { try { await db.exec(`select set_config('request.jwt.claim.sub','${u}',false)`); const r=await db.query(q); return r.rows; } catch(e){ return 'ERR:'+e.message } };
const one=async(u,q)=>{const r=await as(u,q); return typeof r==='string'?r:r[0]?.a};

ok(String(await one(U,`select public.admin_home() a`)).includes('NOT_ALLOWED'),'non-admin blocked from admin_home');
ok((await one(A,`select public.admin_home() a`)).verify===0,'admin home works');
// new work account -> admin notification
await db.exec(`update profiles set type='driver', work_registered_at=now()-interval '3 days', license_photo_path='D/x.jpg' where id='${D}'`);
let n=await as(A,`select public.admin_notifications_list() a`); ok(n.length===1 && n[0].a.kind==='work_new','work_new notification');
ok((await db.query(`select count(*)::int c from pushes where kind='admin'`)).rows[0].c===1,'admin push sent');
ok((await db.query(`select count(*)::int c from user_notifications`)).rows[0].c===0,'not in personal notifications');
await db.exec(`select set_config('request.jwt.claim.sub','',false)`);
await db.query(`select public._notify_admins('sos','x','y','{}')`);
ok((await db.query(`select count(*)::int c from admin_notifications where kind='sos'`)).rows[0].c===0,'sos not sent to admin');
// queue + reject + resubmit + approve
let q=await as(A,`select public.admin_verify_queue() a`); ok(q.length===1 && q[0].a.days_left===27,'queue with days left');
ok(String(await one(A,`select public.admin_verify_decide('${D}', false, '') a`)).includes('REASON_REQUIRED'),'reject needs reason');
await one(A,`select public.admin_verify_decide('${D}', false, 'صورة الرخصة غير واضحة') a`);
ok((await one(D,`select public.my_admin_flags() a`)).reject_reason==='صورة الرخصة غير واضحة','user sees reject reason');
ok((await db.query(`select count(*)::int c from user_notifications where user_id='${D}'`)).rows[0].c===1,'user notified of reject');
await db.exec(`update profiles set license_photo_path='D/y.jpg' where id='${D}'`);
ok((await one(D,`select public.my_admin_flags() a`)).reject_reason===null,'resubmit clears reason');
ok((await db.query(`select count(*)::int c from admin_notifications where kind='work_updated'`)).rows[0].c===1,'admin told of resubmit');
await one(A,`select public.admin_verify_decide('${D}', true) a`);
ok((await as(A,`select public.admin_verify_queue() a`)).length===0,'approved leaves queue');
ok((await db.query(`select count(*)::int c from work_decisions where by_kind='admin'`)).rows[0].c===2,'decisions logged');
// settings
ok((await one(A,`select public.admin_settings() a`)).settings.free_days==='14','settings read');
await one(A,`select public.admin_save_setting('free_days', 30) a`);
ok((await db.query(`select value from app_settings where key='free_days'`)).rows[0].value==='30','setting saved');
ok(String(await one(A,`select public.admin_save_setting('ordinary_max_cc', 1000) a`)).includes('BAD_SETTING'),'ordinary below economy rejected');
ok(String(await one(A,`select public.admin_save_setting('hack', 1) a`)).includes('BAD_SETTING'),'unknown key rejected');
await one(A,`select public.admin_save_commission('airport', 10) a`);
ok(Number((await db.query(`select rate from service_commissions where service='airport'`)).rows[0].rate)===0.1,'commission saved');
ok(String(await one(U,`select public.admin_save_commission('airport', 0) a`)).includes('NOT_ALLOWED'),'non-admin cannot change commission');
// users + suspension
let u=await one(A,`select public.admin_user('U1') a`); ok(u.id===U && u.suspended===false,'find user by ID');
ok(String(await one(A,`select public.admin_suspend_user('${A}','x') a`)).includes('NOT_ALLOWED'),'cannot suspend admin/self');
await one(A,`select public.admin_suspend_user('${U}','إساءة') a`);
ok(String(await as(U,`insert into taxi_orders(user_id,status) values('${U}','pending')`)).includes('ACCOUNT_SUSPENDED'),'suspended customer cannot order');
await one(A,`select public.admin_suspend_user('${D}','مخالفة') a`);
ok((await db.query(`select public._work_block_reason('${D}') a`)).rows[0].a==='suspended','suspended provider blocked');
ok(String(await as(D,`insert into airport_offers(driver_id) values('${D}')`)).includes('ACCOUNT_SUSPENDED'),'suspended provider cannot offer');
await db.exec(`insert into taxi_orders(user_id,status) values('${A}','pending')`);
ok(String(await as(A,`update taxi_orders set driver_id='${D}'`)).includes('ACCOUNT_SUSPENDED'),'suspended driver cannot accept taxi');
await one(A,`select public.admin_unsuspend_user('${U}') a`);
ok(Array.isArray(await as(U,`insert into taxi_orders(user_id,status) values('${U}','pending')`)),'unsuspended can order');
ok((await one(U,`select public.my_admin_flags() a`)).suspended===false,'flags updated');
ok((await one(A,`select public.my_admin_flags() a`)).is_admin===true,'admin flag');
ok((await db.query(`select count(*)::int c from pg_trigger where tgname like 'trg_block_susp_%'`)).rows[0].c===10,'block triggers on existing tables');
