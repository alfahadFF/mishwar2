-- الرحلة المشتركة (5 من 22): الإنهاء التلقائي للرحلات المنسية
create or replace function public._shared_auto_close(p_driver uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.shared_rpc', '1', true);
  update taxi_shared_trips set status = 'completed', completed_at = now()
   where driver_id = p_driver and started_at is not null and status in ('pending','full')
     and not public._shared_open(status, started_at, duration_min);
end; $$;
revoke all on function public._shared_auto_close(uuid) from public, anon, authenticated;
