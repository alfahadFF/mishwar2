-- المحفظة العامة (4 من 6): سجل الدفعات + تحويل الرصيد
create table if not exists public.wallet_payments (
  id uuid primary key default gen_random_uuid(),
  service text not null,                 -- cargo / events / contracts ...
  ref_id uuid not null,                  -- الطلب أو عرض المركبة
  period int not null default 1,         -- للعقود الشهرية: رقم الشهر
  payer uuid not null,
  payee uuid not null,
  gross numeric(12,2) not null,          -- السعر المتفق عليه (يستلمه السائق كاملاً)
  discount_pct numeric(5,2) not null default 0,
  discount numeric(12,2) not null default 0,   -- من حصة التطبيق
  paid numeric(12,2) not null,           -- ما دفعه الزبون
  created_at timestamptz not null default now(),
  unique (service, ref_id, period)
);
alter table public.wallet_payments enable row level security;
drop policy if exists "wallet_payments_party" on public.wallet_payments;
create policy "wallet_payments_party" on public.wallet_payments for select using (auth.uid() in (payer, payee));

-- البحث عن مستخدم بالمعرّف (8 أرقام) أو رقم الهاتف
create or replace function public._wallet_lookup(p_query text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g'); r uuid[];
begin
  if length(v) = 8 then
    select array_agg(id) into r from profiles where wallet_id = v;
  elsif length(v) >= 9 then
    select array_agg(id) into r from profiles
     where phone is not null and right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v, 9);
  end if;
  if r is null or array_length(r, 1) <> 1 then return null; end if;
  return r[1];
end; $$;
revoke all on function public._wallet_lookup(text) from public, anon, authenticated;

-- الاسم مختصر للتأكيد قبل التحويل (الاسم الأول + أول حرف من الثاني)
create or replace function public._short_name(p_name text)
returns text language sql immutable as $$
  select case when p_name is null or btrim(p_name) = '' then 'مستخدم'
              when position(' ' in btrim(p_name)) = 0 then btrim(p_name)
              else split_part(btrim(p_name), ' ', 1) || ' ' || left(split_part(btrim(p_name), ' ', 2), 1) || '.' end;
$$;

drop function if exists public.wallet_find_user(text);
create or replace function public.wallet_find_user(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := public._wallet_lookup(p_query); p profiles;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if v is null then raise exception 'USER_NOT_FOUND'; end if;
  if v = auth.uid() then raise exception 'SELF_TRANSFER'; end if;
  select * into p from profiles where id = v;
  return jsonb_build_object('wallet_id', p.wallet_id, 'name', public._short_name(p.full_name));
end; $$;

drop function if exists public.wallet_transfer(text, numeric, text);
create or replace function public.wallet_transfer(p_to text, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_to uuid := public._wallet_lookup(p_to); v_bal numeric; v_from_after numeric; v_to_after numeric; v_amt numeric;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if v_to is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_to = auth.uid() then raise exception 'SELF_TRANSFER'; end if;
  v_amt := round(coalesce(p_amount, 0), 2);
  if v_amt <= 0 then raise exception 'BAD_AMOUNT'; end if;
  insert into wallets(user_id) values (auth.uid()), (v_to) on conflict (user_id) do nothing;
  -- قفل المحفظتين بترتيب ثابت لتجنب التعارض
  perform 1 from wallets where user_id in (auth.uid(), v_to) order by user_id for update;
  select balance into v_bal from wallets where user_id = auth.uid();
  if v_bal < v_amt then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update wallets set balance = balance - v_amt, updated_at = now() where user_id = auth.uid() returning balance into v_from_after;
  update wallets set balance = balance + v_amt, updated_at = now() where user_id = v_to returning balance into v_to_after;
  insert into wallet_transactions(user_id, kind, amount, balance_after, counterparty, note)
  values (auth.uid(), 'transfer_out', -v_amt, v_from_after, v_to, nullif(btrim(coalesce(p_note, '')), '')),
         (v_to, 'transfer_in', v_amt, v_to_after, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''));
  return jsonb_build_object('amount', v_amt, 'balance', v_from_after);
end; $$;

grant execute on function public.wallet_find_user(text) to authenticated;
grant execute on function public.wallet_transfer(text, numeric, text) to authenticated;
