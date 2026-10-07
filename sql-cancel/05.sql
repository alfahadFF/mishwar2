-- إلغاءات السائق (5 من 16): تسجيل الإلغاء وفحص الحد
create or replace function public._register_cancel(p_driver uuid, p_service text, p_ref uuid, p_reason text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int; p profiles;
begin
  if coalesce(p_reason, '') not in ('no_answer','car_issue','emergency','other') then raise exception 'REASON_REQUIRED'; end if;
  insert into taxi_driver_cancels(driver_id, service, ref_id, reason, note)
  values (p_driver, p_service, p_ref, p_reason, nullif(btrim(coalesce(p_note, '')), '')) returning id into v_id;
  select * into p from profiles where id = p_driver for update;
  v_n := public._taxi_cancel_count(p_driver);
  if not p.taxi_suspended and v_n >= p.taxi_cancel_base + 10 then
    update profiles set taxi_suspended = true, taxi_suspended_at = now(), taxi_suspend_cancel = v_id where id = p_driver;
    perform public._notify_admins('driver_suspended', 'تم إيقاف سائق', coalesce(p.full_name, 'سائق') || ' • ' || v_n || ' إلغاء',
      jsonb_build_object('driver_id', p_driver, 'count', v_n));
    return jsonb_build_object('count', v_n, 'suspended', true);
  elsif v_n = p.taxi_cancel_base + 5 then
    perform public._notify_admins('driver_cancels_alert', 'تنبيه إلغاءات سائق', coalesce(p.full_name, 'سائق') || ' • ' || v_n || ' إلغاء',
      jsonb_build_object('driver_id', p_driver, 'count', v_n));
  end if;
  return jsonb_build_object('count', v_n, 'suspended', p.taxi_suspended);
end; $$;
revoke all on function public._register_cancel(uuid, text, uuid, text, text) from public, anon, authenticated;
