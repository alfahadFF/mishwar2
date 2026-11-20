import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// إشعارات قاعدة البيانات كلها تظهر كتنبيه نظامي حتى والتطبيق مفتوح، مع تشغيل صوت القناة.
export const DEFAULT_NOTIFICATION_CHANNEL_ID = 'mishwar_notifications_v3';
export const TAXI_NOTIFICATION_CHANNEL_ID = 'taxi_orders_v3';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let lastToken: string | null = null;
let lastTokenUserId: string | null = null;

export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;
  // IDs جديدة تتجاوز إعدادات القنوات القديمة التي قد يكون أندرويد قد حفظها صامتة.
  await Notifications.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID, {
    name: 'مشوار — الإشعارات', description: 'تنبيهات مشوار العامة',
    importance: Notifications.AndroidImportance.HIGH, sound: 'default',
    vibrationPattern: [0, 250, 120, 250], enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(TAXI_NOTIFICATION_CHANNEL_ID, {
    name: 'طلبات التكسي الجديدة', description: 'طلبات التكسي الجديدة القريبة',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'taxi_order.wav', vibrationPattern: [0, 400, 200, 400, 200, 400],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// يسجل رمز الجهاز بعد نجاح الإذن؛ الأخطاء تُسجّل حتى لا يبدو أن التسجيل نجح بصمت.
export async function registerPush(forceRefresh = false): Promise<string | null> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return null;
    await setupNotificationChannels();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session?.user) return null;

    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      });
    }
    if (!permission.granted) {
      console.warn('[push] notification permission is not granted');
      return null;
    }
    if (!forceRefresh && lastToken && lastTokenUserId === session.user.id) return lastToken;

    const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) throw new Error('Expo EAS projectId is missing');
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (lastToken && lastToken !== token && lastTokenUserId === session.user.id) {
      const { error } = await supabase.rpc('unregister_push_token', { p_token: lastToken });
      if (error) console.warn('[push] old token cleanup failed', error);
    }
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    lastToken = token;
    lastTokenUserId = session.user.id;
    return token;
  } catch (error) {
    console.warn('[push] registration failed', error);
    return null;
  }
}

export async function unregisterPush() {
  const token = lastToken;
  lastToken = null;
  lastTokenUserId = null;
  if (!token) return;
  try {
    const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
    if (error) console.warn('[push] token removal failed', error);
  } catch (error) {
    console.warn('[push] token removal failed', error);
  }
}

// وين بياخدك الضغط على الإشعار
const PROVIDER_BY_SERVICE: Record<string, string> = { cargo: '/bookings?tab=cargo', events: '/bookings?tab=events', contracts: '/bookings?tab=contracts', airport: '/bookings?tab=airport' };
export function routeForNotification(data: any): string {
  const k = data?.kind || '';
  if (k === 'booking_reminder') return `/bookings${data?.tab ? `?tab=${data.tab}` : ''}`;
  if (k === 'taxi_new' || k === 'taxi_unsuspended') return '/driver';
  if (k.startsWith('taxi_')) return '/taxi';
  if (k === 'shared_join') return data?.role === 'driver' ? '/driver' : '/taxi-shared';
  if (k.startsWith('shared_')) return '/taxi-shared';
  if (k === 'cargo_new') return '/work?tab=cargo';
  if (k === 'event_new') return '/work?tab=events';
  if (k === 'contract_new') return '/work?tab=contracts';
  if (k.startsWith('travel_')) {
    if (k === 'travel_request' || k === 'travel_accepted' || k === 'travel_booking') return `/travel-provider?tab=${k === 'travel_request' ? 'requests' : k === 'travel_booking' ? 'bookings' : 'offers'}`;
    return '/travel?tab=mine';
  }
  if (k === 'rental_general_new' || k === 'rental_request' || k === 'rental_chosen') return '/work?tab=rental';
  if (k.startsWith('rental_')) return '/rental';
  if (k === 'offer_accepted') return PROVIDER_BY_SERVICE[data?.service] || '/';
  if (k === 'offer_new' && data?.service === 'airport') return '/my-orders?tab=airport';
  if (k === 'offer_new' || k === 'cargo_accepted' || k === 'rating') return '/my-orders';
  if (k === 'admin') {
    const ak = data?.admin_kind || '';
    if (ak === 'work_new' || ak === 'work_updated') return '/admin?tab=verify';
    if (ak.startsWith('driver_')) return '/admin?tab=cancels';
    return '/admin?tab=notifs';
  }
  if (k === 'account') return '/';
  if (k === 'airport_new') return '/work?tab=airport';
  if (k === 'airport_edited') return '/bookings?tab=airport';
  if (k === 'loyalty') return '/loyalty';
  if (k === 'reward') return '/incentives';
  if (k === 'wallet_negative' || k === 'transfer_in' || k === 'payment_in' || k === 'card_topup' || k === 'commission') return '/wallet';
  return '/';
}
