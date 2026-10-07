-- الدفع وإنهاء التكسي (5 من 39): إعادة تعيين الرمز ومجموع تحويلات اليوم
drop function if exists public.admin_reset_wallet_pin(uuid);
create or replace function public.admin_reset_wallet_pin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update wallet_security set pin_hash = null, pin_salt = null, failed = 0, locked_until = null, updated_at = now() where user_id = p_user;
end; $$;

-- مجموع التحويلات اليوم (بتوقيت دمشق)
create or replace function public._transferred_today(p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(-amount), 0) from wallet_transactions
   where user_id = p_user and kind = 'transfer_out'
     and (created_at at time zone 'Asia/Damascus')::date = (now() at time zone 'Asia/Damascus')::date;
$$;
grant execute on function public.admin_reset_wallet_pin(uuid) to authenticated;
