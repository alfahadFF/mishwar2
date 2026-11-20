-- توفّر التكسي (3 من 5): مواقع السائقين + السيارات القريبة للراكب
create table if not exists public.taxi_driver_positions (
  driver_id uuid primary key references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  category text not null,
  updated_at timestamptz not null default now()
);
alter table public.taxi_driver_positions enable row level security;
-- بدون سياسات: الوصول فقط عبر الدالتين تحت

create or replace function public.driver_taxi_ping(p_lat double precision, p_lng double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cat text := public._taxi_category(auth.uid());
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if v_cat is null or public._taxi_suspended(auth.uid()) or public.wallet_blocked(auth.uid()) then
    delete from taxi_driver_positions where driver_id = auth.uid();
    return jsonb_build_object('visible', false);
  end if;
  insert into taxi_driver_positions(driver_id, lat, lng, category, updated_at)
  values (auth.uid(), p_lat, p_lng, v_cat, now())
  on conflict (driver_id) do update set lat = excluded.lat, lng = excluded.lng,
    category = excluded.category, updated_at = now();
  return jsonb_build_object('visible', true);
end; $$;
grant execute on function public.driver_taxi_ping(double precision, double precision) to authenticated;

-- لا تُرسل إحداثيات السائق أو مسار رحلته إلى الراكب؛ أعد فقط توفر الفئات كتجميع.
drop function if exists public.nearby_taxis(double precision, double precision, int);
create or replace function public.nearby_taxis(p_lat double precision, p_lng double precision, p_radius int default 5)
returns setof jsonb language sql stable security definer set search_path = public as $$
  with eligible as (
    select d.category, (a.n > 0) as busy
      from public.taxi_driver_positions d
      cross join lateral (select count(*) as n from public.taxi_orders o
                           where o.driver_id = d.driver_id and o.status in ('accepted','arrived','in_progress')) a
     where d.updated_at > now() - interval '2 minutes'
       and d.driver_id is distinct from auth.uid()
       and a.n < 2
       and d.category = public._taxi_category(d.driver_id)
       and not public._taxi_suspended(d.driver_id)
       and not public.wallet_blocked(d.driver_id)
       and sqrt(power((d.lng - p_lng) * 111.32 * cos(radians(p_lat)), 2) + power((d.lat - p_lat) * 110.574, 2))
           <= case when p_radius >= 10 then 10 else 5 end
  )
  select jsonb_build_object(
           'cat', e.category,
           'free_count', count(*) filter (where not e.busy),
           'busy_count', count(*) filter (where e.busy),
           'eta_min', case when count(*) filter (where not e.busy) > 0
                           then case when p_radius >= 10 then 10 else 5 end else null end,
           'eta_max', case when count(*) filter (where not e.busy) > 0
                           then case when p_radius >= 10 then 25 else 15 end else null end)
    from eligible e
   group by e.category;
$$;
grant execute on function public.nearby_taxis(double precision, double precision, int) to authenticated;
