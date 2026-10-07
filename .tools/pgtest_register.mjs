// اختبار التسجيل. التشغيل: cd /tmp/pg && node /home/user/.tools/pgtest_register.mjs
import { createRequire } from 'module'
const require = createRequire('/tmp/pg/')
const { PGlite } = await import(require.resolve('@electric-sql/pglite'))
import fs from 'fs'
const db=new PGlite(); const H='/home/user/'
const q=async(sql,l)=>{ try{ return await db.exec(sql) }catch(e){ console.log('❌',l,e.message); process.exit(1) } }
await q(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create type user_type as enum ('personal','driver','transporter','special_driver','business');
create table public.profiles(id uuid primary key references auth.users(id), email text, full_name text, phone text, avatar_url text, type user_type default 'personal', created_at timestamptz default now(), updated_at timestamptz default now(), account_type text default 'personal', governorate text default 'Damascus', national_id text, vehicle_class text, taxi_category text, vehicle_plate text, event_vehicle_type text, vehicle_seats int, svc_events boolean not null default false, svc_wedding boolean not null default false);
alter table profiles enable row level security;
create policy "Users can insert own profile" on profiles for insert with check (auth.uid()=id);
create policy "Users can update own profile" on profiles for update using (auth.uid()=id);
create policy "Users can view own profile" on profiles for select using (auth.uid()=id);
create table public.loyalty_accounts(user_id uuid primary key, points int not null default 0, invited_by uuid, invite_rewarded boolean not null default false, updated_at timestamptz default now());`,'env')
await q(fs.readFileSync(H+'sql-wallet/w2.sql','utf8'),'w2')
await q(fs.readFileSync(H+'sql-events/e02.sql','utf8'),'e02')
await q(fs.readFileSync(H+'sql-pay/02.sql','utf8').split('create or replace function public._pin_hash')[0],'is_admin')
for (const r of [1,2]) for (const f of ['01','02','03','04']) { const res=await q(fs.readFileSync(H+`sql-register/${f}.sql`,'utf8'),`reg ${f} run${r}`); if(f==='04'&&r===2) console.log('check:', JSON.stringify(res.at(-1).rows.map(x=>Object.values(x).join(': ')))) }
await db.exec(`grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to anon, authenticated; grant select on profiles to authenticated;`)
const J=x=>JSON.stringify(x)
const as=async(u,sql,p=[],role='authenticated')=>{ await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u||''}',false)`); if(role) await db.exec('set role '+role); try{ return (await db.query(sql,p)).rows }catch(e){ return 'ERR: '+e.message.split('\n')[0] } finally{ await db.exec('reset role') } }
// أرقام
const nums=['0912345678','912345678','+963 912 345 678','00963912345678','963912345678','٠٩١٢٣٤٥٦٧٨','0791234567','791234567','+962791234567','07701234567','7701234567','+9647701234567','03123456','3123456','70123456','+96181123456','091234567','09123456789','0612345678','+963791234567','+1 555 1234567','']
for (const n of nums) console.log('R', J(n), '→', J((await db.query(`select public._parse_phone($1) v`,[n])).rows[0].v))
// تسجيل
const signup=async(email,meta)=>{ try{ const r=await db.query(`insert into auth.users(email,raw_user_meta_data) values ($1,$2) returning id`,[email,meta]); return r.rows[0].id }catch(e){ return 'ERR: '+e.message.split('\n')[0] } }
const A=await signup('963912345678@users.mishwar.app',{terms:true})
console.log('R A profile:', J((await db.query(`select phone,country,wallet_id is not null w,terms_accepted_at is not null t from profiles where id=$1`,[A])).rows))
const W=(await db.query(`select wallet_id from profiles where id=$1`,[A])).rows[0].wallet_id
console.log('R dup same number:', await signup('963912345678@users.mishwar.app',{terms:true}))
console.log('R bad phone:', await signup('963712345678@users.mishwar.app',{terms:true}))
console.log('R no terms:', await signup('962791234567@users.mishwar.app',{}))
console.log('R invite valid anon:', J(await as(null,`select invite_code_valid($1) v`,[W],'anon')), J(await as(null,`select invite_code_valid('12345') v`,[],'anon')))
const B=await signup('9647701234567@users.mishwar.app',{terms:true, invite:W})
console.log('R B invited_by A:', J((await db.query(`select invited_by=$2 ok from loyalty_accounts where user_id=$1`,[B,A])).rows), J((await db.query(`select country from profiles where id=$1`,[B])).rows))
const C=await signup('9613123456@users.mishwar.app',{terms:true, invite:'00000000'})
console.log('R C bad invite ignored:', J((await db.query(`select count(*) from loyalty_accounts where user_id=$1`,[C])).rows), J((await db.query(`select phone,country from profiles where id=$1`,[C])).rows))
const D=await signup('admin@gmail.com',{})
console.log('R other email (dashboard):', J((await db.query(`select phone,country,terms_accepted_at from profiles where id=$1`,[D])).rows))
// حماية
console.log('R user updates:', J(await as(A,`update profiles set full_name='  أحمد  ', taxi_category='lux', vehicle_class='md5', phone='+963900000000', country='JO', account_type='admin', wallet_id='11111111' where id=$1 returning full_name, taxi_category, vehicle_class, phone, country, account_type, wallet_id=$2 same_w`,[A,W])))
console.log('R user clears name:', J(await as(A,`update profiles set full_name='' where id=$1 returning full_name`,[A])))
console.log('R user insert profile:', J(await as(A,`insert into profiles(id) values (gen_random_uuid()) returning id`,[])))
await db.exec(`create or replace function public.t_set_cat(p uuid) returns void language sql security definer as $$ update profiles set taxi_category='lux' where id=p $$; grant execute on function public.t_set_cat(uuid) to authenticated;`)
await as(A,`select t_set_cat($1)`,[A])
console.log('R definer fn update:', J((await db.query(`select taxi_category from profiles where id=$1`,[A])).rows))
await db.exec(`update profiles set account_type='admin' where id='${D}'`)
console.log('R admin updates other:', J(await as(D,`update profiles set vehicle_class='md5' where id=$1 returning vehicle_class`,[A])))
console.log('R admin row-level (RLS own only) — count:', J(await as(D,`select count(*) from profiles`)))
