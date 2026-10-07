-- السائق والناقل (1 من 5): الحقول الجديدة، اللوحة الفريدة، تخزين الصور
alter table public.profiles add column if not exists vehicle_owner text;
alter table public.profiles add column if not exists plate_norm text;
alter table public.profiles add column if not exists fuel text;
alter table public.profiles add column if not exists license_no text;
alter table public.profiles add column if not exists license_place text;
alter table public.profiles add column if not exists license_expiry date;
alter table public.profiles add column if not exists license_photo_path text;
alter table public.profiles add column if not exists svc_airport boolean;
alter table public.profiles add column if not exists svc_contracts boolean;
alter table public.profiles add column if not exists work_role text;          -- نوع العمل الذي بدأ تسجيله ولم يكمله
alter table public.profiles add column if not exists work_registered_at timestamptz;
alter table public.profiles add column if not exists work_verified_at timestamptz;
alter table public.profiles add column if not exists work_reminders jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_fuel_check;
alter table public.profiles add constraint profiles_fuel_check
  check (fuel is null or fuel in ('petrol','diesel','gas','electric','hybrid'));

-- توحيد رقم اللوحة: أرقام إنجليزية، أحرف كبيرة، بلا فراغات أو رموز
create or replace function public._norm_plate(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(upper(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')),
                               '[^0-9A-Z\u0621-\u064A]', '', 'g'), '');
$$;

-- المركبة الواحدة على حساب واحد فقط ضمن البلد
create unique index if not exists profiles_plate_uniq on public.profiles(country, plate_norm)
  where plate_norm is not null and deleted_at is null;

-- صور السائق والمركبة (عامة) وصورة الرخصة (خاصة)
insert into storage.buckets (id, name, public) values ('work-photos', 'work-photos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('work-docs', 'work-docs', false) on conflict (id) do nothing;

drop policy if exists "work photos read" on storage.objects;
create policy "work photos read" on storage.objects for select using (bucket_id = 'work-photos');
drop policy if exists "work files upload" on storage.objects;
create policy "work files upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('work-photos', 'work-docs') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "work files update" on storage.objects;
create policy "work files update" on storage.objects for update to authenticated
  using (bucket_id in ('work-photos', 'work-docs') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "work docs read own" on storage.objects;
create policy "work docs read own" on storage.objects for select to authenticated
  using (bucket_id = 'work-docs' and (storage.foldername(name))[1] = auth.uid()::text);
