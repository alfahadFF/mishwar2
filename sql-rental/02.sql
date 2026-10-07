-- التأجير (2 من 11): تخزين صور السيارات (3 صور لكل إعلان)
insert into storage.buckets (id, name, public)
values ('rental-photos', 'rental-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "rental photos read" on storage.objects;
create policy "rental photos read" on storage.objects for select
  using (bucket_id = 'rental-photos');

drop policy if exists "rental photos upload" on storage.objects;
create policy "rental photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'rental-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "rental photos update" on storage.objects;
create policy "rental photos update" on storage.objects for update to authenticated
  using (bucket_id = 'rental-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "rental photos delete" on storage.objects;
create policy "rental photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'rental-photos' and (storage.foldername(name))[1] = auth.uid()::text);
