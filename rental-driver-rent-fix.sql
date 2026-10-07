-- إضافة دعم تأجير مركبة السائق المسجل بدون سائق
alter table public.rental_vehicles add column if not exists provider_type text default 'office' check (provider_type in ('office','individual','driver'));
alter table public.rental_vehicles add column if not exists is_driver_rental boolean default false;

-- تحديث المركبات الحالية للسائقين (إذا كان provider هو سائق في جدول السائقين)
-- اختياري: يمكن ربطه لاحقاً بجدول السائقين

-- فهرس للتمييز
create index if not exists idx_rental_vehicles_provider_type on public.rental_vehicles(provider_type);

-- تحقق
select column_name, data_type from information_schema.columns where table_name='rental_vehicles' and column_name in ('provider_type','is_driver_rental');
