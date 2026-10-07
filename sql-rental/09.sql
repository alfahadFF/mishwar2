-- التأجير (9 من 11): العمولة الشهرية (تتوقف عند «تم الاستلام — إعادة نشر»)
create or replace function public.rental_settle_my_dues()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_due timestamptz; v_fee numeric; v_n int := 0; v_sum numeric := 0;
begin
  if auth.uid() is null then return jsonb_build_object('months', 0, 'amount', 0); end if;
  for r in select id, unit_price, months_charged, unit_count, start_at from rental_requests
            where provider_id = auth.uid() and status = 'accepted' and unit = 'month'
              and ended_at is null and months_charged < unit_count for update loop
    loop
      exit when r.months_charged >= r.unit_count;
      v_due := r.start_at + make_interval(months => r.months_charged);
      exit when v_due > now();
      v_fee := public._wallet_charge_at(auth.uid(), 'rental', r.id, r.unit_price, v_due);
      r.months_charged := r.months_charged + 1;
      update rental_requests set months_charged = r.months_charged, commission_total = commission_total + v_fee where id = r.id;
      v_n := v_n + 1; v_sum := v_sum + v_fee;
    end loop;
  end loop;
  return jsonb_build_object('months', v_n, 'amount', v_sum);
end; $$;
grant execute on function public.rental_settle_my_dues() to authenticated;
