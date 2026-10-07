-- إلغاءات السائق (13 من 16): المدير: قائمة السائقين والإلغاءات
drop function if exists public.admin_taxi_drivers(boolean);
create or replace function public.admin_taxi_drivers(p_only_suspended boolean default false)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select jsonb_build_object('driver_id', p.id, 'name', p.full_name, 'phone', p.phone,
           'count', public._taxi_cancel_count(p.id), 'suspended', p.taxi_suspended, 'suspended_at', p.taxi_suspended_at,
           'last_reasons', (select coalesce(jsonb_agg(c.reason), '[]'::jsonb) from (select reason from taxi_driver_cancels
              where driver_id = p.id and voided_at is null order by created_at desc limit 3) c))
    from profiles p
   where exists (select 1 from taxi_driver_cancels x where x.driver_id = p.id and x.voided_at is null)
     and (not coalesce(p_only_suspended, false) or p.taxi_suspended)
   order by p.taxi_suspended desc, public._taxi_cancel_count(p.id) desc;
end; $$;
grant execute on function public.admin_taxi_drivers(boolean) to authenticated;
