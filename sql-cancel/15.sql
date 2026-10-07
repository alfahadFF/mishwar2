-- إلغاءات السائق (15 من 16): المدير: سجل إلغاءات سائق
drop function if exists public.admin_driver_cancels(uuid);
create or replace function public.admin_driver_cancels(p_driver uuid)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select jsonb_build_object('id', c.id, 'service', c.service, 'ref_id', c.ref_id, 'reason', c.reason,
           'note', c.note, 'voided', c.voided_at is not null, 'created_at', c.created_at)
    from taxi_driver_cancels c where c.driver_id = p_driver order by c.created_at desc limit 100;
end; $$;
grant execute on function public.admin_driver_cancels(uuid) to authenticated;
