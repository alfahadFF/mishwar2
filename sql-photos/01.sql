-- صور مقدّم الخدمة (1 من 2): يرى الزبون صورة السائق والمركبة؛ الاسم والهاتف يبقيان مخفيين حتى القبول
-- p_service: cargo_offer, event_offer, contract_offer (العروض) أو cargo, taxi, taxi_shared (بعد القبول)
create or replace function public.provider_photos(p_service text, p_refs uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  with x as (
    select f.id as ref, f.driver_id as pid from cargo_offers f join cargo_orders o on o.id = f.cargo_order_id
     where p_service = 'cargo_offer' and f.id = any(p_refs) and o.customer_id = auth.uid()
    union all
    select f.id, f.driver_id from event_offers f join event_orders o on o.id = f.event_order_id
     where p_service = 'event_offer' and f.id = any(p_refs) and o.user_id = auth.uid()
    union all
    select f.id, f.driver_id from contract_offers f join contract_orders o on o.id = f.contract_order_id
     where p_service = 'contract_offer' and f.id = any(p_refs) and o.user_id = auth.uid()
    union all
    select o.id, o.carrier_id from cargo_orders o
     where p_service = 'cargo' and o.id = any(p_refs) and o.customer_id = auth.uid()
    union all
    select o.id, o.driver_id from taxi_orders o
     where p_service = 'taxi' and o.id = any(p_refs) and o.user_id = auth.uid()
    union all
    select r.id, t.driver_id from taxi_shared_requests r join taxi_shared_trips t on t.id = r.trip_id
     where p_service = 'taxi_shared' and r.id = any(p_refs) and r.passenger_id = auth.uid()
  )
  select coalesce(jsonb_object_agg(x.ref, jsonb_build_object('driver', p.avatar_url, 'vehicle', p.vehicle_photo_url)), '{}'::jsonb)
    from x join profiles p on p.id = x.pid
   where p.avatar_url is not null or p.vehicle_photo_url is not null;
$$;
revoke execute on function public.provider_photos(text, uuid[]) from public, anon;
grant execute on function public.provider_photos(text, uuid[]) to authenticated;
