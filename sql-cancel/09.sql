-- إلغاءات السائق (9 من 16): شطب الإلغاء بالغلط خلال 5 دقائق
create or replace function public._taxi_cancel_undo(p_driver uuid, p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c taxi_driver_cancels;
begin
  select * into c from taxi_driver_cancels
   where driver_id = p_driver and service = 'taxi' and ref_id = p_order and voided_at is null
     and created_at > now() - interval '5 minutes'
   order by created_at desc limit 1 for update;
  if c.id is null then return; end if;
  update taxi_driver_cancels set voided_at = now() where id = c.id;
  update profiles set taxi_suspended = false, taxi_suspended_at = null, taxi_suspend_cancel = null
   where id = p_driver and taxi_suspend_cancel = c.id;
end; $$;
revoke all on function public._taxi_cancel_undo(uuid, uuid) from public, anon, authenticated;
