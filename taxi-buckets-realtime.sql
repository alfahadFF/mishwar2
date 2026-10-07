-- ============================================
-- 3) Buckets + Realtime - شغّل هذا الملف كامل في SQL Editor
-- ============================================

-- 1) إنشاء الـ Buckets الأربعة
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('avatars', 'avatars', true),
  ('vehicles', 'vehicles', true),
  ('documents', 'documents', false),
  ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- 2) سياسات الـ Storage (storage.objects)
-- تفعيل RLS (عادة مفعل افتراضياً)
-- نحذف القديمة إذا موجودة
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Auth update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read vehicles" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload vehicles" ON storage.objects;
DROP POLICY IF EXISTS "Private documents" ON storage.objects;
DROP POLICY IF EXISTS "Private receipts" ON storage.objects;

-- avatars: قراءة للكل، كتابة للمستخدم لملفاته فقط (مجلد باسم user_id)
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Auth upload avatars"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth update avatars"
  ON storage.objects FOR UPDATE USING (
    bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Auth delete avatars"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- vehicles: نفس avatars
CREATE POLICY "Public read vehicles"
  ON storage.objects FOR SELECT USING (bucket_id = 'vehicles');

CREATE POLICY "Auth upload vehicles"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'vehicles' AND auth.role() = 'authenticated'
  );

-- documents & receipts: خاص - فقط صاحب الملف
CREATE POLICY "Private documents"
  ON storage.objects FOR ALL USING (
    bucket_id IN ('documents','receipts') 
    AND auth.uid()::text = (storage.foldername(name))[1]
  ) WITH CHECK (
    bucket_id IN ('documents','receipts') 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3) تفعيل Realtime للتتبع اللحظي
-- إذا طلع خطأ "already member" تجاهله - يعني مفعل من قبل
ALTER PUBLICATION supabase_realtime ADD TABLE public.taxi_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_notifications;
-- اختياري: إذا بدك تتبع الرحلات المكتملة أيضاً
ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;

-- 4) تأكيد إنشاء replica identity للـ Realtime (مهم للتحديثات)
ALTER TABLE public.taxi_requests REPLICA IDENTITY FULL;
ALTER TABLE public.driver_locations REPLICA IDENTITY FULL;
ALTER TABLE public.driver_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.trips REPLICA IDENTITY FULL;
