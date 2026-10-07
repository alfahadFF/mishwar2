-- ============================================================
-- تكسي راكب: المسار الفعلي على الطرق + موقع ركوب/نزول الراكب + الالتفاف + موافقة السائق والمبلغ الإضافي
-- ترحيل إضافي آمن (لا يحذف بيانات) — يُنفذ بعد taxi-shared-migration-fixed.sql
-- ============================================================

-- 1) الرحلات: حفظ المسار الفعلي
alter table public.taxi_shared_trips
  add column if not exists route_polyline jsonb,          -- [[lat,lng],...] من OSRM
  add column if not exists waypoints jsonb,               -- الانطلاق [+ نقطة الشاغر] + الوصول
  add column if not exists distance_km numeric(8,2),
  add column if not exists duration_min integer,
  add column if not exists has_vacancy_mid boolean default false,
  add column if not exists vacancy_lat double precision,
  add column if not exists vacancy_lng double precision;

-- إصلاح: القيد القديم (>=1) كان يمنع وصول المقاعد إلى 0 فلا تتحول الرحلة إلى full
alter table public.taxi_shared_trips drop constraint if exists taxi_shared_trips_available_seats_check;
alter table public.taxi_shared_trips add constraint taxi_shared_trips_available_seats_check check (available_seats >= 0 and available_seats <= 11);

-- السائق يرى رحلاته دائماً (حتى المكتملة)
drop policy if exists "السائق يرى رحلاته" on public.taxi_shared_trips;
create policy "السائق يرى رحلاته" on public.taxi_shared_trips for select using (auth.uid() = driver_id);

-- 2) طلبات الانضمام: موقع الراكب والالتفاف والمبلغ الإضافي
alter table public.taxi_shared_requests
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists dropoff_lat double precision,
  add column if not exists dropoff_lng double precision,
  add column if not exists off_pick_km numeric(8,3),
  add column if not exists off_drop_km numeric(8,3),
  add column if not exists wrong_dir boolean default false,
  add column if not exists detour_km numeric(8,2),
  add column if not exists detour_min integer,
  add column if not exists detour_polyline jsonb,
  add column if not exists join_type text default 'approval',
  add column if not exists extra_fee numeric(10,2) default 0,
  add column if not exists updated_at timestamptz default now();

alter table public.taxi_shared_requests drop constraint if exists taxi_shared_requests_status_check;
alter table public.taxi_shared_requests add constraint taxi_shared_requests_status_check
  check (status in ('pending','counter','accepted','confirmed','rejected','declined_by_passenger','cancelled'));
alter table public.taxi_shared_requests drop constraint if exists taxi_shared_requests_join_type_check;
alter table public.taxi_shared_requests add constraint taxi_shared_requests_join_type_check check (join_type in ('auto','approval'));

-- 3) أقرب مسافة (كم) من نقطة إلى المسار المحفوظ — للتحقق من الإضافة الفورية على الخادم
create or replace function public.km_to_polyline(p_lat double precision, p_lng double precision, p_line jsonb)
returns double precision language plpgsql immutable as $$
declare
  k double precision := cos(radians(p_lat));
  best double precision := 1e9;
  i int; n int;
  ax double precision; ay double precision; bx double precision; by_ double precision;
  px double precision := p_lng*111.32*k; py double precision := p_lat*110.574;
  dx double precision; dy double precision; l2 double precision; t double precision; d double precision;
begin
  if p_line is null then return best; end if;
  n := jsonb_array_length(p_line);
  for i in 0..n-2 loop
    ax := (p_line->i->>1)::float8*111.32*k;   ay := (p_line->i->>0)::float8*110.574;
    bx := (p_line->(i+1)->>1)::float8*111.32*k; by_ := (p_line->(i+1)->>0)::float8*110.574;
    dx := bx-ax; dy := by_-ay; l2 := dx*dx+dy*dy;
    t := case when l2>0 then greatest(0, least(1, ((px-ax)*dx+(py-ay)*dy)/l2)) else 0 end;
    d := sqrt((px-(ax+t*dx))^2 + (py-(ay+t*dy))^2);
    if d < best then best := d; end if;
  end loop;
  return best;
end; $$;

