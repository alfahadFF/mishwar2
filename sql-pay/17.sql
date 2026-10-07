-- الدفع وإنهاء التكسي (17 من 39): إشعار الحركات (بدون اسم راكب التكسي)
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
      when 'payment_in' then public._amt(new.amount) || ' عن ' || coalesce(new.note, 'خدمة')
           || case when new.service = 'taxi' then '' else ' من ' || coalesce(v_who, 'زبون') end
      when 'card_topup' then 'أُضيف ' || public._amt(new.amount) || ' إلى رصيدك'
      else public._amt(new.amount) || coalesce(' • ' || new.note, '') end,
    jsonb_build_object('tx_id', new.id, 'amount', new.amount, 'balance_after', new.balance_after));
  return new;
end; $$;
drop trigger if exists trg_wallet_tx_notify on public.wallet_transactions;
create trigger trg_wallet_tx_notify after insert on public.wallet_transactions
  for each row execute function public._wallet_tx_notify();
