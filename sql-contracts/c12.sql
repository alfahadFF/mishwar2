create or replace function public.reject_contract_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update contract_offers f set status = 'rejected', reason = 'customer'
   where f.id = p_offer and f.status = 'pending'
     and exists (select 1 from contract_orders o where o.id = f.contract_order_id and o.user_id = auth.uid());
  if not found then raise exception 'OFFER_NOT_AVAILABLE'; end if;
end; $$;

-- إلغاء الطلب: قبل قبول أي عرض فقط
create or replace function public.cancel_contract_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from contract_offers where contract_order_id = p_order and status = 'accepted') then raise exception 'HAS_ACCEPTED'; end if;
  update contract_orders set status = 'cancelled' where id = p_order and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'ORDER_CLOSED'; end if;
  update contract_offers set status = 'rejected', reason = 'cancelled' where contract_order_id = p_order and status = 'pending';
end; $$;

-- إنهاء عقد مركبة (الزبون فقط): يتوقف الخصم الشهري، ولا استرداد لما خُصم
create or replace function public.end_contract_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  update contract_offers f set ended_at = now()
   where f.id = p_offer and f.status = 'accepted' and f.ended_at is null
     and exists (select 1 from contract_orders o where o.id = f.contract_order_id and o.user_id = auth.uid())
  returning contract_order_id into v_order;
  if v_order is null then raise exception 'NOT_ALLOWED'; end if;
  -- عند إنهاء كل المركبات يُغلق الطلب
  if not exists (select 1 from contract_offers where contract_order_id = v_order and status = 'accepted' and ended_at is null) then
    update contract_orders set status = 'completed' where id = v_order;
    update contract_offers set status = 'rejected', reason = 'cancelled' where contract_order_id = v_order and status = 'pending';
  end if;
end; $$;
