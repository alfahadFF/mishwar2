-- نقاط الخريطة + معلومات المسار لشاشات النقل والعقود والمناسبات
-- آمن للتكرار: يضيف الناقص فقط ولا يحذف بيانات

-- 1) النقل
alter table public.cargo_orders add column if not exists client_id uuid references auth.users(id) on delete set null;
alter table public.cargo_orders add column if not exists weight_kg numeric(10,2);
alter table public.cargo_orders add column if not exists delivery_points jsonb default '[]'::jsonb;
alter table public.cargo_orders add column if not exists client_budget_usd numeric(10,2) default 0;
alter table public.cargo_orders add column if not exists is_urgent boolean not null default false;
alter table public.cargo_orders add column if not exists route_info jsonb;  -- {km, min} معلومة فقط

-- 2) العقود
alter table public.contract_orders add column if not exists route_info jsonb;

-- 3) المناسبات
alter table public.event_orders add column if not exists gathering_lat double precision;
alter table public.event_orders add column if not exists gathering_lng double precision;
alter table public.event_orders add column if not exists route_info jsonb;

-- final_point كان نصاً، أصبح {label, lat, lng} — تحويل مع الحفاظ على القيم القديمة
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='event_orders' and column_name='final_point') = 'text' then
    alter table public.event_orders
      alter column final_point type jsonb
      using case when final_point is null or btrim(final_point)='' then null
                 else jsonb_build_object('label', final_point) end;
  end if;
end $$;

-- تحقق: يجب أن تظهر 10 أسطر
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public' and (
  (table_name='cargo_orders'    and column_name in ('client_id','weight_kg','delivery_points','client_budget_usd','is_urgent','route_info')) or
  (table_name='contract_orders' and column_name = 'route_info') or
  (table_name='event_orders'    and column_name in ('gathering_lat','gathering_lng','final_point','route_info'))
)
order by table_name, column_name;
