-- الدفع وإنهاء التكسي (22 من 39): طلب التكسي الجديد يبدأ بانتظار سائق
create or replace function public._taxi_order_new()
returns trigger language plpgsql as $$
begin
  new.status := 'pending'; new.driver_id := null;
  new.accepted_at := null; new.arrived_at := null; new.started_at := null;
  new.completed_at := null; new.cancelled_at := null; new.final_fare := null;
  return new;
end; $$;
drop trigger if exists trg_taxi_order_new on public.taxi_orders;
create trigger trg_taxi_order_new before insert on public.taxi_orders
  for each row execute function public._taxi_order_new();

-- تغيير حالة الطلب عبر الدوال فقط
drop policy if exists "السائق والعميل يعدلان" on public.taxi_orders;
