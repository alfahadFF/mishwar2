-- الدفع وإنهاء التكسي (21 من 39): أعمدة مراحل رحلة التكسي
alter table public.taxi_orders
  add column if not exists accepted_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists final_fare numeric(10,2);

alter table public.taxi_orders drop constraint if exists taxi_orders_status_check;
alter table public.taxi_orders add constraint taxi_orders_status_check
  check (status in ('pending','searching','accepted','arrived','in_progress','completed','cancelled','no_driver')) not valid;

create index if not exists idx_taxi_orders_driver_status on public.taxi_orders(driver_id, status);
