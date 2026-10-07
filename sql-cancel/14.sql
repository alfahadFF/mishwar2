-- إلغاءات السائق (14 من 16): المدير: رفع الإيقاف
drop function if exists public.admin_lift_taxi_suspension(uuid);
create or replace function public.admin_lift_taxi_suspension(p_driver uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int := public._taxi_cancel_count(p_driver);
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update profiles set taxi_suspended = false, taxi_suspended_at = null, taxi_suspend_cancel = null, taxi_cancel_base = v_n
   where id = p_driver and taxi_suspended;
  if not found then raise exception 'NOT_SUSPENDED'; end if;
  insert into user_notifications(user_id, kind, title, body, data)
  values (p_driver, 'taxi_unsuspended', 'تم رفع الإيقاف', 'يمكنك استقبال طلبات التكسي من جديد', '{}'::jsonb);
  return jsonb_build_object('count', v_n, 'next_alert_at', v_n + 5, 'next_suspend_at', v_n + 10);
end; $$;
grant execute on function public.admin_lift_taxi_suspension(uuid) to authenticated;