-- حجز مقعد بقفل الصف (يمنع الحجز المزدوج)
create or replace function public._take_seat(p_trip uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update taxi_shared_trips set available_seats = available_seats - 1
   where id = p_trip and status = 'pending' and available_seats > 0;
  if not found then raise exception 'TRIP_FULL'; end if;
end; $$;

-- 4) الراكب: طلب انضمام — إضافة فورية إذا كان ضمن 1 كم وبنفس الاتجاه، وإلا ينتظر موافقة السائق
create or replace function public.request_shared_join(
  p_trip uuid, p_pick_lat float8, p_pick_lng float8, p_drop_lat float8, p_drop_lng float8,
  p_wrong_dir boolean, p_detour_km numeric, p_detour_min int, p_detour_polyline jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare tr taxi_shared_trips; offp float8; offd float8; near boolean; rid uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into tr from taxi_shared_trips where id = p_trip for update;
  if tr.id is null or tr.status <> 'pending' or tr.available_seats < 1 then raise exception 'TRIP_FULL'; end if;
  offp := km_to_polyline(p_pick_lat, p_pick_lng, tr.route_polyline);
  offd := km_to_polyline(p_drop_lat, p_drop_lng, tr.route_polyline);
  near := offp <= 1.0 and offd <= 1.0 and not coalesce(p_wrong_dir,false);
  insert into taxi_shared_requests(trip_id, passenger_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
     off_pick_km, off_drop_km, wrong_dir, detour_km, detour_min, detour_polyline, join_type, status)
  values (p_trip, auth.uid(), p_pick_lat, p_pick_lng, p_drop_lat, p_drop_lng,
     offp, offd, coalesce(p_wrong_dir,false), p_detour_km, p_detour_min, p_detour_polyline,
     case when near then 'auto' else 'approval' end, case when near then 'confirmed' else 'pending' end)
  on conflict (trip_id, passenger_id) do update set
     pickup_lat=excluded.pickup_lat, pickup_lng=excluded.pickup_lng, dropoff_lat=excluded.dropoff_lat, dropoff_lng=excluded.dropoff_lng,
     off_pick_km=excluded.off_pick_km, off_drop_km=excluded.off_drop_km, wrong_dir=excluded.wrong_dir,
     detour_km=excluded.detour_km, detour_min=excluded.detour_min, detour_polyline=excluded.detour_polyline,
     join_type=excluded.join_type, status=excluded.status, extra_fee=0, updated_at=now()
  returning id into rid;
  if near then perform _take_seat(p_trip); end if;
  return jsonb_build_object('id', rid, 'status', case when near then 'confirmed' else 'pending' end);
end; $$;

-- 5) السائق: قبول / رفض / قبول بمبلغ إضافي
create or replace function public.driver_respond_join(p_request uuid, p_action text, p_extra numeric default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rq taxi_shared_requests; tr taxi_shared_trips;
begin
  select * into rq from taxi_shared_requests where id = p_request for update;
  select * into tr from taxi_shared_trips where id = rq.trip_id;
  if tr.driver_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if rq.status <> 'pending' then raise exception 'ALREADY_HANDLED'; end if;
  if p_action = 'accept' then
    perform _take_seat(rq.trip_id);
    update taxi_shared_requests set status='confirmed', updated_at=now() where id=p_request;
  elsif p_action = 'reject' then
    update taxi_shared_requests set status='rejected', updated_at=now() where id=p_request;
  elsif p_action = 'counter' then
    if coalesce(p_extra,0) <= 0 then raise exception 'INVALID_EXTRA'; end if;
    update taxi_shared_requests set status='counter', extra_fee=p_extra, updated_at=now() where id=p_request;
  else raise exception 'INVALID_ACTION'; end if;
  return jsonb_build_object('ok', true);
end; $$;

-- 6) الراكب: الموافقة على المبلغ الإضافي أو رفضه (المقعد يُحجز فقط عند الموافقة)
create or replace function public.passenger_answer_counter(p_request uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rq taxi_shared_requests;
begin
  select * into rq from taxi_shared_requests where id = p_request for update;
  if rq.passenger_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if rq.status <> 'counter' then raise exception 'ALREADY_HANDLED'; end if;
  if p_accept then
    perform _take_seat(rq.trip_id);
    update taxi_shared_requests set status='confirmed', updated_at=now() where id=p_request;
  else
    update taxi_shared_requests set status='declined_by_passenger', updated_at=now() where id=p_request;
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- 6ب) الراكب: إلغاء طلب الانضمام قبل رد السائق أو قبل الموافقة على المبلغ
create or replace function public.passenger_cancel_join(p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rq taxi_shared_requests;
begin
  select * into rq from taxi_shared_requests where id = p_request for update;
  if rq.passenger_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if rq.status not in ('pending','counter') then raise exception 'ALREADY_HANDLED'; end if;
  update taxi_shared_requests set status='cancelled', updated_at=now() where id=p_request;
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.request_shared_join(uuid,float8,float8,float8,float8,boolean,numeric,int,jsonb) to authenticated;
grant execute on function public.driver_respond_join(uuid,text,numeric) to authenticated;
grant execute on function public.passenger_answer_counter(uuid,boolean) to authenticated;
grant execute on function public.passenger_cancel_join(uuid) to authenticated;
revoke execute on function public._take_seat(uuid) from public, authenticated;

-- 7) Realtime: السائق يستقبل الطلبات فوراً والراكب يستقبل الرد فوراً
do $$ begin
  begin alter publication supabase_realtime add table public.taxi_shared_requests; exception when duplicate_object then null; end;
end $$;
alter table public.taxi_shared_requests replica identity full;
