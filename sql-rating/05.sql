-- التقييم (5 من 7): الزبون — تقييماتي المعلّقة + إرسال + تخطّي
create or replace function public.my_pending_ratings()
returns setof jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform public._rating_contract_tick();
  return query
    select jsonb_build_object('id', r.id, 'service', r.service, 'period', r.period, 'due_at', r.due_at,
             'expires_at', r.expires_at, 'provider_name', p.full_name)
      from provider_reviews r left join profiles p on p.id = r.provider_id
     where r.customer_id = auth.uid() and r.status = 'pending' and r.expires_at > now()
     order by r.due_at desc limit 5;
end; $$;
grant execute on function public.my_pending_ratings() to authenticated;

create or replace function public.submit_rating(p_id uuid, p_stars int, p_tags text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tags text[];
begin
  select coalesce(array_agg(distinct t), '{}') into v_tags from unnest(coalesce(p_tags, '{}')) t where t = any(public._rating_tags());
  if p_stars is not null and (p_stars < 1 or p_stars > 5) then raise exception 'RATING_BAD'; end if;
  if p_stars is null and cardinality(v_tags) = 0 then raise exception 'RATING_EMPTY'; end if;
  update provider_reviews set status = 'done', stars = p_stars, tags = v_tags, rated_at = now()
   where id = p_id and customer_id = auth.uid() and status = 'pending' and expires_at > now();
  if not found then raise exception 'RATING_CLOSED'; end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.submit_rating(uuid, int, text[]) to authenticated;

create or replace function public.skip_rating(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update provider_reviews set status = 'skipped' where id = p_id and customer_id = auth.uid() and status = 'pending';
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.skip_rating(uuid) to authenticated;
