-- المحفظة العامة (1 من 6): توحيد جدول الحركات مع الجدول القديم + أنواع الحركات
-- الأعمدة التي تستخدمها دوال العمولة والمحفظة
alter table public.wallet_transactions add column if not exists kind text;
alter table public.wallet_transactions add column if not exists amount numeric(12,2);
alter table public.wallet_transactions add column if not exists balance_after numeric(12,2);
alter table public.wallet_transactions add column if not exists debt_paid numeric(12,2) not null default 0;
alter table public.wallet_transactions add column if not exists service text;
alter table public.wallet_transactions add column if not exists ref_id uuid;
alter table public.wallet_transactions add column if not exists gross_amount numeric(12,2);
alter table public.wallet_transactions add column if not exists note text;
alter table public.wallet_transactions add column if not exists is_trial boolean not null default false;
alter table public.wallet_transactions alter column created_at set default now();

-- الأعمدة القديمة الإلزامية تصبح اختيارية (الجدولان wallets و wallet_transactions)
do $$ declare r record; begin
  for r in select table_name, column_name from information_schema.columns
            where table_schema = 'public' and table_name in ('wallet_transactions','wallets')
              and is_nullable = 'NO' and column_default is null
              and column_name not in ('id','user_id','kind','amount','balance_after','balance','debt_paid','is_trial','currency','created_at','updated_at') loop
    execute format('alter table public.%I alter column %I drop not null', r.table_name, r.column_name);
  end loop;
end $$;
alter table public.wallets alter column id set default gen_random_uuid();
alter table public.wallet_transactions alter column id set default gen_random_uuid();

-- تعبئة الأعمدة القديمة تلقائياً (type و amount_syp) للتوافق
create or replace function public._wallet_tx_legacy()
returns trigger language plpgsql as $$
begin
  if to_jsonb(new) ? 'type' and new.kind is not null then
    new := jsonb_populate_record(new, jsonb_build_object('type', coalesce(to_jsonb(new)->>'type', new.kind)));
  end if;
  if to_jsonb(new) ? 'amount_syp' and new.amount is not null then
    new := jsonb_populate_record(new, jsonb_build_object('amount_syp', coalesce((to_jsonb(new)->>'amount_syp')::numeric, round(new.amount))));
  end if;
  return new;
end; $$;
drop trigger if exists trg_wallet_tx_legacy on public.wallet_transactions;
create trigger trg_wallet_tx_legacy before insert on public.wallet_transactions
  for each row execute function public._wallet_tx_legacy();

do $$ declare r record; begin
  for r in select conname from pg_constraint
            where conrelid = 'public.wallet_transactions'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.wallet_transactions drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('topup','card_topup','commission','adjustment','payment_out','payment_in','transfer_out','transfer_in'));
alter table public.wallet_transactions add column if not exists counterparty uuid;
alter table public.wallet_transactions add column if not exists discount numeric(12,2);

-- نسبة خصم الدفع من التطبيق (من حصة التطبيق). 0 = بدون خصم حتى تُحدَّد
insert into public.app_settings(key, value) values ('wallet_pay_discount_pct', '0') on conflict (key) do nothing;
