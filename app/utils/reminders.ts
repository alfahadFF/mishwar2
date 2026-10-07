import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { bookingTabs, WorkTab } from './work';

// تذكير بمواعيد «حجوزاتي» قبل 24 ساعة وقبل ساعة.
// تنبيه محلي على الجهاز: يرنّ في وقته حتى لو كان التطبيق مغلقاً، دون جدولة على الخادم.
const KEY = 'booking_reminder_ids';
const MIN_GAP = 10 * 60 * 1000;
let lastSync = 0;

type Item = { tab: WorkTab; title: string; at: Date };

const atOf = (d?: string | null, time?: string | null) => {
  if (!d) return null;
  const x = new Date(time ? `${String(d).slice(0, 10)}T${String(time).slice(0, 5)}:00` : d);
  return isNaN(x.getTime()) ? null : x;
};

async function collect(tabs: WorkTab[]): Promise<Item[]> {
  const out: Item[] = [];
  const add = (tab: WorkTab, title: string, at: Date | null) => { if (at) out.push({ tab, title, at }); };
  const jobs = await Promise.all(tabs.map(async tab => {
    if (tab === 'shared') return { tab, rows: (await supabase.rpc('driver_my_shared_trips')).data };
    if (tab === 'airport') return { tab, rows: (await supabase.rpc('driver_airport_jobs')).data };
    if (tab === 'events') return { tab, rows: (await supabase.rpc('driver_event_jobs')).data };
    if (tab === 'contracts') return { tab, rows: (await supabase.rpc('driver_contract_jobs')).data };
    if (tab === 'cargo') return { tab, rows: (await supabase.rpc('carrier_my_cargo_jobs')).data };
    return { tab, rows: (await supabase.rpc('my_rental_listings')).data };
  }));
  for (const { tab, rows } of jobs) for (const r of ((rows || []) as any[])) {
    if (tab === 'shared' && !r.started_at) add(tab, 'رحلة مشتركة', atOf(r.departure_time));
    if (tab === 'airport' && r.status === 'accepted') add(tab, 'موعد مطار', atOf(r.trip_at));
    if (tab === 'events' && !r.completed_at) add(tab, 'موعد مناسبة', atOf(r.gathering_time));
    if (tab === 'contracts' && r.active) add(tab, 'بدء عقد', atOf(r.start_date, r.departure_time));
    if (tab === 'cargo' && r.status === 'accepted' && r.timing_type === 'scheduled') add(tab, 'موعد نقل', atOf(r.scheduled_date, r.scheduled_time));
    if (tab === 'rental' && r.status === 'rented' && r.booking) add(tab, 'تسليم سيارة مؤجرة', atOf(r.booking.start_at));
  }
  return out;
}

export async function syncBookingReminders(profile: any, force = false) {
  try {
    if (Platform.OS === 'web') return;
    if (!force && Date.now() - lastSync < MIN_GAP) return;
    lastSync = Date.now();
    const tabs = bookingTabs(profile);
    const old: string[] = JSON.parse((await AsyncStorage.getItem(KEY)) || '[]');
    await Promise.all(old.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    if (!tabs.length) { await AsyncStorage.setItem(KEY, '[]'); return; }
    const items = await collect(tabs);
    const now = Date.now(), ids: string[] = [];
    for (const it of items) {
      for (const [ms, when] of [[24 * 3600e3, 'بعد 24 ساعة'], [3600e3, 'بعد ساعة']] as const) {
        const date = new Date(it.at.getTime() - ms);
        if (date.getTime() <= now + 30e3) continue;
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: 'تذكير بموعد', body: `${it.title} ${when}`, sound: 'default', data: { kind: 'booking_reminder', tab: it.tab } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'default' },
        });
        ids.push(id);
      }
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  } catch { /* التذكير ميزة مساعدة: لا نوقف الشاشة بسبب خطئه */ }
}
