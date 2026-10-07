-- الجزء 5 من 14 — أعمدة طلب النقل

alter table public.cargo_orders add column if not exists vehicle_class text
  check (vehicle_class in ('pk800','pk1200','pk1500','pk2000','md3','md4','md5','md6','md7','truck'));

alter table public.cargo_orders add column if not exists agreed_price numeric(10,2);

alter table public.cargo_orders add column if not exists commission_amount numeric(10,2);

alter table public.cargo_orders add column if not exists accepted_via text check (accepted_via in ('direct','offer'));

alter table public.cargo_orders add column if not exists accepted_at timestamptz;

alter table public.cargo_orders add column if not exists completed_at timestamptz;

create index if not exists idx_cargo_orders_open on public.cargo_orders(status, vehicle_class);
