import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// التطبيق مفتوح: الإشعارات العادية بتطلع Toast داخل التطبيق، فما منكررها.
// بس الطلبات الجديدة لمقدمي الخدمة (ما إلها Toast) بتطلع كإشعار.
const SHOW_IN_APP = ['airport_new', 'cargo_new', 'event_new', 'contract_new', 'rental_general_new', 'booking_reminder'];
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const kind = (n.request.content.data as any)?.kind;
    const show = SHOW_IN_APP.includes(kind);
    return { shouldShowAlert: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

let lastToken: string | null = null;

async function setupChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'الإشعارات', importance: Notifications.AndroidImportance.HIGH, sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('taxi_orders', {
    name: 'طلبات التكسي الجديدة', importance: Notifications.AndroidImportance.MAX,
    sound: 'taxi_order.wav', vibrationPattern: [0, 400, 200, 400, 200, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// بيسجّل رمز الموبايل بـ Supabase. إذا لسا ما في مشروع Expo مربوط (projectId)، بيوقف بهدوء.
export async function registerPush(): Promise<string | null> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return null;
    await setupChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const projectId = (Constants.expoConfig as any)?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    lastToken = token;
    return token;
  } catch {
    return null;
  }
}

export async function unregisterPush() {
  if (!lastToken) return;
  try { await supabase.rpc('unregister_push_token', { p_token: lastToken }); } catch {}
  lastToken = null;
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
