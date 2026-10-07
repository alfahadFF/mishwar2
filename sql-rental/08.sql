-- التأجير (8 من 11): الزبون يختار موافقة من طلبه العام
create or replace function public.rental_choose_offer(p_offer uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o rental_general_offers; g rental_general; l rental_listings; v_id uuid; v_res jsonb;
begin
  select * into o from rental_general_offers where id = p_offer for update;
  select * into g from rental_general where id = o.general_id for update;
  if g.id is null or g.customer_id is distinct from auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if g.status <> 'open' or o.status <> 'pending' then raise exception 'OFFER_NOT_AVAILABLE'; end if;
  select * into l from rental_listings where id = o.listing_id;
  if l.status <> 'active' or public.wallet_blocked(o.provider_id) then
    update rental_general_offers set status = 'cancelled' where id = o.id;
    raise exception 'RENTAL_NOT_AVAILABLE';
  end if;
  insert into rental_requests(listing_id, customer_id, provider_id, general_id, unit, unit_count, start_at, unit_price, total)
  values (l.id, g.customer_id, o.provider_id, g.id, g.unit, g.unit_count, greatest(g.start_at, now()), g.unit_price,
          round(g.unit_price * g.unit_count, 2))
  returning id into v_id;
  v_res := public._rental_book(v_id);
  update rental_general_offers set status = 'chosen' where id = o.id;
  update rental_general_offers set status = 'cancelled' where general_id = g.id and id <> o.id and status = 'pending';
  update rental_general set status = 'done' where id = g.id;
  insert into user_notifications(user_id, kind, title, body, data)
  values (o.provider_id, 'rental_chosen', 'تم اختيار سيارتك', l.brand_model || ' • ' || public._amt(round(g.unit_price * g.unit_count, 2)),
          jsonb_build_object('request_id', v_id));
  return v_res || jsonb_build_object('request_id', v_id);
end; $$;
grant execute on function public.rental_choose_offer(uuid) to authenticated;
