-- التقييم (4 من 7): العقود — اليومي بنهايته، الأسبوعي كل أسبوع، الشهري كل شهر
create or replace function public._rating_contract_tick()
returns void language plpgsql security definer set search_path = public as $$
declare f record; v_start timestamptz; v_stop timestamptz; v_step interval; v_k int; v_last timestamptz;
begin
  for f in select x.id, x.driver_id, x.ended_at, o.user_id, o.contract_unit, o.unit_count, o.start_date, o.end_date
             from contract_offers x join contract_orders o on o.id = x.contract_order_id
            where x.status = 'accepted' and o.start_date is not null and o.contract_unit is not null
              and coalesce(x.ended_at, (o.end_date + 1)::timestamp at time zone 'Asia/Damascus') > now() - interval '24 hours' loop
    v_start := f.start_date::timestamp at time zone 'Asia/Damascus';
    v_stop := least(now(), coalesce(f.ended_at, 'infinity'::timestamptz),
                    case when f.end_date is not null then (f.end_date + 1)::timestamp at time zone 'Asia/Damascus' else 'infinity'::timestamptz end);
    if f.contract_unit in ('week','month') then
      v_step := case f.contract_unit when 'week' then interval '1 week' else interval '1 month' end;
      v_k := 0;
      while v_k < f.unit_count and v_start + v_step * (v_k + 1) <= v_stop loop v_k := v_k + 1; end loop;
      if v_k >= 1 then perform public._rating_add(f.user_id, f.driver_id, 'contracts', f.id, v_k, v_start + v_step * v_k); end if;
      v_last := v_start + v_step * v_k;
    else
      v_last := null;
    end if;
    -- نهاية العقد (أو إنهاؤه المبكر) إذا ما صادف نهاية فترة
    if v_stop < now() or (f.ended_at is not null and f.ended_at <= now()) then
      if v_last is null or v_stop - v_last > interval '1 day' then
        perform public._rating_add(f.user_id, f.driver_id, 'contracts', f.id, 999, v_stop);
      end if;
    end if;
  end loop;
end; $$;
revoke execute on function public._rating_contract_tick() from public, anon, authenticated;

-- يُستدعى مع الخصم الموحّد عند فتح التطبيق
create or replace function public.settle_all_my_dues()
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; b jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('months', 0, 'amount', 0); end if;
  a := public.contract_settle_my_dues();
  b := public.rental_settle_my_dues();
  perform public._rating_contract_tick();
  return jsonb_build_object('months', coalesce((a->>'months')::int, 0) + coalesce((b->>'months')::int, 0),
                            'amount', coalesce((a->>'amount')::numeric, 0) + coalesce((b->>'amount')::numeric, 0));
end; $$;
revoke execute on function public.settle_all_my_dues() from public, anon;
grant execute on function public.settle_all_my_dues() to authenticated;
