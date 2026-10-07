-- ============================================
-- إصلاح جدول النقل cargo_orders - إضافة الحقول الجديدة
-- المشروع: vainkbvlruoebfgnuzea.supabase.co
-- شغّل هذا الملف كامل في Supabase > SQL Editor > Run
-- ============================================

-- 1) التأكد من وجود الجدول (إذا لم يكن موجوداً أنشئه)
CREATE TABLE IF NOT EXISTS public.cargo_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','accepted','in_progress','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- 2) إضافة الأعمدة الأساسية للنقل (إذا لم تكن موجودة)
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS cargo_type TEXT;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS weight TEXT;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS pickup_points JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS dropoff_points JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS timing_type TEXT DEFAULT 'urgent' CHECK (timing_type IN ('urgent','scheduled'));
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS scheduled_time TIME;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS budget_from NUMERIC(10,2);
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS budget_to NUMERIC(10,2);

-- 3) الحقول الجديدة المطلوبة: عمال / معدات / طوابق
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS need_workers BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS workers_count INTEGER CHECK (workers_count >= 1 AND workers_count <= 20);
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS need_equipment BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS equipment_detail TEXT;

ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS lift_up BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS floor_to INTEGER CHECK (floor_to >= 0 AND floor_to <= 50);
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS elevator_to TEXT CHECK (elevator_to IN ('يوجد مصعد','لا يوجد مصعد','مصعد صغير') OR elevator_to IS NULL);

ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS lift_down BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS floor_from INTEGER CHECK (floor_from >= 0 AND floor_from <= 50);
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS elevator_from TEXT CHECK (elevator_from IN ('يوجد مصعد','لا يوجد مصعد','مصعد صغير') OR elevator_from IS NULL);

ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS floor_note TEXT;

-- 4) فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_cargo_orders_customer ON public.cargo_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_cargo_orders_status ON public.cargo_orders(status);
CREATE INDEX IF NOT EXISTS idx_cargo_orders_created ON public.cargo_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cargo_orders_timing ON public.cargo_orders(timing_type);

-- 5) تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_cargo_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cargo_orders_updated_at ON public.cargo_orders;
CREATE TRIGGER trg_cargo_orders_updated_at
  BEFORE UPDATE ON public.cargo_orders
  FOR EACH ROW EXECUTE FUNCTION update_cargo_orders_updated_at();

-- 6) تفعيل RLS وسياسات
ALTER TABLE public.cargo_orders ENABLE ROW LEVEL SECURITY;

-- حذف السياسات القديمة إن وجدت
DROP POLICY IF EXISTS "cargo_select_all" ON public.cargo_orders;
DROP POLICY IF EXISTS "cargo_insert_own" ON public.cargo_orders;
DROP POLICY IF EXISTS "cargo_update_own" ON public.cargo_orders;
DROP POLICY IF EXISTS "cargo_delete_own" ON public.cargo_orders;

-- السماح للجميع بقراءة الطلبات المعلقة (للسائقين)
CREATE POLICY "cargo_select_all" ON public.cargo_orders
  FOR SELECT USING (true);

-- العميل ينشئ طلبه فقط
CREATE POLICY "cargo_insert_own" ON public.cargo_orders
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- العميل والسائق المرتبط يمكنهم التحديث
CREATE POLICY "cargo_update_own" ON public.cargo_orders
  FOR UPDATE USING (auth.uid() = customer_id);

-- العميل يحذف طلبه فقط قبل القبول
CREATE POLICY "cargo_delete_own" ON public.cargo_orders
  FOR DELETE USING (auth.uid() = customer_id AND status = 'pending');

-- 7) مثال إدخال للاختبار (اختياري - علّق عليه إذا لا تريده)
-- INSERT INTO public.cargo_orders (
--   customer_id, cargo_type, weight, pickup_points, dropoff_points,
--   need_workers, workers_count, need_equipment, equipment_detail,
--   lift_up, floor_to, elevator_to, lift_down, floor_from, elevator_from, floor_note,
--   timing_type, budget_from, budget_to, status
-- ) VALUES (
--   auth.uid(), 'مفروشات', '500 كغ',
--   '[{"lat":33.5138,"lng":36.2765,"detail":"غرفة نوم"}]'::jsonb,
--   '[{"lat":33.5200,"lng":36.2800,"detail":"تسليم"}]'::jsonb,
--   true, 2, true, 'رافعة صغيرة',
--   true, 3, 'يوجد مصعد', false, null, null, 'الدرج ضيق',
--   'urgent', 10, 50, 'pending'
-- );

-- 8) التحقق
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'cargo_orders' AND table_schema = 'public'
ORDER BY ordinal_position;
