-- السائق والناقل (2 من 5): إيقاف الطلبات عند عدم التحقق أو انتهاء الرخصة
-- التحقق خلال 30 يوماً من التسجيل، والرخصة المنتهية تُقبل حتى 3 أشهر بعد تاريخ انتهائها
create or replace function public._work_block_reason(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.work_registered_at is null then null
    when p.work_verified_at is null and p.work_registered_at < now() - interval '30 days' then 'verify'
    when p.license_expiry is not null and p.license_expiry + interval '3 months' < current_date then 'license'
  end
  from profiles p where p.id = p_user;
$$;
revoke execute on function public._work_block_reason(uuid) from public, anon, authenticated;

-- كل لوحات الطلبات تستخدم هذه الدالة: الرصيد السالب أو إيقاف العمل يخفي الطلبات
create or replace function public.wallet_blocked(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select balance < 0 from wallets where user_id = p_user), false)
      or public._work_block_reason(p_user) is not null;
$$;

-- العقود: السائق الذي اختار «لا» لا تصله طلباتها (الحسابات القديمة بلا جواب تبقى كما هي)
create or replace function public._ct_can_serve(p_item text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(p.svc_contracts, true) and
                          case when p_item = 'car' then p.event_vehicle_type = 'car'
                               else p_item in ('van_8','van_11','bus_small_14','bus_mid_18','bus_mid_21','bus_mid_27','bus_large_50')
                                and p.event_vehicle_type in ('van_8','van_11','bus_small_14','bus_mid_18','bus_mid_21','bus_mid_27','bus_large_50') end
                     from profiles p where p.id = p_user), false);
$$;
revoke all on function public._ct_can_serve(text, uuid) from public, anon, authenticated;
