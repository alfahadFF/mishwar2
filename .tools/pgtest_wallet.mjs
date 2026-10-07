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
console.log('wallet ids:', J(await as(null,`select full_name, wallet_id from profiles order by full_name`)))
console.log('user changes own id:', J(await as(CU,`update profiles set wallet_id='12345678' where id='${CU}' returning wallet_id`)))
console.log('read cards directly:', J(await as(CU,`select count(*) from topup_cards`)))
console.log('non-admin create cards:', await as(CU,`select * from admin_create_topup_cards(10,2)`))
const cards=await as(null,`select * from admin_create_topup_cards(100,3,'T1')`); console.log('cards:', J(cards))
console.log('redeem bad x1:', J(await one(CU,`select redeem_topup_card('00000000000000')`)))
console.log('redeem ok (spaces):', J(await one(CU,`select redeem_topup_card($1)`,[cards[0].code.replace(/(\d{4})/g,'$1 ')])))
console.log('redeem reused:', J(await one(P2,`select redeem_topup_card($1)`,[cards[0].code])))
for (let i=0;i<4;i++) await one(P2,`select redeem_topup_card('1')`)
console.log('P2 after 5 fails, valid card:', await one(P2,`select redeem_topup_card($1)`,[cards[1].code]))
console.log('CU wallet:', J(await one(CU,`select my_wallet()`)))
const cuId=await one(null,`select wallet_id from profiles where id='${CU}'`), p2Id=await one(null,`select wallet_id from profiles where id='${P2}'`)
console.log('find by id:', J(await one(CU,`select wallet_find_user($1)`,[p2Id])), '| by phone intl:', J(await one(CU,`select wallet_find_user('00963 955 111 222')`)), '| self:', await one(CU,`select wallet_find_user($1)`,[cuId]), '| none:', await one(CU,`select wallet_find_user('12')`))
console.log('transfer 30 to P2:', J(await one(CU,`select wallet_transfer($1,30,'هدية')`,[p2Id])), '| too much:', await one(CU,`select wallet_transfer($1,1000)`,[p2Id]), '| negative:', await one(CU,`select wallet_transfer($1,-5)`,[p2Id]))
console.log('P2 tx:', J(await as(P2,`select t->>'kind' k, t->>'amount' a, t->>'counterparty' c, t->>'note' n from my_wallet_transactions() t`)))
// cargo flow: order, direct accept, complete
const pts='[{"label":"أ","lat":33.5,"lng":36.3}]'
const oid=await one(CU,`insert into cargo_orders(cargo_type,vehicle_class,pickup_points,dropoff_points,budget_type,budget_from,budget_to) values ('أثاث','md3','${pts}','${pts}','fixed',40,50) returning id`)
console.log('accept cargo:', J(await one(CR,`select carrier_accept_cargo($1)`,[oid])))
console.log('payables before complete:', J(await as(CU,`select count(*) from my_payables()`)), '| pay early:', await one(CU,`select pay_from_wallet('cargo',$1)`,[oid]))
await one(CR,`select carrier_complete_cargo($1)`,[oid])
await db.exec(`update app_settings set value='5' where key='wallet_pay_discount_pct'`)
console.log('payables:', J(await as(CU,`select p->>'service' s, p->>'title' t, p->>'payee_name' n, p->>'gross' g, p->>'discount' d, p->>'to_pay' tp from my_payables() p`)))
console.log('other pays:', await one(P2,`select pay_from_wallet('cargo',$1)`,[oid]))
console.log('CR balance before:', await one(CR,`select my_wallet()->>'balance'`))
console.log('pay:', J(await one(CU,`select pay_from_wallet('cargo',$1)`,[oid])), '| again:', await one(CU,`select pay_from_wallet('cargo',$1)`,[oid]))
console.log('CR balance after (50-6 commission +50):', await one(CR,`select my_wallet()->>'balance'`), '| CR tx:', J(await as(CR,`select t->>'kind' k, t->>'amount' a, t->>'counterparty' c from my_wallet_transactions() t`)))
// events
const EO='eeeeeeee-0000-0000-0000-000000000001'
await as(CU,`insert into event_orders(id,user_id,event_type,gathering_point,gathering_lat,gathering_lng,gathering_time,destinations,duration_hours,num_people,vehicles,total_seats) values ($1,$2,'family','ساحة',33.515,36.285,now()+interval '3 days','[{"label":"x","lat":33.5,"lng":36.24}]',5,20,'[{"type":"bus_mid_21","seats":21,"count":1}]',21)`,[EO,CU])
const eof=await one(BUS,`select driver_send_event_offer($1,'bus_mid_21',60)`,[EO]); await one(CU,`select accept_event_offer($1)`,[eof]); await one(BUS,`select driver_complete_event($1)`,[eof])
console.log('event payable:', J(await as(CU,`select p->>'title' t, p->>'to_pay' tp from my_payables() p`)))
console.log('pay event (balance 22.5, need 57):', await one(CU,`select pay_from_wallet('events',$1)`,[eof]))
await one(CU,`select redeem_topup_card($1)`,[cards[2].code])
console.log('pay event after topup:', J(await one(CU,`select pay_from_wallet('events',$1)`,[eof])))
// monthly contract started 70 days ago
const CO='cccccccc-0000-0000-0000-000000000001'
await as(CU,`insert into contract_orders(id,user_id,contract_category,contract_role,num_people,pickup_points,destinations,days,contract_unit,unit_count,start_date,vehicles,total_seats,budget_type) values ($1,$2,'school','institution',20,'[{"label":"a","lat":33.505,"lng":36.25}]','[{"label":"b","lat":33.52,"lng":36.29}]','{0,1,2,3,4}','month',3,current_date-70,'[{"type":"bus_mid_21","seats":21,"count":1}]',21,'quote')`,[CO,CU])
const cof=await one(BUS,`select driver_send_contract_offer($1,'bus_mid_21',40)`,[CO]); console.log('ct accept:', J(await one(CU,`select accept_contract_offer($1)`,[cof])))
console.log('contract payables (2 months passed):', J(await as(CU,`select p->>'title' t, p->>'period' pr, p->>'to_pay' tp from my_payables() p`)))
console.log('pay month 3 (not due):', await one(CU,`select pay_from_wallet('contracts',$1,3)`,[cof]), '| pay month 1:', J(await one(CU,`select pay_from_wallet('contracts',$1,1)`,[cof])))
console.log('payments rows visible to P2:', J(await as(P2,`select count(*) from wallet_payments`)), '| CU:', J(await as(CU,`select count(*) from wallet_payments`)))
console.log('direct wallet update:', J(await as(CU,`update wallets set balance=9999 where user_id='${CU}' returning balance`)))
console.log('CU final:', J(await one(CU,`select my_wallet()`)))
