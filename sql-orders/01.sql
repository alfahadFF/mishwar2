-- Remove a user's own cancelled cargo/event/contract order only when it has no accepted provider,
-- financial ledger entries, or service-history records. Child offer rows cascade on delete.
create or replace function public.delete_my_cancelled_order(p_service text, p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_fin_service text;
  v_offer_service text;
  v_offer_refs uuid[] := array[]::uuid[];
  v_order_refs uuid[] := array[]::uuid[];
  v_cargo public.cargo_orders%rowtype;
  v_event public.event_orders%rowtype;
  v_contract public.contract_orders%rowtype;
begin
  if v_user is null then raise exception 'NOT_AUTH'; end if;
  if p_order is null then raise exception 'BAD_ORDER'; end if;

  if p_service = 'cargo' then
    v_fin_service := 'cargo';
    v_offer_service := 'cargo_offer';

    -- Check ownership before taking child-row locks; cargo acceptance locks the offer first.
    if not exists (select 1 from public.cargo_orders where id = p_order and customer_id = v_user) then
      raise exception 'NOT_ALLOWED';
    end if;
    perform 1 from public.cargo_offers where cargo_order_id = p_order order by id for update;
    select * into v_cargo from public.cargo_orders
      where id = p_order and customer_id = v_user for update;
    if not found then raise exception 'NOT_ALLOWED'; end if;
    if v_cargo.status is distinct from 'cancelled' then raise exception 'ORDER_NOT_CANCELLED'; end if;
    if v_cargo.carrier_id is not null or v_cargo.accepted_via is not null
       or v_cargo.accepted_at is not null or v_cargo.completed_at is not null
       or v_cargo.agreed_price is not null or v_cargo.commission_amount is not null then
      raise exception 'HAS_ACCEPTED';
    end if;
    if exists (select 1 from public.cargo_offers
               where cargo_order_id = p_order and (status = 'accepted' or accepted_at is not null)) then
      raise exception 'HAS_ACCEPTED';
    end if;
    if exists (select 1 from public.cargo_offers where cargo_order_id = p_order and status = 'pending') then
      raise exception 'ORDER_ACTIVE_OFFERS';
    end if;
    select coalesce(array_agg(id), array[]::uuid[]) into v_offer_refs
      from public.cargo_offers where cargo_order_id = p_order;

  elsif p_service = 'events' then
    v_fin_service := 'events';
    v_offer_service := 'event_offer';

    select * into v_event from public.event_orders
      where id = p_order and user_id = v_user for update;
    if not found then raise exception 'NOT_ALLOWED'; end if;
    if v_event.status is distinct from 'cancelled' then raise exception 'ORDER_NOT_CANCELLED'; end if;
    perform 1 from public.event_offers where event_order_id = p_order order by id for update;
    if v_event.driver_id is not null then raise exception 'HAS_ACCEPTED'; end if;
    if exists (select 1 from public.event_offers
               where event_order_id = p_order
                 and (status = 'accepted' or accepted_at is not null or commission is not null or completed_at is not null)) then
      raise exception 'HAS_ACCEPTED';
    end if;
    if exists (select 1 from public.event_offers where event_order_id = p_order and status = 'pending') then
      raise exception 'ORDER_ACTIVE_OFFERS';
    end if;
    select coalesce(array_agg(id), array[]::uuid[]) into v_offer_refs
      from public.event_offers where event_order_id = p_order;

  elsif p_service = 'contracts' then
    v_fin_service := 'contracts';
    v_offer_service := 'contract_offer';

    select * into v_contract from public.contract_orders
      where id = p_order and user_id = v_user for update;
    if not found then raise exception 'NOT_ALLOWED'; end if;
    if v_contract.status is distinct from 'cancelled' then raise exception 'ORDER_NOT_CANCELLED'; end if;
    perform 1 from public.contract_offers where contract_order_id = p_order order by id for update;
    if v_contract.driver_id is not null then raise exception 'HAS_ACCEPTED'; end if;
    if exists (select 1 from public.contract_offers
               where contract_order_id = p_order
                 and (status = 'accepted' or accepted_at is not null or ended_at is not null
                      or commission is not null or coalesce(commission_total, 0) <> 0
                      or coalesce(months_charged, 0) > 0)) then
      raise exception 'HAS_ACCEPTED';
    end if;
    if exists (select 1 from public.contract_offers where contract_order_id = p_order and status = 'pending') then
      raise exception 'ORDER_ACTIVE_OFFERS';
    end if;
    select coalesce(array_agg(id), array[]::uuid[]) into v_offer_refs
      from public.contract_offers where contract_order_id = p_order;

  else
    raise exception 'BAD_SERVICE';
  end if;

  -- Keep the parent and any child offer IDs available to every service ledger/history guard.
  v_order_refs := array_append(v_offer_refs, p_order);
  if exists (select 1 from public.wallet_transactions
             where service in (v_fin_service, v_offer_service) and ref_id = any(v_order_refs))
     or exists (select 1 from public.wallet_payments
                where service in (v_fin_service, v_offer_service) and ref_id = any(v_order_refs)) then
    raise exception 'HAS_FINANCIAL_HISTORY';
  end if;
  if exists (select 1 from public.incentive_volume
             where service in (v_fin_service, v_offer_service) and ref_id = any(v_order_refs))
     or exists (select 1 from public.loyalty_events
                where service in (v_fin_service, v_offer_service) and ref_id = any(v_order_refs))
     or exists (select 1 from public.provider_reviews
                where service in (v_fin_service, v_offer_service) and ref_id = any(v_order_refs))
     or exists (select 1 from public.live_shares
                where service in (v_fin_service, v_offer_service) and ref_id = any(v_order_refs))
     or exists (select 1 from public.sos_cases
                where service in (v_fin_service, v_offer_service) and ref_id = any(v_order_refs))
     or exists (select 1 from public.taxi_driver_cancels
                where service in (v_fin_service, v_offer_service) and ref_id = any(v_order_refs))
     or exists (select 1 from public.service_ratings r
                where r.order_id in (select ref::text from unnest(v_order_refs) as refs(ref))) then
    raise exception 'HAS_ORDER_HISTORY';
  end if;

  if p_service = 'cargo' then
    delete from public.cargo_orders where id = p_order and customer_id = v_user and status = 'cancelled';
  elsif p_service = 'events' then
    delete from public.event_orders where id = p_order and user_id = v_user and status = 'cancelled';
  else
    delete from public.contract_orders where id = p_order and user_id = v_user and status = 'cancelled';
  end if;
  if not found then raise exception 'ORDER_NOT_CANCELLED'; end if;
end;
$$;

revoke all on function public.delete_my_cancelled_order(text, uuid) from public, anon;
grant execute on function public.delete_my_cancelled_order(text, uuid) to authenticated;
