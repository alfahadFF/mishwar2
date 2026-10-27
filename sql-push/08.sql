-- الإشعارات (8): تحويل الإرسال إلى قنوات Android الجديدة ذات الصوت.
-- شغّل هذا بعد تثبيت إصدار التطبيق الذي ينشئ القناتين mishwar_notifications_v2 و taxi_orders_v2.
create or replace function public._push_send(p_users uuid[], p_title text, p_body text, p_data jsonb, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare v_msgs jsonb; v_n int; i int;
begin
  select jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', p_title,
           'body', coalesce(p_body, ''),
           'data', coalesce(p_data, '{}'::jsonb) || jsonb_build_object('kind', p_kind),
           'sound', case when p_kind = 'taxi_new' then 'taxi_order.wav' else 'default' end,
           'channelId', case when p_kind = 'taxi_new' then 'taxi_orders_v2' else 'mishwar_notifications_v2' end,
           'priority', 'high'))
    into v_msgs
    from public.device_push_tokens t
   where t.user_id = any(p_users);

  if v_msgs is null then return; end if;
  v_n := jsonb_array_length(v_msgs);
  for i in 0 .. (v_n - 1) / 100 loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := (
        select jsonb_agg(e)
          from jsonb_array_elements(v_msgs) with ordinality x(e, k)
         where k > i * 100 and k <= (i + 1) * 100
      ),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  end loop;
exception when others then
  null; -- لا نوقف العملية الأساسية إذا تعطل إرسال الإشعار
end;
$$;

revoke execute on function public._push_send(uuid[], text, text, jsonb, text) from public, anon, authenticated;
