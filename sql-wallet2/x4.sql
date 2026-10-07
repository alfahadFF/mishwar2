-- أمان المحفظة (4 من 4): إشعارات استلام التحويل والدفعات
create or replace function public._amt(p numeric)
returns text language sql immutable as $$ select rtrim(rtrim(round(coalesce(p, 0), 2)::text, '0'), '.') $$;
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_user_notifications_user on public.user_notifications(user_id, created_at desc);
alter table public.user_notifications enable row level security;
drop policy if exists "notifications_select_own" on public.user_notifications;
create policy "notifications_select_own" on public.user_notifications for select using (auth.uid() = user_id);

create or replace function public._wallet_tx_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_who text;
begin
  if new.kind not in ('transfer_in','payment_in','adjustment','card_topup') then return new; end if;
  select public._short_name(full_name) into v_who from profiles where id = new.counterparty;
  insert into user_notifications(user_id, kind, title, body, data)
  values (new.user_id, new.kind,
    case new.kind when 'transfer_in' then 'وصلك تحويل' when 'payment_in' then 'وصلتك دفعة'
                  when 'card_topup' then 'تم شحن رصيدك' else 'تسوية من الإدارة' end,
    case new.kind
      when 'transfer_in' then public._amt(new.amount) || ' من ' || coalesce(v_who, 'مستخدم') || coalesce(' • ' || new.note, '')
      when 'payment_in' then public._amt(new.amount) || ' عن ' || coalesce(new.note, 'خدمة') || ' من ' || coalesce(v_who, 'زبون')
      when 'card_topup' then 'أُضيف ' || public._amt(new.amount) || ' إلى رصيدك'
      else public._amt(new.amount) || coalesce(' • ' || new.note, '') end,
    jsonb_build_object('tx_id', new.id, 'amount', new.amount, 'balance_after', new.balance_after));
  return new;
end; $$;
drop trigger if exists trg_wallet_tx_notify on public.wallet_transactions;
create trigger trg_wallet_tx_notify after insert on public.wallet_transactions
  for each row execute function public._wallet_tx_notify();

drop function if exists public.my_notifications(int);
create or replace function public.my_notifications(p_limit int default 30)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(n) - 'user_id' from user_notifications n
   where n.user_id = auth.uid() order by n.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

drop function if exists public.mark_notifications_read();
create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update user_notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- البث الفوري للإشعارات
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notifications') then
    execute 'alter publication supabase_realtime add table public.user_notifications';
  end if;
end $$;

grant execute on function public.my_notifications(int) to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;

select 'دوال الأمان والإدارة' as الفحص,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in
         ('set_wallet_pin','admin_reset_wallet_pin','wallet_transfer','pay_from_wallet','my_wallet','admin_find_user',
          'admin_wallet_adjust','admin_disable_topup_card','admin_topup_batches','admin_wallet_report',
          'my_notifications','mark_notifications_read'))::text || ' من 12' as النتيجة
union all
select 'حد التحويل اليومي', (select value from public.app_settings where key = 'wallet_daily_transfer_limit')
union all
select 'الدوال القديمة بدون رمز',
       case when to_regprocedure('public.wallet_transfer(text,numeric,text)') is null
             and to_regprocedure('public.pay_from_wallet(text,uuid,integer)') is null then 'محذوفة' else 'ما زالت موجودة' end
union all
select 'الإشعارات الفورية',
       case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'user_notifications')
            then 'مفعّلة' else 'غير مفعّلة' end;
