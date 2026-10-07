-- الدفع وإنهاء التكسي (33 من 39): بانتظار الدفع: التكسي
create or replace function public._pay_items_c()
returns table(service text, ref_id uuid, period int, payee uuid, gross numeric, title text, done_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'taxi'::text, o.id, 1, o.driver_id, coalesce(o.final_fare, o.estimated_fare)::numeric, 'رحلة تكسي', o.completed_at
    from taxi_orders o
   where o.user_id = auth.uid() and o.status = 'completed' and o.driver_id is not null
     and o.accepted_at is not null and coalesce(o.final_fare, o.estimated_fare) > 0;
$$;
