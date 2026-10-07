-- تصحيح منطق العقود: تفصيل الأدوار + إضافة نظام الورديات للعمل
-- التعليمية: parent / employee / institution — العملية: business مع ورديات

-- توسيع check ليشمل الأدوار الجديدة
alter table public.contract_orders drop constraint if exists contract_orders_contract_role_check;
alter table public.contract_orders add constraint contract_orders_contract_role_check
  check (contract_role in ('parent','employee','institution','business','personal'));

-- إضافة حقول الورديات للمصانع/الشركات/العمال
alter table public.contract_orders add column if not exists shift_type text check (shift_type in ('morning','evening','night','two_shifts','three_shifts','custom'));
alter table public.contract_orders add column if not exists shift_times jsonb default '[]'::jsonb; -- [{shift, start_time, end_time}]

-- للتوافق: نحول personal القديم إلى parent
update public.contract_orders set contract_role='parent' where contract_role='personal';

-- تحقق
select column_name, data_type from information_schema.columns where table_name='contract_orders' order by ordinal_position;
