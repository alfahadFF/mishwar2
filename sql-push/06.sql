-- الإشعارات (6 من 7): الرحلة المشتركة (طلبات الانضمام والردود) + الرصيد السالب
create or replace function public._notify_shared_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_driver uuid; v_to uuid; v_title text; v_body text := 'افتح التطبيق للاطلاع على التفاصيل';
begin
  select driver_id into v_driver from taxi_shared_trips where id = new.trip_id;
  if tg_op = 'INSERT' then
    v_to := v_driver;
    v_title := case new.status when 'confirmed' then '👥 راكب انضم لرحلتك' when 'pending' then '👥 طلب انضمام جديد — بانتظار موافقتك' end;
    v_body := new.seats_requested || ' مقعد';
  elsif new.status is distinct from old.status then
    if new.status in ('confirmed', 'rejected', 'counter') and old.status = 'pending' then
      v_to := new.passenger_id;
      v_title := case new.status when 'confirmed' then '✅ السائق وافق على انضمامك' when 'rejected' then '❌ السائق رفض طلب الانضمام'
                                 else '💵 طلب السائق مبلغاً إضافياً' end;
      if new.status = 'counter' then v_body := 'المبلغ الإضافي: $' || new.extra_fee || ' — يمكنك الموافقة أو الرفض'; end if;
    elsif old.status = 'counter' and new.status in ('confirmed', 'declined_by_passenger') then
      v_to := v_driver;
      v_title := case new.status when 'confirmed' then '✅ الراكب وافق على المبلغ الإضافي' else '❌ الراكب رفض المبلغ الإضافي' end;
    elsif new.status = 'cancelled' and old.status in ('pending', 'counter') then
      v_to := v_driver; v_title := '↩️ الراكب ألغى طلب الانضمام';
    end if;
  end if;
  if v_to is not null and v_title is not null then
    insert into user_notifications(user_id, kind, title, body, data)
    values (v_to, 'shared_join', v_title, v_body, jsonb_build_object('trip_id', new.trip_id, 'request_id', new.id,
                        'role', case when v_to = v_driver then 'driver' else 'passenger' end));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_shared_join on public.taxi_shared_requests;
create trigger trg_notify_shared_join after insert or update of status on public.taxi_shared_requests
  for each row execute function public._notify_shared_join();

create or replace function public._notify_wallet_negative()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(old.balance, 0) >= 0 and new.balance < 0 then
    insert into user_notifications(user_id, kind, title, body, data)
    values (new.user_id, 'wallet_negative', '⚠️ أصبح رصيدك سالباً',
            'عليك $' || abs(new.balance) || ' — الطلبات الجديدة متوقفة حتى تشحن رصيدك', '{}'::jsonb);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_wallet_negative on public.wallets;
create trigger trg_notify_wallet_negative after update of balance on public.wallets
  for each row execute function public._notify_wallet_negative();
