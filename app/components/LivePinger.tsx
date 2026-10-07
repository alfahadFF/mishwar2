import { useEffect } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../utils/supabase';
import { getFreshLocation } from '../utils/location';

// يرسل موقع المستخدم كل 30 ثانية والتطبيق مفتوح — القاعدة تحفظه فقط إذا عنده خدمة شغّالة كسائق أو حالة طوارئ
let kick: (() => void) | null = null;
export const livePingNow = () => { kick?.(); };

export default function LivePinger() {
  useEffect(() => {
    let alive = true, timer: any, wait = 30000, busy = false;
    const tick = async () => {
      clearTimeout(timer);
      if (!busy && AppState.currentState === 'active') {
        busy = true;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const ll = await getFreshLocation();
            if (ll) {
              const { data } = await supabase.rpc('live_ping', { p_lat: ll[0], p_lng: ll[1] });
              wait = (data as any)?.tracking ? 30000 : 60000;
            }
          }
        } catch {}
        busy = false;
      }
      if (alive) timer = setTimeout(tick, wait);
    };
    kick = tick;
    const sub = AppState.addEventListener('change', s => { if (s === 'active') tick(); });
    tick();
    return () => { alive = false; clearTimeout(timer); sub.remove(); kick = null; };
  }, []);
  return null;
}
