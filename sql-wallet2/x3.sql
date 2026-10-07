-- أمان المحفظة (3 من 4): أدوات المدير (تسوية، بطاقات، تقرير)
-- البحث عن مستخدم
drop function if exists public.admin_find_user(text);
create or replace function public.admin_find_user(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid; p profiles;
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  v := public._wallet_lookup(p_query);
  if v is null then raise exception 'USER_NOT_FOUND'; end if;
  select * into p from profiles where id = v;
  return jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone, 'wallet_id', p.wallet_id,
    'balance', coalesce((select balance from wallets where user_id = v), 0),
    'has_pin', exists (select 1 from wallet_security where user_id = v and pin_hash is not null),
    'last_tx', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
       select kind, amount, note, created_at from wallet_transactions where user_id = v order by created_at desc limit 10) x));
end; $$;

-- تسوية يدوية: موجب = إضافة، سالب = خصم (الملاحظة إلزامية)
drop function if exists public.admin_wallet_adjust(uuid, numeric, text);
create or replace function public.admin_wallet_adjust(p_user uuid, p_amount numeric, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_after numeric; v_amt numeric := round(coalesce(p_amount, 0), 2);
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if v_amt = 0 then raise exception 'BAD_AMOUNT'; end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'NOTE_REQUIRED'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  insert into wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  update wallets set balance = balance + v_amt, updated_at = now() where user_id = p_user returning balance into v_after;
  insert into wallet_transactions(user_id, kind, amount, balance_after, counterparty, note)
  values (p_user, 'adjustment', v_amt, v_after, auth.uid(), btrim(p_note));
  return jsonb_build_object('balance', v_after);
end; $$;

-- تعطيل بطاقة (مفقودة أو مسروقة)
drop function if exists public.admin_disable_topup_card(text);
create or replace function public.admin_disable_topup_card(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c topup_cards;
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  select * into c from topup_cards where code = regexp_replace(coalesce(p_code, ''), '\D', '', 'g') for update;
  if c.code is null then raise exception 'CARD_INVALID'; end if;
  if c.status = 'used' then raise exception 'CARD_USED'; end if;
  update topup_cards set status = 'disabled' where code = c.code;
  return jsonb_build_object('code', c.code, 'amount', c.amount);
end; $$;

-- ملخص البطاقات حسب الدفعة
drop function if exists public.admin_topup_batches();
create or replace function public.admin_topup_batches()
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
  select jsonb_build_object('batch', coalesce(batch, '—'), 'amount', amount, 'total', count(*),
           'used', count(*) filter (where status = 'used'), 'disabled', count(*) filter (where status = 'disabled'),
           'created_at', min(created_at))
    from topup_cards group by batch, amount order by min(created_at) desc limit 50;
end; $$;

-- تقرير المحفظة لفترة (افتراضياً آخر 30 يوماً)
drop function if exists public.admin_wallet_report(date, date);
create or replace function public.admin_wallet_report(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f timestamptz := coalesce(p_from, current_date - 30)::timestamptz; t timestamptz := (coalesce(p_to, current_date) + 1)::timestamptz;
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return (
    select jsonb_build_object(
      'from', f::date, 'to', (t - interval '1 day')::date,
      'commissions', coalesce(-sum(amount) filter (where kind = 'commission'), 0),
      'card_topups', coalesce(sum(amount) filter (where kind in ('card_topup','topup')), 0),
      'payments', coalesce(sum(gross_amount) filter (where kind = 'payment_in'), 0),
      'discounts', coalesce(sum(discount) filter (where kind = 'payment_out'), 0),
      'transfers', coalesce(sum(amount) filter (where kind = 'transfer_in'), 0),
      'adjustments', coalesce(sum(amount) filter (where kind = 'adjustment'), 0),
      'net_revenue', coalesce(-sum(amount) filter (where kind = 'commission'), 0) - coalesce(sum(discount) filter (where kind = 'payment_out'), 0),
      'total_balances', (select coalesce(sum(balance), 0) from wallets),
      'total_debt', (select coalesce(-sum(balance) filter (where balance < 0), 0) from wallets))
    from wallet_transactions where created_at >= f and created_at < t);
end; $$;

grant execute on function public.admin_find_user(text) to authenticated;
grant execute on function public.admin_wallet_adjust(uuid, numeric, text) to authenticated;
grant execute on function public.admin_disable_topup_card(text) to authenticated;
grant execute on function public.admin_topup_batches() to authenticated;
grant execute on function public.admin_wallet_report(date, date) to authenticated;
