-- الأمان والطوارئ (2 من 9): المواقع المباشرة + بيانات الشخص
create table if not exists public.live_positions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.live_positions enable row level security;
-- بدون سياسات: الوصول عبر الدوال فقط

-- هل عند المستخدم خدمة شغّالة كسائق أو ناقل (يعني لازم يُعرف موقعه)
create or replace function public._live_duty(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from taxi_orders where driver_id = p_uid and status in ('accepted','arrived','in_progress'))
      or exists (select 1 from taxi_shared_trips where driver_id = p_uid and started_at is not null
                   and status not in ('completed','cancelled'))
      or exists (select 1 from cargo_orders where carrier_id = p_uid and status in ('accepted','in_progress'))
      or exists (select 1 from event_offers where driver_id = p_uid and status = 'accepted' and completed_at is null)
      or exists (select 1 from contract_offers where driver_id = p_uid and status = 'accepted' and ended_at is null);
$$;

create or replace function public._live_pos(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('lat', lat, 'lng', lng, 'at', updated_at) from live_positions where user_id = p_uid;
$$;

create or replace function public._person_json(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', full_name, 'phone', phone, 'model', vehicle_model,
                            'color', vehicle_color, 'plate', vehicle_plate)
    from profiles where id = p_uid;
$$;

-- دوال داخلية: ممنوع استدعاؤها مباشرة من التطبيق
revoke execute on function public._live_duty(uuid) from public, anon, authenticated;
revoke execute on function public._live_pos(uuid) from public, anon, authenticated;
revoke execute on function public._person_json(uuid) from public, anon, authenticated;
