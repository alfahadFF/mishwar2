-- الدفع وإنهاء التكسي (10 من 39): المدير: البحث عن مستخدم
drop function if exists public.admin_find_user(text);
create or replace function public.admin_find_user(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid; p profiles;
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  v := public._wallet_lookup(p_query);
  if v is null then raise exception 'USER_NOT_FOUND'; end if;
  select * into p from profiles where id = v;
  return jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone, 'wallet_id', p.wallet_id,
    'balance', coalesce((select balance from wallets where user_id = v), 0),
    'has_pin', exists (select 1 from wallet_security where user_id = v and pin_hash is not null),
    'last_tx', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
       select kind, amount, note, created_at from wallet_transactions where user_id = v order by created_at desc limit 10) x));
end; $$;
grant execute on function public.admin_find_user(text) to authenticated;
