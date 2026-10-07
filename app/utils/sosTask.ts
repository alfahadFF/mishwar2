import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

// إرسال الموقع وقت الطوارئ فقط — يستمر حتى لو الشاشة مقفولة أو التطبيق بالخلفية
export const SOS_TASK = 'mishwar-sos-location';
if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask(SOS_TASK, async ({ data, error }: any) => {
      if (error) return;
      const locs = data?.locations || [];
      const l = locs[locs.length - 1];
      if (!l) return;
      try {
        const { data: r } = await supabase.rpc('live_ping', { p_lat: l.coords.latitude, p_lng: l.coords.longitude });
        if (r && !(r as any).sos) await stopSosTracking();
      } catch {}
    });
  } catch {}
}

export async function startSosTracking(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;
    if (await Location.hasStartedLocationUpdatesAsync(SOS_TASK)) return true;
    await Location.startLocationUpdatesAsync(SOS_TASK, {
      accuracy: Location.Accuracy.High, timeInterval: 20000, distanceInterval: 20,
      showsBackgroundLocationIndicator: true, pausesUpdatesAutomatically: false,
      foregroundService: { notificationTitle: '🆘 مشاركة الموقع مفعّلة', notificationBody: 'يُرسل موقعك حتى تضغط «أنا بخير»', notificationColor: '#dc2626' },
    });
    return true;
  } catch { return false; }
}

export async function stopSosTracking() {
  if (Platform.OS === 'web') return;
  try { if (await Location.hasStartedLocationUpdatesAsync(SOS_TASK)) await Location.stopLocationUpdatesAsync(SOS_TASK); } catch {}
}
