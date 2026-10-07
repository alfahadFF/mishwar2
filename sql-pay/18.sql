-- الدفع وإنهاء التكسي (18 من 39): عرض الإشعارات وتعليمها كمقروءة
drop function if exists public.my_notifications(int);
create or replace function public.my_notifications(p_limit int default 30)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(n) - 'user_id' from user_notifications n
   where n.user_id = auth.uid() order by n.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

drop function if exists public.mark_notifications_read();
create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update user_notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;
grant execute on function public.my_notifications(int) to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
