-- الأمان والطوارئ (7 من 9): بيانات صفحة الرابط (تفتح بدون تسجيل دخول)
create or replace function public.get_live_share(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s live_shares; k sos_cases; c jsonb; d uuid; v_role text;
begin
  select * into s from live_shares where token = p_token;
  if s.token is not null then
    c := public._share_ctx(s.service, s.ref_id);
    if c is null or not (c->>'active')::boolean then
      return jsonb_build_object('kind', 'trip', 'active', false);
    end if;
    d := (c->>'driver')::uuid;
    return jsonb_build_object('kind', 'trip', 'active', true, 'service', s.service,
             'from', c->'from', 'to', c->'to', 'from_text', c->'from_text', 'to_text', c->'to_text',
             'driver', public._person_json(d), 'car', public._live_pos(d));
  end if;

  select * into k from sos_cases where token = p_token;
  if k.id is null then return null; end if;
  if k.ended_at is not null then
    return jsonb_build_object('kind', 'sos', 'active', false, 'ended_at', k.ended_at);
  end if;
  if k.service is not null then c := public._share_ctx(k.service, k.ref_id); end if;
  v_role := case when c is not null and (c->>'driver')::uuid = k.user_id then 'driver' else 'customer' end;
  d := (c->>'driver')::uuid;
  return jsonb_build_object('kind', 'sos', 'active', true, 'started_at', k.started_at, 'role', v_role,
           'person', public._person_json(k.user_id) - case when v_role = 'driver' then '' else 'plate' end,
           'pos', case when k.lat is not null then jsonb_build_object('lat', k.lat, 'lng', k.lng, 'at', k.pos_at) end,
           'service', k.service,
           'from', c->'from', 'to', c->'to', 'from_text', c->'from_text', 'to_text', c->'to_text',
           -- السائق بخطر: بيانات الراكب • الراكب بخطر: بيانات السائق وسيارته وموقعها
           'customer', case when v_role = 'driver' and c->>'customer' is not null
                            then jsonb_build_object('phone', (select phone from profiles where id = (c->>'customer')::uuid)) end,
           'passengers', case when v_role = 'driver' then c->'passengers' end,
           'driver', case when v_role = 'customer' and d is not null then public._person_json(d) end,
           'car', case when v_role = 'customer' and d is not null then public._live_pos(d) end);
end; $$;
grant execute on function public.get_live_share(text) to anon, authenticated;
