-- الإشعارات (5 من 7): عرض جديد للزبون + قبول العرض لمقدم الخدمة
create or replace function public._notify_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_svc text := tg_argv[0]; v_order uuid; v_customer uuid; v_label text;
begin
  v_order := case v_svc when 'cargo' then (to_jsonb(new)->>'cargo_order_id')::uuid
                        when 'events' then (to_jsonb(new)->>'event_order_id')::uuid
                        else (to_jsonb(new)->>'contract_order_id')::uuid end;
  v_label := case v_svc when 'cargo' then 'طلب النقل' when 'events' then 'طلب المناسبة' else 'طلب العقد' end;
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_customer := case v_svc when 'cargo' then (select customer_id from cargo_orders where id = v_order)
                             when 'events' then (select user_id from event_orders where id = v_order)
                             else (select user_id from contract_orders where id = v_order) end;
    if v_customer is not null then
      insert into user_notifications(user_id, kind, title, body, data)
      values (v_customer, 'offer_new', '📨 عرض جديد على ' || v_label, 'السعر: $' || new.offered_price,
              jsonb_build_object('service', v_svc, 'order_id', v_order));
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into user_notifications(user_id, kind, title, body, data)
    values (new.driver_id, 'offer_accepted', '✅ قبل الزبون عرضك', v_label || ' — افتح التطبيق للاطلاع على التفاصيل',
            jsonb_build_object('service', v_svc, 'order_id', v_order));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_cargo_offer on public.cargo_offers;
create trigger trg_notify_cargo_offer after insert or update of status on public.cargo_offers
  for each row execute function public._notify_offer('cargo');
drop trigger if exists trg_notify_event_offer on public.event_offers;
create trigger trg_notify_event_offer after insert or update of status on public.event_offers
  for each row execute function public._notify_offer('events');
drop trigger if exists trg_notify_contract_offer on public.contract_offers;
create trigger trg_notify_contract_offer after insert or update of status on public.contract_offers
  for each row execute function public._notify_offer('contracts');

-- ناقل قبل طلب النقل بالسعر المحدد مباشرة → إشعار للزبون
create or replace function public._notify_cargo_direct()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.carrier_id is null and new.carrier_id is not null and new.accepted_via = 'direct' then
    insert into user_notifications(user_id, kind, title, body, data)
    values (new.customer_id, 'cargo_accepted', '✅ ناقل قبل طلب النقل', 'افتح التطبيق للاطلاع على بيانات الناقل',
            jsonb_build_object('service', 'cargo', 'order_id', new.id));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_cargo_direct on public.cargo_orders;
create trigger trg_notify_cargo_direct after update of carrier_id on public.cargo_orders
  for each row execute function public._notify_cargo_direct();
