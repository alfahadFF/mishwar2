-- الجزء 4 من 14 — مركبة الناقل في الحساب

alter table public.profiles add column if not exists vehicle_class text
  check (vehicle_class in ('pk800','pk1200','pk1500','pk2000','md3','md4','md5','md6','md7','truck'));
