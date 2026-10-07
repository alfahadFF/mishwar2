-- إلغاءات السائق (4 من 16): إشعار المدراء
create or replace function public._notify_admins(p_kind text, p_title text, p_body text, p_data jsonb)
returns void language sql security definer set search_path = public as $$
  insert into user_notifications(user_id, kind, title, body, data)
  select id, p_kind, p_title, p_body, p_data from profiles
   where account_type::text = 'admin' or type::text = 'admin';
$$;
revoke all on function public._notify_admins(text, text, text, jsonb) from public, anon, authenticated;
