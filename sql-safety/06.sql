-- الأمان والطوارئ (6 من 9): بدء الطوارئ وإنهاؤها + تنبيه الإدارة
create or replace function public._sos_json(c sos_cases)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('token', c.token, 'mode', c.mode, 'started_at', c.started_at,
           'name', (select full_name from profiles where id = c.user_id))
         || public.my_sos_settings();
$$;
revoke execute on function public._sos_json(sos_cases) from public, anon, authenticated;

create or replace function public.sos_start(p_mode text, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c sos_cases; x jsonb; v_name text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if p_mode not in ('family','all') then raise exception 'NOT_ALLOWED'; end if;
  select * into c from sos_cases where user_id = auth.uid() and ended_at is null;
  if c.id is not null then
    update sos_cases set mode = case when p_mode = 'all' then 'all' else mode end where id = c.id returning * into c;
    return public._sos_json(c);
  end if;
  x := public._my_active_ctx(auth.uid());
  insert into sos_cases(user_id, mode, service, ref_id, lat, lng, pos_at)
  values (auth.uid(), p_mode, x->>'service', (x->>'ref')::uuid, p_lat, p_lng, case when p_lat is not null then now() end)
  returning * into c;
  if p_lat is not null then
    insert into sos_points(case_id, lat, lng) values (c.id, p_lat, p_lng);
    insert into live_positions(user_id, lat, lng, updated_at) values (auth.uid(), p_lat, p_lng, now())
    on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
  end if;
  select full_name into v_name from profiles where id = auth.uid();
  perform public._notify_admins('sos', '🆘 حالة طوارئ', coalesce(v_name, 'مستخدم') || ' ضغط زر الطوارئ'
            || case when p_mode = 'all' then ' (مع الطوارئ الحكومية)' else '' end,
            jsonb_build_object('case_id', c.id, 'token', c.token, 'user_id', auth.uid(), 'service', c.service, 'ref_id', c.ref_id));
  return public._sos_json(c);
end; $$;
grant execute on function public.sos_start(text, double precision, double precision) to authenticated;

create or replace function public.sos_end()
returns jsonb language plpgsql security definer set search_path = public as $$
declare c sos_cases; v_name text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  update sos_cases set ended_at = now() where user_id = auth.uid() and ended_at is null returning * into c;
  if c.id is null then return jsonb_build_object('ended', false); end if;
  select full_name into v_name from profiles where id = auth.uid();
  perform public._notify_admins('sos_end', 'انتهت حالة الطوارئ', coalesce(v_name, 'مستخدم') || ' أكّد أنه بخير',
            jsonb_build_object('case_id', c.id));
  return jsonb_build_object('ended', true);
end; $$;
grant execute on function public.sos_end() to authenticated;

create or replace function public.my_sos_active()
returns jsonb language sql stable security definer set search_path = public as $$
  select public._sos_json(c) from sos_cases c where c.user_id = auth.uid() and c.ended_at is null;
$$;
grant execute on function public.my_sos_active() to authenticated;
