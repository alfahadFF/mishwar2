-- الأمان والطوارئ (1 من 9): نمرة السيارة + إعدادات زر الطوارئ
alter table public.profiles add column if not exists vehicle_plate text;

create table if not exists public.sos_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family jsonb not null default '[]'::jsonb,          -- [{name, phone}] بحد أقصى رقمين
  emergency_phone text not null default '112',
  updated_at timestamptz not null default now()
);
alter table public.sos_settings enable row level security;
-- بدون سياسات: الوصول عبر الدالتين فقط

create or replace function public.my_sos_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('family', family, 'emergency_phone', emergency_phone)
                     from sos_settings where user_id = auth.uid()),
                  jsonb_build_object('family', '[]'::jsonb, 'emergency_phone', '112'));
$$;
grant execute on function public.my_sos_settings() to authenticated;

create or replace function public.save_sos_settings(p_family jsonb, p_emergency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_family jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTH'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(trim(x->>'name'), ''), 'phone', trim(x->>'phone'))), '[]'::jsonb)
    into v_family
    from jsonb_array_elements(coalesce(p_family, '[]'::jsonb)) x
   where coalesce(trim(x->>'phone'), '') <> '';
  if jsonb_array_length(v_family) > 2 then raise exception 'SOS_MAX_TWO'; end if;
  if coalesce(trim(p_emergency), '') = '' then raise exception 'SOS_NO_EMERGENCY'; end if;
  insert into sos_settings(user_id, family, emergency_phone, updated_at)
  values (auth.uid(), v_family, trim(p_emergency), now())
  on conflict (user_id) do update set family = excluded.family, emergency_phone = excluded.emergency_phone, updated_at = now();
  return public.my_sos_settings();
end; $$;
grant execute on function public.save_sos_settings(jsonb, text) to authenticated;
