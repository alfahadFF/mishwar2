select 'الأيام المجانية' as "الفحص", value as "النتيجة" from public.app_settings where key = 'free_days'
union all
select 'دالة الفترة المجانية', case when to_regprocedure('public.free_until(uuid)') is not null then 'موجودة' else 'غير موجودة' end
union all
select 'خصم العمولة الجديد', case when pg_get_functiondef('public._wallet_charge(uuid,text,uuid,numeric)'::regprocedure) like '%free_until%' then 'محدّث' else 'قديم' end;
