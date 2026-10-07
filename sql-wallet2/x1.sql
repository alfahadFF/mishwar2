-- أمان المحفظة (1 من 4): الرمز السري + حد التحويل اليومي
create table if not exists public.wallet_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text,
  pin_salt text,
  failed int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.wallet_security enable row level security;   -- بلا سياسات: الوصول عبر الدوال فقط

insert into public.app_settings(key, value) values ('wallet_daily_transfer_limit', '1000') on conflict (key) do nothing;

-- المدير: من SQL Editor أو حساب إداري
create or replace function public._is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or exists (select 1 from profiles where id = auth.uid() and (account_type = 'admin' or type = 'admin'));
$$;

create or replace function public._pin_hash(p_user uuid, p_pin text, p_salt text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p_user::text || ':' || p_pin || ':' || p_salt, 'UTF8')), 'hex');
$$;
revoke all on function public._pin_hash(uuid, text, text) from public, anon, authenticated;

-- التحقق من الرمز: يُرجع null عند النجاح، أو رمز الخطأ. 5 محاولات خاطئة = إيقاف 15 دقيقة
create or replace function public._pin_verify(p_user uuid, p_pin text)
returns text language plpgsql security definer set search_path = public as $$
declare s wallet_security;
begin
  select * into s from wallet_security where user_id = p_user for update;
  if s.user_id is null or s.pin_hash is null then return 'PIN_REQUIRED'; end if;
  if s.locked_until is not null and s.locked_until > now() then return 'PIN_LOCKED'; end if;
  if nullif(btrim(coalesce(p_pin, '')), '') is null then return 'PIN_ENTER'; end if;   -- بلا رمز: لا تُحسب محاولة
  if coalesce(p_pin, '') !~ '^\d{4}$' or public._pin_hash(p_user, p_pin, s.pin_salt) <> s.pin_hash then
    update wallet_security set failed = failed + 1,
           locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' end, updated_at = now()
     where user_id = p_user;
    return case when s.failed + 1 >= 5 then 'PIN_LOCKED' else 'PIN_WRONG' end;
  end if;
  update wallet_security set failed = 0, locked_until = null where user_id = p_user and (failed > 0 or locked_until is not null);
  return null;
end; $$;
revoke all on function public._pin_verify(uuid, text) from public, anon, authenticated;

-- إنشاء الرمز أو تغييره (التغيير يتطلب الرمز الحالي)
drop function if exists public.set_wallet_pin(text, text);
create or replace function public.set_wallet_pin(p_new text, p_old text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_err text; v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  if coalesce(p_new, '') !~ '^\d{4}$' then raise exception 'PIN_FORMAT'; end if;
  if p_new in ('0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321') then raise exception 'PIN_WEAK'; end if;
  if exists (select 1 from wallet_security where user_id = auth.uid() and pin_hash is not null) then
    v_err := public._pin_verify(auth.uid(), p_old);
    if v_err is not null then return jsonb_build_object('error', v_err); end if;
  end if;
  insert into wallet_security(user_id, pin_hash, pin_salt, failed, locked_until, updated_at)
  values (auth.uid(), public._pin_hash(auth.uid(), p_new, v_salt), v_salt, 0, null, now())
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt,
       failed = 0, locked_until = null, updated_at = now();
  return jsonb_build_object('ok', true);
end; $$;

-- المدير: إعادة تعيين الرمز لمستخدم نسي رمزه
drop function if exists public.admin_reset_wallet_pin(uuid);
create or replace function public.admin_reset_wallet_pin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update wallet_security set pin_hash = null, pin_salt = null, failed = 0, locked_until = null, updated_at = now() where user_id = p_user;
end; $$;

-- مجموع التحويلات اليوم (بتوقيت دمشق)
create or replace function public._transferred_today(p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(-amount), 0) from wallet_transactions
   where user_id = p_user and kind = 'transfer_out'
     and (created_at at time zone 'Asia/Damascus')::date = (now() at time zone 'Asia/Damascus')::date;
$$;

grant execute on function public._is_admin() to authenticated;
grant execute on function public.set_wallet_pin(text, text) to authenticated;
grant execute on function public.admin_reset_wallet_pin(uuid) to authenticated;
