import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const root = '/home/user/Mishwar';
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
console.log('start');
await db.exec(`
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
  $$;
  create role authenticated; create role anon;
  create type user_type as enum ('personal','driver','transporter','special_driver','business');
  create table public.profiles (
    id uuid primary key, full_name text, phone text, country text, type user_type not null default 'personal',
    work_role text, work_registered_at timestamptz, work_verified_at timestamptz,
    event_vehicle_type text, taxi_category text, vehicle_seats int, vehicle_class text, vehicle_model text,
    vehicle_year int, vehicle_color text, vehicle_plate text, vehicle_owner text, fuel text, engine_cc int,
    license_no text, license_place text, license_expiry date, avatar_url text, vehicle_photo_url text,
    license_photo_path text, svc_events boolean, svc_wedding boolean, svc_airport boolean, svc_contracts boolean,
    svc_rental boolean, office_name text, office_manager text, office_city text, office_lat double precision,
    office_lng double precision, cr_number text, cr_photo_path text, updated_at timestamptz
  );
  create table public.user_notifications(id bigserial primary key, user_id uuid, kind text, title text, body text, data jsonb, created_at timestamptz default now());
  create table public.wallets(user_id uuid primary key, balance numeric not null default 0, updated_at timestamptz default now());
  create table public.service_commissions(service text primary key, rate numeric(5,4) not null);
  create table public.wallet_transactions(id bigserial primary key, user_id uuid, kind text, amount numeric,
    balance_after numeric, service text, ref_id uuid, gross_amount numeric, is_trial boolean, note text, created_at timestamptz default now());
  create function public._wallet_charge(p_user uuid,p_service text,p_ref uuid,p_gross numeric)
  returns numeric language plpgsql security definer set search_path=public as $$
  declare v_rate numeric; v_fee numeric; v_bal numeric;
  begin
    insert into wallets(user_id,balance) values(p_user,100) on conflict(user_id) do nothing;
    select rate into v_rate from service_commissions where service=p_service;
    v_fee := round(coalesce(v_rate,0)*p_gross,2);
    update wallets set balance=balance-v_fee,updated_at=now() where user_id=p_user returning balance into v_bal;
    insert into wallet_transactions(user_id,kind,amount,balance_after,service,ref_id,gross_amount,is_trial,note)
    values(p_user,'commission',-v_fee,v_bal,p_service,p_ref,p_gross,false,null);
    return v_fee;
  end $$;
  create function public.wallet_blocked(p_user uuid) returns boolean language sql stable as $$ select false $$;
  create function public.cargo_vehicle_fits(p_order text, p_carrier text) returns boolean language sql immutable as $$ select true $$;
  create function public.save_work_profile(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
  begin
    update profiles set type='driver', full_name=p->>'full_name', event_vehicle_type=p->>'kind',
      vehicle_model=p->>'model', vehicle_year=(p->>'year')::int, vehicle_color=p->>'color',
      vehicle_plate=p->>'plate', vehicle_owner=p->>'owner', fuel=p->>'fuel', engine_cc=nullif(p->>'engine_cc','')::int,
      license_no=p->>'license_no', license_place=p->>'license_place', license_expiry=(p->>'license_expiry')::date,
      svc_events=(p->>'events')::boolean, svc_wedding=(p->>'wedding')::boolean,
      svc_airport=(p->>'airport')::boolean, svc_contracts=(p->>'contracts')::boolean,
      work_registered_at=coalesce(work_registered_at,now()) where id=auth.uid();
    return jsonb_build_object('ok',true);
  end $$;
`);
console.log('base ready');
for (const f of ['sql-travel/01.sql','sql-travel/02.sql','sql-travel/03.sql','sql-travel/04.sql','sql-travel/05.sql','sql-travel/06.sql','sql-travel/07.sql','sql-travel/08.sql']) {
  console.log('running', f);
  await db.exec(fs.readFileSync(`${root}/${f}`, 'utf8'));
  console.log('done', f);
}
console.log('migrations ready');
await db.exec(`
  insert into profiles(id,full_name,phone,country,type,work_registered_at,svc_travel,event_vehicle_type,svc_events,svc_wedding,svc_airport,svc_contracts)
  values ('${A}','رانا للسفريات','+963911111111','SY','driver',now(),true,'car',true,true,true,true),
         ('${B}','مكتب الرحلات','+963922222222','SY','business',now(),true,null,false,false,false,false),
         ('${C}','ليلى','+963933333333','SY','personal',null,false,null,false,false,false,false);
  insert into wallets(user_id,balance) values ('${A}',100),('${B}',100);
`);
const as = async (u, q) => {
  try {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u || ''}',false); set role authenticated;`);
    return await db.query(q);
  } finally { await db.exec('reset role'); }
};
const ok = (condition, label) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); if (!condition) process.exitCode = 1; };
const listing = await as(A, `select public.travel_create_listing('حلب', now()+interval '2 days', 4, 25, 2, 'ملاحظة', true) as v`);
const listingId = listing.rows[0].v.id;
let search = await as(C, `select count(*)::int as n, bool_and(not (trip ? 'provider_phone')) as hidden from public.travel_search() as t(trip)`);
ok(search.rows[0].n === 1 && search.rows[0].hidden, 'trip search returns listings without contact details');
let booking = await as(C, `select public.travel_book_listing('${listingId}', 33, 36, 'منزل الراكب', 2, 1, true, null) as v`);
ok(booking.rows[0].v.status === 'confirmed' && booking.rows[0].v.total === 50, 'passenger confirms a listed trip at its per-seat price');
let own = await as(C, `select public.travel_my_data() as v`);
ok(own.rows[0].v.bookings[0].provider_phone === '+963911111111', 'provider contact appears to passenger after confirmation');
let p = await as(C, `select public.travel_post_request(33,36,'منزل ليلى','حمص',2,3,true,'حقيبة كبيرة') as v`);
const requestId = p.rows[0].v.id;
let requestRows = await as(A, `select public.travel_provider_data() as v`);
ok(requestRows.rows[0].v.requests.some(x => x.id === requestId), 'eligible provider sees open request without nearest-location filtering');
let oa = await as(A, `select public.travel_send_offer('${requestId}', 17.5, 'السعر يشمل التوقف') as v`);
const offerA = oa.rows[0].v.id;
let ob = await as(B, `select public.travel_send_offer('${requestId}', 19, null) as v`);
const offerB = ob.rows[0].v.id;
own = await as(C, `select public.travel_my_data() as v`);
ok(own.rows[0].v.requests[0].offers.length === 2 && own.rows[0].v.requests[0].offers.every(x => x.provider_phone == null), 'pending offers hide provider contact');
let accepted = await as(C, `select public.travel_choose_offer('${offerA}') as v`);
ok(accepted.rows[0].v.status === 'confirmed', 'passenger accepts one private offer');
let req = (await db.query(`select status,chosen_offer_id from travel_requests where id='${requestId}'`)).rows[0];
ok(req.status === 'accepted' && req.chosen_offer_id === offerA, 'accepting an offer closes the request');
let statuses = (await db.query(`select id,status from travel_offers where request_id='${requestId}' order by provider_id`)).rows;
ok(statuses.some(x => x.id === offerA && x.status === 'accepted') && statuses.some(x => x.id === offerB && x.status === 'rejected'), 'other providers’ offers are closed');
own = await as(C, `select public.travel_my_data() as v`);
ok(own.rows[0].v.requests[0].offers.find(x => x.id === offerA).provider_phone === '+963911111111', 'provider contact appears only after offer acceptance');
let providerData = await as(A, `select public.travel_provider_data() as v`);
ok(!providerData.rows[0].v.requests.some(x => x.id === requestId) && providerData.rows[0].v.offers.find(x => x.id === offerA).passenger_phone === '+963933333333', 'accepted request leaves open list and reveals passenger contact to selected provider');
let rejected = await as(B, `select public.travel_send_offer('${requestId}', 20, null) as v`).catch(e => String(e.message));
ok(String(rejected).includes('TRAVEL_REQUEST_CLOSED'), 'closed request rejects further offers');
const notifications = (await db.query(`select count(*)::int as n from user_notifications`)).rows[0].n;
ok(notifications >= 5, 'request, offers, and confirmed bookings create in-app notifications');
const rate = (await db.query(`select rate::float8 as rate from service_commissions where service='travel'`)).rows[0].rate;
ok(rate === 0.10, 'travel commission is configured at 10 percent');
const driverWallet = (await db.query(`select balance::float8 as balance from wallets where user_id='${A}'`)).rows[0].balance;
const driverTx = (await db.query(`select count(*)::int as n,coalesce(sum(-amount),0)::float8 as fee from wallet_transactions where user_id='${A}' and service='travel'`)).rows[0];
ok(driverWallet === 91.5 && driverTx.n === 2 && driverTx.fee === 8.5, 'driver is charged 10 percent on each confirmed trip');
const driverBookings = (await db.query(`select total::float8 as total,commission_amount::float8 as fee from travel_bookings where provider_id='${A}' order by total desc`)).rows;
ok(driverBookings.length === 2 && driverBookings[0].total === 50 && driverBookings[0].fee === 5 && driverBookings[1].total === 35 && driverBookings[1].fee === 3.5, 'commission amount is saved on both listing and accepted-offer bookings');
const officeListing = await as(B, `select public.travel_create_listing('اللاذقية',now()+interval '4 days',2,40,null,null,false) as v`);
const officeListingId = officeListing.rows[0].v.id;
const officeBooking = await as(C, `select public.travel_book_listing('${officeListingId}',33,36,'منزل الراكب',1,0,false,null) as v`);
const officeFee = (await db.query(`select commission_amount::float8 as fee from travel_bookings where id='${officeBooking.rows[0].v.booking_id}'`)).rows[0].fee;
const officeWallet = (await db.query(`select balance::float8 as balance from wallets where user_id='${B}'`)).rows[0].balance;
const officeTx = (await db.query(`select count(*)::int as n from wallet_transactions where user_id='${B}' and service='travel'`)).rows[0].n;
ok(officeFee === 0 && officeWallet === 100 && officeTx === 0, 'office bookings are exempt: commission is driver-only');
await db.close();
