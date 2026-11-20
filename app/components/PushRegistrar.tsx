import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { registerPush, unregisterPush, routeForNotification } from '../utils/push';

// تسجيل الموبايل للإشعارات + فتح الشاشة المناسبة عند الضغط على الإشعار
export default function PushRegistrar() {
  const router = useRouter();
  useEffect(() => {
    let disposed = false;
    let inFlight: Promise<string | null> | null = null;
    const syncPush = (forceRefresh = false) => {
      if (inFlight) return inFlight;
      const task = (async () => {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!session?.user) return null;
        return registerPush(forceRefresh);
      })().catch(error => {
        console.warn('[push] session lookup failed', error);
        return null;
      });
      inFlight = task;
      task.finally(() => { if (inFlight === task) inFlight = null; }).catch(() => {});
      return task;
    };

    void syncPush();
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        void unregisterPush();
      } else if (session?.user && ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
        // Defer auth work until Supabase has returned from its auth-state callback.
        setTimeout(() => { if (!disposed) void syncPush(event === 'TOKEN_REFRESHED'); }, 0);
      }
    });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active' && !disposed) void syncPush();
    });
    const pushToken = Platform.OS === 'web' ? null : Notifications.addPushTokenListener(() => {
      if (!disposed) void syncPush(true);
    });
    const open = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      const to = routeForNotification(r.notification.request.content.data);
      setTimeout(() => router.push(to as any), 300);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const response = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      disposed = true;
      auth.subscription.unsubscribe();
      appState.remove();
      pushToken?.remove();
      response.remove();
    };
  }, []);
  return null;
}
