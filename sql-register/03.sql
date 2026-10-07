-- التسجيل (3 من 4): حماية الملف الشخصي
-- المستخدم يعدّل اسمه وصورته فقط، وباقي البيانات تتغير عبر دوال التطبيق أو الإدارة
create or replace function public._profiles_guard()
returns trigger language plpgsql set search_path = public as $$
declare v profiles;
begin
  if current_user not in ('authenticated', 'anon') or public._is_admin() then return new; end if;
  v := old;
  v.full_name := nullif(btrim(new.full_name), '');
  v.avatar_url := new.avatar_url;
  v.updated_at := now();
  return v;
end;
$$;
drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public._profiles_guard();
drop trigger if exists trg_protect_vehicle_fields on public.profiles;

-- الملف الشخصي ينشأ تلقائياً عند التسجيل، فلا داعي لإنشائه من التطبيق
drop policy if exists "Users can insert own profile" on public.profiles;
