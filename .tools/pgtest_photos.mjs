import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create role authenticated; create role anon;
create table profiles(id uuid primary key, avatar_url text, vehicle_photo_url text);
create table cargo_orders(id uuid primary key, customer_id uuid, carrier_id uuid);
create table cargo_offers(id uuid primary key, cargo_order_id uuid, driver_id uuid);
create table event_orders(id uuid primary key, user_id uuid); create table event_offers(id uuid primary key, event_order_id uuid, driver_id uuid);
create table contract_orders(id uuid primary key, user_id uuid); create table contract_offers(id uuid primary key, contract_order_id uuid, driver_id uuid);
create table taxi_orders(id uuid primary key, user_id uuid, driver_id uuid);
create table taxi_shared_trips(id uuid primary key, driver_id uuid); create table taxi_shared_requests(id uuid primary key, trip_id uuid, passenger_id uuid);
`);
await db.exec(fs.readFileSync('/home/user/sql-photos/01.sql','utf8'));
const C='c0000000-0000-0000-0000-000000000001', X='c0000000-0000-0000-0000-000000000002', D='d0000000-0000-0000-0000-000000000001', E2='d0000000-0000-0000-0000-000000000002';
const id=n=>`a0000000-0000-0000-0000-00000000000${n}`;
await db.exec(`insert into profiles values('${D}','d.jpg','v.jpg'),('${E2}',null,null);
insert into cargo_orders values('${id(1)}','${C}','${D}'); insert into cargo_offers values('${id(2)}','${id(1)}','${D}');
insert into event_orders values('${id(3)}','${C}'); insert into event_offers values('${id(4)}','${id(3)}','${D}'),('${id(9)}','${id(3)}','${E2}');
insert into contract_orders values('${id(5)}','${C}'); insert into contract_offers values('${id(6)}','${id(5)}','${D}');
insert into taxi_orders values('${id(7)}','${C}','${D}'); insert into taxi_shared_trips values('${id(8)}','${D}'); insert into taxi_shared_requests values('${id(0)}','${id(8)}','${C}');`);
const as=async(u,q)=>{await db.exec(`select set_config('request.jwt.claim.sub','${u}',false)`); return (await db.query(q)).rows[0].r};
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1};
for (const [s,r] of [['cargo_offer',2],['event_offer',4],['contract_offer',6],['cargo',1],['taxi',7],['taxi_shared',0]]) {
  const v=await as(C,`select public.provider_photos('${s}', array['${id(r)}']::uuid[]) r`); ok(v[id(r)]?.driver==='d.jpg'&&v[id(r)]?.vehicle==='v.jpg',s);
  const w=await as(X,`select public.provider_photos('${s}', array['${id(r)}']::uuid[]) r`); ok(Object.keys(w).length===0,s+' stranger blocked');
}
const n=await as(C,`select public.provider_photos('event_offer', array['${id(9)}']::uuid[]) r`); ok(Object.keys(n).length===0,'no photos -> empty');
