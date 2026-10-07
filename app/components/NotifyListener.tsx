import React, { useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { useToast } from './Toast';

// إشعار فوري داخل التطبيق عند استلام تحويل أو دفعة أو تسوية
export default function NotifyListener() {
  const toast = useToast();
  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let uid: string | null = null;
    const start = (id: string) => {
      if (ch && uid === id) return;
      if (ch) supabase.removeChannel(ch);
      uid = id;
      ch = supabase.channel(`notify_${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${id}` }, (payload: any) => {
          const n = payload.new || {};
          toast.show(n.body ? `${n.title}: ${n.body}` : n.title, 'ok');
        })
        .subscribe();
    };
    const stop = () => { if (ch) supabase.removeChannel(ch); ch = null; uid = null; };
    supabase.auth.getUser().then(({ data }) => { if (data.user) start(data.user.id); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) start(session.user.id); else stop();
    });
    return () => { sub.subscription.unsubscribe(); stop(); };
  }, []);
  return toast.node;
}
