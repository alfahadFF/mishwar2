-- الرحلة المشتركة (1 من 22): أعمدة بدء وإنهاء الرحلة وموقع السائق
alter table public.taxi_shared_trips
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists driver_lat double precision,
  add column if not exists driver_lng double precision,
  add column if not exists driver_pos_at timestamptz;

alter table public.taxi_shared_requests
  add column if not exists commission_at timestamptz,
  add column if not exists commission numeric(10,2);
