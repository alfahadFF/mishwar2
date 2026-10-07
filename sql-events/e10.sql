create or replace function public.reject_event_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update event_offers f set status = 'rejected', reason = 'customer'
   where f.id = p_offer and f.status = 'pending'
     and exists (select 1 from event_orders o where o.id = f.event_order_id and o.user_id = auth.uid());
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;

-- إلغاء الطلب: قبل قبول أي عرض فقط
create or replace function public.cancel_event_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from event_offers where event_order_id = p_order and status = 'accepted') then raise exception 'HAS_ACCEPTED'; end if;
  update event_orders set status = 'cancelled' where id = p_order and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'ORDER_CLOSED'; end if;
  update event_offers set status = 'rejected', reason = 'cancelled' where event_order_id = p_order and status = 'pending';
end; $$;
