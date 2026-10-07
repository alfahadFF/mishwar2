-- ============================================
-- 2) سياسات الحماية RLS للجداول الستة
-- شغّل هذا الملف بعد ملف الجداول مباشرة
-- كل السياسات قراءة/كتابة عبر auth.uid() فقط — anon ما بيقدر يشوف شي لحاله
-- ============================================

-- تفعيل RLS
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxi_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- تنظيف سياسات قديمة (إذا أعدت التشغيل)
DROP POLICY IF EXISTS "vehicle_types_select_all" ON public.vehicle_types;
DROP POLICY IF EXISTS "vehicle_types_no_insert_anon" ON public.vehicle_types;
DROP POLICY IF EXISTS "taxi_requests_insert_own" ON public.taxi_requests;
DROP POLICY IF EXISTS "taxi_requests_select_own_or_pending" ON public.taxi_requests;
DROP POLICY IF EXISTS "taxi_requests_update_own" ON public.taxi_requests;
DROP POLICY IF EXISTS "driver_locations_select_available" ON public.driver_locations;
DROP POLICY IF EXISTS "driver_locations_upsert_own" ON public.driver_locations;
DROP POLICY IF EXISTS "driver_notifications_select_own" ON public.driver_notifications;
DROP POLICY IF EXISTS "driver_notifications_update_own" ON public.driver_notifications;
DROP POLICY IF EXISTS "driver_notifications_insert_system" ON public.driver_notifications;
DROP POLICY IF EXISTS "vehicles_select_verified_or_own" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_insert_own" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_update_own" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_delete_own" ON public.vehicles;
DROP POLICY IF EXISTS "pricing_config_select_all" ON public.pricing_config;

-- 1) vehicle_types: الكل يقرأ، الكتابة للأدمن فقط (service_role)
CREATE POLICY "vehicle_types_select_all"
  ON public.vehicle_types FOR SELECT
  USING (is_active = true);

-- 2) taxi_requests
-- الزبون ينشئ طلبه فقط (customer_id = auth.uid())
CREATE POLICY "taxi_requests_insert_own"
  ON public.taxi_requests FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- الزبون يشوف طلباته، السائق يشوف طلباته أو الطلبات المعلقة (pending/matched)
CREATE POLICY "taxi_requests_select_own_or_pending"
  ON public.taxi_requests FOR SELECT
  USING (
    auth.uid() = customer_id
    OR auth.uid() = driver_id
    OR status IN ('pending','matched')
  );

-- الزبون أو السائق المرتبط يحدّث
CREATE POLICY "taxi_requests_update_own"
  ON public.taxi_requests FOR UPDATE
  USING (auth.uid() = customer_id OR auth.uid() = driver_id)
  WITH CHECK (auth.uid() = customer_id OR auth.uid() = driver_id);

-- 3) driver_locations
-- الكل يشوف السائقين المتاحين فقط
CREATE POLICY "driver_locations_select_available"
  ON public.driver_locations FOR SELECT
  USING (is_online = true AND is_available = true);

-- السائق يحدّث موقعه فقط
CREATE POLICY "driver_locations_upsert_own"
  ON public.driver_locations FOR ALL
  USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

-- 4) driver_notifications
-- السائق يشوف تنبيهاته فقط
CREATE POLICY "driver_notifications_select_own"
  ON public.driver_notifications FOR SELECT
  USING (auth.uid() = driver_id);

-- السائق يحدّث حالته (قبل/رفض)
CREATE POLICY "driver_notifications_update_own"
  ON public.driver_notifications FOR UPDATE
  USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

-- النظام/الزبون ينشئ تنبيه (يجب أن يكون الطلب له)
CREATE POLICY "driver_notifications_insert_system"
  ON public.driver_notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.taxi_requests tr
      WHERE tr.id = taxi_request_id
      AND tr.customer_id = auth.uid()
    )
  );

-- 5) vehicles
CREATE POLICY "vehicles_select_verified_or_own"
  ON public.vehicles FOR SELECT
  USING (is_verified = true OR auth.uid() = driver_id);

CREATE POLICY "vehicles_insert_own"
  ON public.vehicles FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "vehicles_update_own"
  ON public.vehicles FOR UPDATE
  USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "vehicles_delete_own"
  ON public.vehicles FOR DELETE
  USING (auth.uid() = driver_id);

-- 6) pricing_config: الكل يقرأ، الكتابة للأدمن فقط
CREATE POLICY "pricing_config_select_all"
  ON public.pricing_config FOR SELECT
  USING (is_active = true);

-- (اختياري) السماح للـ Realtime
-- شغّل هذا إذا بدك التتبع اللحظي يشتغل:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.taxi_requests;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_notifications;

-- ============================================
-- 3) إصلاح جدول wallets الحالي (اختياري لكن مهم)
-- الحالي فيه بس user_id + updated_at — ناقص balance
-- شغّل هذا فقط إذا بدك تصلحه:
-- ============================================
-- ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();
-- ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS balance DECIMAL(12,2) NOT NULL DEFAULT 0.00;
-- ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'AED';
-- ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_wallets_user ON public.wallets(user_id);
