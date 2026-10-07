-- المحفظة العامة (2 من 6): معرّف المحفظة لكل مستخدم (8 أرقام)
alter table public.profiles add column if not exists wallet_id text;
create unique index if not exists uq_profiles_wallet_id on public.profiles(wallet_id);

create or replace function public._new_wallet_id()
returns text language plpgsql volatile set search_path = public as $$
declare v text;
begin
  loop
    v := (10000000 + floor(random() * 90000000))::bigint::text;
    exit when not exists (select 1 from profiles where wallet_id = v);
  end loop;
  return v;
end; $$;

create or replace function public._profiles_wallet_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.wallet_id is null then new.wallet_id := public._new_wallet_id(); end if;
  elsif new.wallet_id is distinct from old.wallet_id and auth.uid() is not null then
    new.wallet_id := old.wallet_id;   -- المعرّف ثابت لا يغيّره المستخدم
  end if;
  return new;
end; $$;
drop trigger if exists trg_profiles_wallet_id on public.profiles;
create trigger trg_profiles_wallet_id before insert or update on public.profiles
  for each row execute function public._profiles_wallet_id();

update public.profiles set wallet_id = public._new_wallet_id() where wallet_id is null;
