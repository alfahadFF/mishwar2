-- ============================================
-- 1) إنشاء جداول التكسي الأساسية - 6 جداول
-- المشروع: vainkbvlruoebfgnuzea
-- شغّل هذا الملف كامل في Supabase > SQL Editor > Run
-- ============================================

-- 1. أنواع المركبات (الأسعار)
CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- economy, comfort, luxury, van, electric, bike
  name_ar TEXT NOT NULL, -- اقتصادية، مريحة...
  base_fare DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  per_km_rate DECIMAL(10,2) NOT NULL DEFAULT 1.50,
  per_minute_rate DECIMAL(10,2) NOT NULL DEFAULT 0.50,
  minimum_fare DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  surge_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00 CHECK (surge_multiplier >= 1.00 AND surge_multiplier <= 3.00),
  icon TEXT, -- اسم الأيقونة
  fuel_type TEXT DEFAULT 'petrol' CHECK (fuel_type IN ('petrol','diesel','electric','hybrid')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. طلبات التكسي اللحظية (قبل وبعد القبول)
CREATE TABLE IF NOT EXISTS public.taxi_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- الانطلاق
  pickup_latitude DECIMAL(10,7) NOT NULL,
  pickup_longitude DECIMAL(10,7) NOT NULL,
  pickup_address TEXT NOT NULL,
  -- الوصول
  destination_latitude DECIMAL(10,7) NOT NULL,
  destination_longitude DECIMAL(10,7) NOT NULL,
  destination_address TEXT NOT NULL,
  -- التسعير
  vehicle_type TEXT NOT NULL REFERENCES public.vehicle_types(name),
  estimated_price DECIMAL(10,2),
  estimated_distance DECIMAL(10,2), -- كم
  estimated_duration INTEGER, -- دقائق
  actual_price DECIMAL(10,2),
  -- الحالة
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','accepted','arriving','in_progress','completed','cancelled_by_customer','cancelled_by_driver','expired')),
  cancel_reason TEXT,
  customer_notes TEXT,
  -- أوقات
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_taxi_requests_customer ON public.taxi_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_taxi_requests_driver ON public.taxi_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_taxi_requests_status ON public.taxi_requests(status);
CREATE INDEX IF NOT EXISTS idx_taxi_requests_created ON public.taxi_requests(created_at DESC);

-- 3. مواقع السائقين الحية (تحديث كل 5 ثواني)
CREATE TABLE IF NOT EXISTS public.driver_locations (
  driver_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  heading DECIMAL(5,2) DEFAULT 0 CHECK (heading >= 0 AND heading < 360),
  speed DECIMAL(5,2) DEFAULT 0,
  accuracy DECIMAL(6,2),
  is_available BOOLEAN NOT NULL DEFAULT false,
  is_online BOOLEAN NOT NULL DEFAULT false,
  vehicle_type TEXT REFERENCES public.vehicle_types(name),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_locations_online ON public.driver_locations(is_online, is_available) WHERE is_online = true AND is_available = true;
CREATE INDEX IF NOT EXISTS idx_driver_locations_coords ON public.driver_locations(latitude, longitude);

-- 4. مناداة السائقين (إرسال الطلب لأقرب 5)
CREATE TABLE IF NOT EXISTS public.driver_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  taxi_request_id UUID NOT NULL REFERENCES public.taxi_requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),
  distance_km DECIMAL(6,2), -- بعد السائق عن الزبون وقت الإرسال
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '45 seconds'),
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_driver ON public.driver_notifications(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_driver_notifications_request ON public.driver_notifications(taxi_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_notification ON public.driver_notifications(driver_id, taxi_request_id);

-- 5. مركبات السائقين
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plate_number TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  color TEXT NOT NULL,
  year INTEGER CHECK (year >= 2000 AND year <= 2030),
  vehicle_type TEXT NOT NULL REFERENCES public.vehicle_types(name),
  fuel_type TEXT DEFAULT 'petrol' CHECK (fuel_type IN ('petrol','diesel','electric','hybrid')),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON public.vehicles(driver_id);

-- 6. إعدادات التسعير (مدينة واحدة أو أكثر)
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL DEFAULT 'Dubai',
  base_fare DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  per_km_rate DECIMAL(10,2) NOT NULL DEFAULT 1.50,
  per_minute_rate DECIMAL(10,2) NOT NULL DEFAULT 0.50,
  minimum_fare DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 15.00 CHECK (commission_rate >= 0 AND commission_rate <= 50),
  surge_max DECIMAL(4,2) NOT NULL DEFAULT 3.00,
  search_radius_km INTEGER NOT NULL DEFAULT 20,
  trip_timeout_sec INTEGER NOT NULL DEFAULT 300,
  currency TEXT NOT NULL DEFAULT 'AED',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- بيانات أولية: 6 أنواع مركبات
INSERT INTO public.vehicle_types (name, name_ar, base_fare, per_km_rate, per_minute_rate, minimum_fare, surge_multiplier, fuel_type) VALUES
  ('economy', 'اقتصادية', 10.00, 1.50, 0.50, 10.00, 1.00, 'petrol'),
  ('comfort', 'مريحة', 15.00, 2.00, 0.60, 15.00, 1.00, 'petrol'),
  ('luxury', 'فاخرة', 25.00, 3.50, 1.00, 25.00, 1.00, 'petrol'),
  ('van', 'فان', 20.00, 2.50, 0.70, 20.00, 1.00, 'diesel'),
  ('electric', 'كهربائية', 18.00, 2.20, 0.60, 18.00, 1.00, 'electric'),
  ('bike', 'دراجة نارية', 5.00, 1.00, 0.25, 5.00, 1.00, 'petrol')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.pricing_config (city, base_fare, per_km_rate, per_minute_rate, minimum_fare, commission_rate, surge_max, search_radius_km, trip_timeout_sec, currency) VALUES
  ('Dubai', 10.00, 1.50, 0.50, 10.00, 15.00, 3.00, 20, 300, 'AED')
ON CONFLICT DO NOTHING;

-- دوال تحديث updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vehicle_types_updated ON public.vehicle_types;
CREATE TRIGGER trg_vehicle_types_updated BEFORE UPDATE ON public.vehicle_types FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_taxi_requests_updated ON public.taxi_requests;
CREATE TRIGGER trg_taxi_requests_updated BEFORE UPDATE ON public.taxi_requests FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_vehicles_updated ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_pricing_config_updated ON public.pricing_config;
CREATE TRIGGER trg_pricing_config_updated BEFORE UPDATE ON public.pricing_config FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
