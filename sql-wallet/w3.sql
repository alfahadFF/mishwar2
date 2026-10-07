-- المحفظة العامة (3 من 6): بطاقات الشحن
create table if not exists public.topup_cards (
  code text primary key,                 -- 14 رقماً
  amount numeric(12,2) not null check (amount > 0),
  batch text,
  status text not null default 'new' check (status in ('new','used','disabled')),
  used_by uuid references auth.users(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.topup_attempts (
  id bigserial primary key,
  user_id uuid not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_topup_attempts_user on public.topup_attempts(user_id, created_at desc);
alter table public.topup_cards enable row level security;     -- بلا سياسات: لا أحد يقرأ البطاقات مباشرة
alter table public.topup_attempts enable row level security;

-- المدير: إنشاء دفعة بطاقات (من SQL Editor أو حساب إداري)
drop function if exists public.admin_create_topup_cards(numeric, int, text);
create or replace function public.admin_create_topup_cards(p_amount numeric, p_count int, p_batch text default null)
returns table(code text, amount numeric) language plpgsql security definer set search_path = public as $$
declare v text; i int := 0;
begin
  if auth.uid() is not null and not exists (
       select 1 from profiles where id = auth.uid() and (account_type = 'admin' or type = 'admin')) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_amount is null or p_amount <= 0 or p_count is null or p_count < 1 or p_count > 1000 then raise exception 'BAD_AMOUNT'; end if;
  while i < p_count loop
    v := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint) % 100000000000000)::text, 14, '0');
    begin
      insert into topup_cards(code, amount, batch) values (v, p_amount, p_batch);
      i := i + 1; code := v; amount := p_amount; return next;
    exception when unique_violation then null;
    end;
  end loop;
end; $$;

-- المستخدم: شحن ببطاقة. 5 محاولات خاطئة خلال ساعة = إيقاف مؤقت
drop function if exists public.redeem_topup_card(text);
create or replace function public.redeem_topup_card(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c topup_cards; v_code text; v_before numeric; v_after numeric;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if (select count(*) from topup_attempts where user_id = auth.uid() and not ok and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;
  v_code := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  select * into c from topup_cards where code = v_code for update;
  if c.code is null or c.status = 'disabled' then
    insert into topup_attempts(user_id, ok) values (auth.uid(), false);
    return jsonb_build_object('error', 'CARD_INVALID');
  end if;
  if c.status = 'used' then
    insert into topup_attempts(user_id, ok) values (auth.uid(), false);
    return jsonb_build_object('error', 'CARD_USED');
  end if;
  update topup_cards set status = 'used', used_by = auth.uid(), used_at = now() where code = c.code;
  insert into topup_attempts(user_id, ok) values (auth.uid(), true);
  insert into wallets(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select balance into v_before from wallets where user_id = auth.uid() for update;
  update wallets set balance = balance + c.amount, updated_at = now() where user_id = auth.uid() returning balance into v_after;
  insert into wallet_transactions(user_id, kind, amount, balance_after, debt_paid, note)
  values (auth.uid(), 'card_topup', c.amount, v_after, least(greatest(-v_before, 0), c.amount), 'بطاقة ••' || right(c.code, 4));
  return jsonb_build_object('amount', c.amount, 'balance', v_after, 'debt_paid', least(greatest(-v_before, 0), c.amount));
end; $$;

revoke all on function public.admin_create_topup_cards(numeric, int, text) from public, anon;
grant execute on function public.admin_create_topup_cards(numeric, int, text) to authenticated;
grant execute on function public.redeem_topup_card(text) to authenticated;
