// اختبار ملفات SQL على Postgres حقيقي (PGlite). التشغيل: cd /tmp/pg && node /home/user/.tools/pgtest.mjs [full|parts]
import { createRequire } from 'module'
const require = createRequire('/tmp/pg/')
const { PGlite } = await import(require.resolve('@electric-sql/pglite'))
import fs from 'fs'
const db = new PGlite(); const H='/home/user/'
const q = async (sql, label) => { try { return await db.exec(sql) } catch (e) { console.log('❌', label, e.message); process.exit(1) } }
await q(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table public.profiles(id uuid primary key references auth.users(id), email text, full_name text, phone text, avatar_url text, type text, created_at timestamptz default now(), updated_at timestamptz default now(), account_type text, governorate text, national_id text);
create table public.wallets(user_id uuid, updated_at timestamptz default now());`,'env')
await q(fs.readFileSync(H+'cargo-transport-migration.sql','utf8'),'transport')
await q(`alter table cargo_orders drop constraint if exists cargo_orders_status_check; alter table cargo_orders alter column status set default 'open'; alter table cargo_orders add column if not exists carrier_id uuid; alter table cargo_orders alter column scheduled_time type text; alter table cargo_orders alter column scheduled_date type text;`,'real')
await q(fs.readFileSync(H+'order-points-migration.sql','utf8').replace(/alter table public\.(contract_orders|event_orders)[^;]*;/g,'').replace(/do \$\$[\s\S]*?end \$\$;/,'').replace(/select table_name[\s\S]*$/,''),'order-points')
await q(fs.readFileSync(H+'cargo-offers-migration.sql','utf8'),'offers')
const files = process.argv[2]==='parts' ? fs.readdirSync(H+'sql-cargo').sort().map(f=>H+'sql-cargo/'+f) : [H+'cargo-carrier-migration.sql']
for (const r of [1,2]) for (const f of files) await q(fs.readFileSync(f,'utf8'), f.split('/').pop()+' run'+r)
for (const f of (process.argv[3]||'').split(',').filter(Boolean)) await q(fs.readFileSync(f,'utf8'), f)
console.log('✅ ran twice:', files.length, 'file(s)')
await db.exec(`grant usage on schema public, auth to anon, authenticated; grant all on all tables in schema public to anon, authenticated;`)
const CU='11111111-1111-1111-1111-111111111111', K1='22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users values ('${CU}'),('${K1}'); insert into profiles(id,full_name,phone) values ('${CU}','أحمد محمد','0944123456'),('${K1}','أبو خالد','0933222111');`)
const as = async (u, sql, p=[]) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u||''}',false)`); if(u) await db.exec('set role authenticated'); try { return (await db.query(sql,p)).rows } catch(e){ return 'ERR: '+e.message } finally { await db.exec('reset role') } }
globalThis.T={db,as,CU,K1}
const pts=(a,b)=>JSON.stringify([{label:'x',lat:a,lng:b}])
await db.query(`insert into cargo_orders(id,customer_id,cargo_type,vehicle_class,pickup_points,dropoff_points,budget_type,budget_from,budget_to,timing_type,scheduled_date,scheduled_time) values
 ('aaaaaaaa-0000-0000-0000-000000000001','${CU}','مفروشات','pk800',$1,$1,'fixed',20,40,'scheduled','2026-09-27','08:00'),
 ('aaaaaaaa-0000-0000-0000-000000000002','${CU}','أجهزة','pk800',$1,$1,'quote',null,null,'urgent',null,null),
 ('aaaaaaaa-0000-0000-0000-000000000003','${CU}','بعيد','pk800',$2,$1,'fixed',20,40,'urgent',null,null)`,[pts(33.515,36.292),pts(33.62,36.13)])
await db.exec(`update profiles set vehicle_class='pk1200' where id='${K1}'`)
console.log('feed:', JSON.stringify(await as(K1,`select f->>'cargo_type' t, f->>'distance_km' km, f ? 'customer_id' leak from carrier_cargo_feed(33.5138,36.2765,10) f`)))
console.log('wallet (new account):', JSON.stringify(await as(K1,`select my_wallet()`)))
console.log('free-period accept $40:', JSON.stringify(await as(K1,`select carrier_accept_cargo('aaaaaaaa-0000-0000-0000-000000000001')`)))
await as(K1,`select carrier_send_cargo_offer('aaaaaaaa-0000-0000-0000-000000000002', 50)`)
const off=(await as(CU,`select id from cargo_offers`))[0].id
console.log('customer accepts $50 offer:', JSON.stringify(await as(CU,`select accept_cargo_offer($1)`,[off])), '| wallet:', JSON.stringify(await as(K1,`select my_wallet()`)))
console.log('jobs:', JSON.stringify(await as(K1,`select j->>'cargo_type' t, j->>'agreed_price' p, j->>'commission_amount' c, j->>'customer_phone' ph from carrier_my_cargo_jobs() j`)))
// انتهاء الفترة المجانية: الحساب مسجّل قبل 15 يوماً
await db.exec(`update auth.users set created_at = now() - interval '15 days' where id='${K1}'; update wallets set balance = 20 where user_id='${K1}'`)
await db.query(`insert into cargo_orders(id,customer_id,cargo_type,vehicle_class,pickup_points,dropoff_points,budget_type,budget_from,budget_to,timing_type) values ('aaaaaaaa-0000-0000-0000-000000000004','${CU}','بعد المجانية','pk800',$1,$1,'fixed',20,50,'urgent')`,[pts(33.515,36.292)])
console.log('wallet (15 days old):', JSON.stringify(await as(K1,`select my_wallet()`)))
console.log('accept $50 after free period:', JSON.stringify(await as(K1,`select carrier_accept_cargo('aaaaaaaa-0000-0000-0000-000000000004')->'commission' c`)), '| wallet:', JSON.stringify(await as(K1,`select my_wallet()->'balance' b`)))
await db.exec(`update app_settings set value='30' where key='free_days'`)
console.log('free_days=30 → days left:', JSON.stringify(await as(K1,`select my_wallet()->'free_days_left' d`)))
console.log('rates:', JSON.stringify((await db.query(`select service, rate from service_commissions order by service`)).rows))
const last=fs.readFileSync(files[files.length-1],'utf8'); const i=last.indexOf("select 'الدوال'")
if(i>=0) console.log('check:', JSON.stringify((await db.query(last.slice(i))).rows.map(r=>Object.values(r).join(': '))))
