-- الرحلة المشتركة (2 من 22): إصلاح: الرحلة الممتلئة لا تمنع الإنهاء أو الإلغاء
-- القديم كان يعيد الحالة إلى full حتى عند الإنهاء أو الإلغاء
create or replace function public.check_taxi_shared_full() returns trigger language plpgsql as $$
begin
  if new.status = 'pending' and new.available_seats = 0 then new.status := 'full'; end if;
  return new;
end; $$;
