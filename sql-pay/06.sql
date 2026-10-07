-- الدفع وإنهاء التكسي (6 من 39): فحص حد التحويل اليومي
-- حد التحويل اليومي: يُرجع null إذا مسموح، أو الخطأ مع المتبقي
create or replace function public._transfer_limit_check(p_user uuid, p_amt numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_limit numeric := coalesce((select value::numeric from app_settings where key = 'wallet_daily_transfer_limit'), 0);
        v_today numeric := public._transferred_today(p_user);
begin
  if v_limit > 0 and v_today + p_amt > v_limit then
    return jsonb_build_object('error', 'DAILY_LIMIT', 'left', greatest(v_limit - v_today, 0));
  end if;
  return null;
end; $$;
revoke all on function public._transfer_limit_check(uuid, numeric) from public, anon, authenticated;
