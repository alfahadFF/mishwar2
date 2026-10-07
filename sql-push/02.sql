-- الإشعارات (2 من 7): الإرسال الفعلي عن طريق Expo
create or replace function public._push_km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2)
         + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)));
$$;

-- مقدم الخدمة بيستقبل إشعارات الطلبات الجديدة؟
create or replace function public._push_new_orders_ok(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select new_orders from provider_push_prefs where user_id = p_uid), true)
     and not public.wallet_blocked(p_uid);
$$;
revoke execute on function public._push_new_orders_ok(uuid) from public, anon, authenticated;

create or replace function public._push_send(p_users uuid[], p_title text, p_body text, p_data jsonb, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare v_msgs jsonb; v_n int; i int;
begin
  select jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', p_title, 'body', coalesce(p_body, ''),
           'data', coalesce(p_data, '{}'::jsonb) || jsonb_build_object('kind', p_kind),
           'sound', case when p_kind = 'taxi_new' then 'taxi_order.wav' else 'default' end,
           'channelId', case when p_kind = 'taxi_new' then 'taxi_orders' else 'default' end,
           'priority', 'high'))
    into v_msgs
    from device_push_tokens t where t.user_id = any(p_users);
  if v_msgs is null then return; end if;
  v_n := jsonb_array_length(v_msgs);
  for i in 0 .. (v_n - 1) / 100 loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := (select jsonb_agg(e) from jsonb_array_elements(v_msgs) with ordinality x(e, k) where k > i * 100 and k <= (i + 1) * 100),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
  end loop;
exception when others then
  null; -- الإشعار ما لازم يوقف أي عملية
end;
$$;
revoke execute on function public._push_send(uuid[], text, text, jsonb, text) from public, anon, authenticated;

-- كل إشعار بينكتب بالتطبيق بيوصل كمان على الموبايل
create or replace function public._push_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._push_send(array[new.user_id], new.title, new.body, new.data, new.kind);
  return new;
end;
$$;
drop trigger if exists trg_push_notification on public.user_notifications;
create trigger trg_push_notification after insert on public.user_notifications
  for each row execute function public._push_on_notification();
