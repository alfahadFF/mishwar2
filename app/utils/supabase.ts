import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { guestBlocked } from './guest';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhaW5rYnZscnVvZWJmZ251emVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMjUxMTcsImV4cCI6MjEwNTcwMTExN30.8x6U8XCcjQcrO1Ld9devWFQFPgCpxStmLgL11DB0Tv0';
const extra: any = (Constants.expoConfig as any)?.extra || {};
export const supabase = createClient(
  extra.supabaseUrl || 'https://vainkbvlruoebfgnuzea.supabase.co',
  extra.supabaseAnonKey || ANON,
  {
    // حفظ الجلسة على الجهاز كي يبقى المستخدم مسجّلاً بعد إغلاق التطبيق
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// عميل مؤقت بلا حفظ جلسة: لإنشاء حساب عمل برقم آخر دون الخروج من الحساب الحالي
export function makeTempClient() {
  return createClient(
    extra.supabaseUrl || 'https://vainkbvlruoebfgnuzea.supabase.co',
    extra.supabaseAnonKey || ANON,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mishwar-temp' } }
  );
}

// ===== وضع الضيف =====
// الضيف يتصفح فقط: أي عملية تنفيذية (طلب، حجز، نشر، تحويل...) بدون جلسة
// تُوقف قبل إرسالها، ويظهر تنبيه «يجب تسجيل الدخول أولاً» مع فتح شاشة الدخول.
const ACTION_RPC = new Set([
  'sos_start', 'sos_end', 'save_sos_settings', 'create_trip_share',
  'wallet_transfer', 'wallet_find_user', 'set_wallet_pin', 'redeem_topup_card', 'pay_from_wallet', 'redeem_points',
  'submit_rating', 'skip_rating', 'set_new_orders_push', 'settle_all_my_dues', 'rental_settle_my_dues',
  'request_shared_join', 'passenger_cancel_join', 'passenger_answer_counter',
  'driver_respond_join', 'driver_cancel_shared_trip', 'driver_accept_taxi', 'driver_cancel_taxi', 'customer_cancel_taxi',
  'save_rental_listing', 'rental_listing_action', 'rental_request_listing', 'rental_choose_offer',
  'accept_event_offer', 'reject_event_offer', 'cancel_event_order', 'driver_send_event_offer', 'driver_withdraw_event_offer', 'driver_complete_event',
  'accept_contract_offer', 'reject_contract_offer', 'cancel_contract_order', 'end_contract_offer', 'driver_send_contract_offer', 'driver_withdraw_contract_offer',
  'accept_cargo_offer', 'cancel_cargo_order', 'edit_cargo_order', 'carrier_send_cargo_offer', 'carrier_withdraw_cargo_offer', 'carrier_accept_cargo', 'carrier_complete_cargo',
  'apply_invite_code', 'save_work_profile', 'set_work_intent', 'save_office_profile', 'set_rental_service',
  'save_travel_driver_profile', 'set_travel_service', 'travel_create_listing', 'travel_listing_action',
  'travel_post_request', 'travel_cancel_request', 'travel_send_offer', 'travel_choose_offer', 'travel_book_listing',
  'create_airport_order', 'edit_airport_order', 'cancel_airport_order', 'accept_airport_offer', 'reject_airport_offer',
  'driver_send_airport_offer', 'driver_withdraw_airport_offer', 'driver_complete_airport',
]);

export const AUTH_REQUIRED = 'AUTH_REQUIRED';

export async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

// للاستخدام المباشر في الشاشات قبل أي عملية: يعيد false ويفتح شاشة الدخول للضيف
export async function requireAuth(): Promise<boolean> {
  if (await hasSession()) return true;
  guestBlocked();
  return false;
}

function gate<B extends { then: any }>(b: B): B {
  const orig = b.then.bind(b);
  (b as any).then = (ok?: any, bad?: any) =>
    hasSession().then(has => {
      if (has) return orig(ok, bad);
      guestBlocked();
      const res = { data: null, error: { message: AUTH_REQUIRED, code: AUTH_REQUIRED, details: '', hint: '' }, count: null, status: 401, statusText: AUTH_REQUIRED };
      return Promise.resolve(res).then(ok, bad);
    }, bad);
  return b;
}

const rawRpc = supabase.rpc.bind(supabase);
(supabase as any).rpc = (fn: string, ...args: any[]) => {
  const b = (rawRpc as any)(fn, ...args);
  return ACTION_RPC.has(fn) ? gate(b) : b;
};

const rawFrom = supabase.from.bind(supabase);
(supabase as any).from = (table: string) => {
  const q: any = rawFrom(table);
  for (const m of ['insert', 'update', 'upsert', 'delete']) {
    const f = q[m].bind(q);
    q[m] = (...a: any[]) => gate(f(...a));
  }
  return q;
};
