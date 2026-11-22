-- الجزء 15 من 15 — توافق مخطط طلبات النقل مع نموذج النشر الحالي.
-- الموعد والوزن اختياريان في الواجهة، ورقم الهاتف يُقرأ من ملف الحساب عند الحاجة.
alter table public.cargo_orders add column if not exists scheduled_time text;
alter table public.cargo_orders alter column client_phone drop not null;
alter table public.cargo_orders alter column weight_kg drop not null;

notify pgrst, 'reload schema';
