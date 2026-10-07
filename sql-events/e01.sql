-- ---------- 1) بيانات مركبة السائق وخدماته (من التسجيل) ----------
alter table public.profiles add column if not exists event_vehicle_type text
  check (event_vehicle_type in ('bus_large_50','bus_mid_27','bus_mid_21','bus_mid_18','bus_small_14','van_11','van_8','car'));
alter table public.profiles add column if not exists vehicle_seats int check (vehicle_seats between 1 and 60);
alter table public.profiles add column if not exists vehicle_model text;
alter table public.profiles add column if not exists vehicle_year int check (vehicle_year between 1970 and 2100);
alter table public.profiles add column if not exists vehicle_color text;
alter table public.profiles add column if not exists vehicle_photo_url text;
alter table public.profiles add column if not exists svc_events boolean not null default false;   -- رحلات ومناسبات
alter table public.profiles add column if not exists svc_wedding boolean not null default false;  -- خدمة الزفاف (أي سيارة)
