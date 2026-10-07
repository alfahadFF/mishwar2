-- الحوافز (1 من 7): مستوى مقدم الخدمة حسب آخر 100 تقييم
create or replace function public._provider_level_of(p_n bigint, p_avg numeric)
returns text language sql immutable as $$
  select case
    when p_n >= 100 and p_avg >= 4.8 then 'diamond'
    when p_n >= 50 and p_avg >= 4.6 then 'gold'
    when p_n >= 20 and p_avg >= 4.3 then 'silver'
    else 'bronze' end;
$$;

-- المتوسط على آخر 100 تقييم + العدد الكلي + المستوى
create or replace function public._provider_rating(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with last100 as (
    select stars from provider_reviews
     where provider_id = p_uid and status = 'done' and stars is not null
     order by rated_at desc limit 100),
  t as (
    select count(*) n from provider_reviews
     where provider_id = p_uid and status = 'done' and stars is not null),
  a as (select round(avg(stars)::numeric, 1) av from last100)
  select jsonb_build_object('avg', a.av, 'n', t.n, 'level', public._provider_level_of(t.n, a.av))
    from t, a;
$$;
revoke execute on function public._provider_rating(uuid) from public, anon, authenticated;

create or replace function public._provider_level(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select public._provider_rating(p_uid)->>'level';
$$;
revoke execute on function public._provider_level(uuid) from public, anon, authenticated;

-- زيادة المستوى على المكافأة (%) + تأخير ظهور طلب التكسي (ثواني)
create or replace function public._level_bonus(p_level text)
returns int language sql immutable as $$
  select case p_level when 'diamond' then 10 when 'gold' then 5 when 'silver' then 2 else 0 end;
$$;

create or replace function public._level_delay(p_level text)
returns int language sql immutable as $$
  select case p_level when 'diamond' then 0 when 'gold' then 3 when 'silver' then 6 else 9 end;
$$;
