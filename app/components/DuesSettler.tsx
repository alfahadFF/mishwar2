import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../utils/supabase';

// خصم كل العمولات الشهرية المستحقة (عقود + تأجير) عند فتح التطبيق وعند الرجوع إليه
export default function DuesSettler() {
  const last = useRef(0);
  useEffect(() => {
    const run = async () => {
      if (Date.now() - last.current < 60e3) return;
      last.current = Date.now();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await supabase.rpc('settle_all_my_dues').then(() => {}, () => {});
    };
    run();
    const sub = AppState.addEventListener('change', st => { if (st === 'active') run(); });
    const auth = supabase.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_IN') { last.current = 0; run(); } });
    return () => { sub.remove(); auth.data.subscription.unsubscribe(); };
  }, []);
  return null;
}
