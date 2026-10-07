-- مكتب التأجير (1 من 3): الحقول وحفظ نموذج المكتب
alter table public.profiles add column if not exists office_name text;
alter table public.profiles add column if not exists office_manager text;
alter table public.profiles add column if not exists office_city text;
alter table public.profiles add column if not exists office_lat double precision;
alter table public.profiles add column if not exists office_lng double precision;
alter table public.profiles add column if not exists cr_number text;          -- رقم السجل التجاري
alter table public.profiles add column if not exists cr_photo_path text;      -- صورة السجل (خاصة)
alter table public.profiles add column if not exists svc_rental boolean;      -- السائق يؤجّر بدون سائق

-- اسم المكتب يُحفظ أيضاً كاسم الحساب، فيظهر للزبون بعد القبول ودفع العمولة
create or replace function public.save_office_profile(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pr profiles; v_first boolean;
begin
  if me is null then raise exception 'NOT_AUTH'; end if;
  select * into pr from profiles where id = me;
  if pr.type::text not in ('personal', 'business') then raise exception 'WORK_TYPE_CHANGE'; end if;
  if coalesce(btrim(p->>'office_name'), '') = '' then raise exception 'OFFICE_NAME'; end if;
  if coalesce(btrim(p->>'manager'), '') = '' then raise exception 'OFFICE_MANAGER'; end if;
  if coalesce(btrim(p->>'city'), '') = '' then raise exception 'OFFICE_CITY'; end if;
  if nullif(p->>'lat', '') is null or nullif(p->>'lng', '') is null then raise exception 'OFFICE_LOCATION'; end if;
  if coalesce(btrim(p->>'cr_number'), '') = '' then raise exception 'OFFICE_CR'; end if;

  v_first := pr.work_registered_at is null;
  update profiles set
    type = 'business'::user_type,
    full_name = btrim(p->>'office_name'), office_name = btrim(p->>'office_name'), office_manager = btrim(p->>'manager'),
    office_city = btrim(p->>'city'), office_lat = (p->>'lat')::float8, office_lng = (p->>'lng')::float8,
    cr_number = btrim(p->>'cr_number'), cr_photo_path = coalesce(nullif(p->>'cr_photo', ''), cr_photo_path),
    work_role = null, work_registered_at = coalesce(work_registered_at, now()), updated_at = now()
  where id = me;

  if v_first then
    insert into user_notifications(user_id, kind, title, body, data)
    values (me, 'verify', 'تم تفعيل حساب المكتب',
            'يمكنك إضافة مركباتك واستقبال الطلبات الآن. يجب استكمال التحقق من بيانات المكتب خلال 30 يوماً، وإلا تتوقف الطلبات.', '{}'::jsonb);
  end if;
  return jsonb_build_object('ok', true);
end; $$;
revoke execute on function public.save_office_profile(jsonb) from public, anon;
grant execute on function public.save_office_profile(jsonb) to authenticated;
