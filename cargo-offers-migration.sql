-- ============================================
-- تعديل نظام النقل: ميزانية ثابتة / طلب عرض سعر + جدول العروض
-- المشروع: vainkbvlruoebfgnuzea.supabase.co
-- شغّل هذا الملف كامل في Supabase > SQL Editor > Run
-- ============================================

-- 1) إضافة نوع الميزانية لجدول cargo_orders
ALTER TABLE public.cargo_orders ADD COLUMN IF NOT EXISTS budget_type TEXT CHECK (budget_type IN ('fixed','quote')) DEFAULT 'fixed';

-- تأكد أن الميزانية يمكن أن تكون NULL عند طلب عرض سعر
-- (الأعمدة budget_from/to أصلاً nullable، لا حاجة لتعديل)

-- تحديث الطلبات القديمة: إذا لا يوجد ميزانية → quote، وإلا fixed
UPDATE public.cargo_orders
SET budget_type = CASE WHEN budget_from IS NULL AND budget_to IS NULL AND client_budget_usd IS NULL AND client_budget_usd = 0 THEN 'quote' ELSE 'fixed' END
WHERE budget_type IS NULL;

-- 2) إنشاء جدول عروض السائقين
CREATE TABLE IF NOT EXISTS public.cargo_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_order_id UUID NOT NULL REFERENCES public.cargo_orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  offered_price NUMERIC(10,2) NOT NULL CHECK (offered_price > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','SYP')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (cargo_order_id, driver_id) -- سائق واحد = عرض واحد لكل طلب
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_cargo_offers_order ON public.cargo_offers(cargo_order_id, status);
CREATE INDEX IF NOT EXISTS idx_cargo_offers_driver ON public.cargo_offers(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_cargo_offers_created ON public.cargo_offers(created_at DESC);

-- تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_cargo_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cargo_offers_updated_at ON public.cargo_offers;
CREATE TRIGGER trg_cargo_offers_updated_at
  BEFORE UPDATE ON public.cargo_offers
  FOR EACH ROW EXECUTE FUNCTION update_cargo_offers_updated_at();

-- 3) RLS
ALTER TABLE public.cargo_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offers_select_all" ON public.cargo_offers;
DROP POLICY IF EXISTS "offers_insert_driver" ON public.cargo_offers;
DROP POLICY IF EXISTS "offers_update_own" ON public.cargo_offers;
DROP POLICY IF EXISTS "offers_update_client" ON public.cargo_offers;

-- الجميع يرى العروض (للعميل والسائقين)
CREATE POLICY "offers_select_all" ON public.cargo_offers
  FOR SELECT USING (true);

-- السائق ينشئ عرضاً لنفسه فقط
CREATE POLICY "offers_insert_driver" ON public.cargo_offers
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

-- السائق يعدّل عرضه فقط (سحب العرض)
CREATE POLICY "offers_update_own" ON public.cargo_offers
  FOR UPDATE USING (auth.uid() = driver_id);

-- العميل يقبل/يرفض عروض طلبه (عبر function لاحقاً، نسمح مبدئياً)
-- سنعتمد على Edge Function أو سياسة إضافية تتحقق أن العميل هو صاحب الطلب
-- للآن: السماح للعميل بتحديث حالة العروض لطلبه
CREATE POLICY "offers_update_client" ON public.cargo_offers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.cargo_orders WHERE id = cargo_order_id AND customer_id = auth.uid())
  );

-- 4) دالة قبول العرض (تُخفي الطلب عن البقية)
CREATE OR REPLACE FUNCTION public.accept_cargo_offer(p_offer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_order_id UUID;
  v_client_id UUID;
BEGIN
  -- تحقق أن المتصل هو صاحب الطلب
  SELECT cargo_order_id INTO v_order_id FROM public.cargo_offers WHERE id = p_offer_id;
  SELECT customer_id INTO v_client_id FROM public.cargo_orders WHERE id = v_order_id;
  IF v_client_id != auth.uid() THEN
    RAISE EXCEPTION 'غير مصرح - لست صاحب الطلب';
  END IF;

  -- اقبل العرض المختار وارفض الباقي
  UPDATE public.cargo_offers SET status = 'accepted', accepted_at = now() WHERE id = p_offer_id;
  UPDATE public.cargo_offers SET status = 'rejected' WHERE cargo_order_id = v_order_id AND id != p_offer_id AND status = 'pending';

  -- أغلق الطلب (يختفي عن السائقين)
  UPDATE public.cargo_orders SET status = 'accepted', updated_at = now() WHERE id = v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) دالة قبول مباشر (بدون عرض - للميزانية الثابتة)
CREATE OR REPLACE FUNCTION public.accept_cargo_direct(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.cargo_orders WHERE id = p_order_id;
  IF v_status != 'open' THEN
    RAISE EXCEPTION 'الطلب غير متاح';
  END IF;
  -- السائق هو من يستدعيها، نربط carrier_id
  UPDATE public.cargo_orders SET status = 'accepted', carrier_id = auth.uid(), updated_at = now() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6) تحقق
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='cargo_orders' AND column_name='budget_type';
SELECT table_name FROM information_schema.tables WHERE table_name='cargo_offers';
