import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { registerPush, unregisterPush, routeForNotification } from '../utils/push';

// تسجيل الموبايل للإشعارات + فتح الشاشة المناسبة عند الضغط على الإشعار
export default function PushRegistrar() {
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) registerPush(); });
    const { data: auth } = supabase.auth.onAuthStateChange((e, session) => {
      if (e === 'SIGNED_IN' && session?.user) registerPush();
      if (e === 'SIGNED_OUT') unregisterPush();
    });
    const open = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      const to = routeForNotification(r.notification.request.content.data);
      setTimeout(() => router.push(to as any), 300);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => { auth.subscription.unsubscribe(); sub.remove(); };
  }, []);
  return null;
}
