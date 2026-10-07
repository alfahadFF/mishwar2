-- الرحلة المشتركة (3 من 22): هل الرحلة ما زالت مفتوحة
-- مفتوحة: غير منتهية وغير ملغاة، وإذا بدأت فلم تتجاوز مدة المسار + ساعتين
create or replace function public._shared_open(p_status text, p_started timestamptz, p_duration int)
returns boolean language sql stable as $$
  select p_status in ('pending','full')
     and (p_started is null or p_started + make_interval(mins => coalesce(p_duration, 60) + 120) > now());
$$;
grant execute on function public._shared_open(text, timestamptz, int) to anon, authenticated;
