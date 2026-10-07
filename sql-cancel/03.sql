-- إلغاءات السائق (3 من 16): عدد الإلغاءات وحالة الإيقاف
create or replace function public._taxi_cancel_count(p_driver uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from taxi_driver_cancels where driver_id = p_driver and voided_at is null;
$$;

create or replace function public._taxi_suspended(p_driver uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select taxi_suspended from profiles where id = p_driver), false);
$$;
revoke all on function public._taxi_cancel_count(uuid) from public, anon, authenticated;
grant execute on function public._taxi_suspended(uuid) to authenticated;
