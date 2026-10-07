-- الرحلة المشتركة (4 من 22): ظهور الرحلات للركاب
drop policy if exists "الكل يرى الرحلات المتاحة على طول المسار" on public.taxi_shared_trips;
create policy "الكل يرى الرحلات المتاحة على طول المسار" on public.taxi_shared_trips for select
  using (status = 'pending' and available_seats > 0 and public._shared_open(status, started_at, duration_min));
