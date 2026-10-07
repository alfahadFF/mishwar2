import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { routeForNotification } from '../utils/push';
import { useToast } from '../components/Toast';
import { Header, ui, C } from '../components/DriverUI';

type N = { id: string; kind: string; title: string; body?: string | null; data?: any; read_at?: string | null; created_at: string };

// أيقونة حسب نوع الإشعار
function iconFor(k: string): string {
  if (k === 'taxi_new' || k.startsWith('taxi_')) return '🚕';
  if (k.startsWith('shared_')) return '👥';
  if (k.startsWith('cargo_')) return '🚚';
  if (k.startsWith('event_')) return '🎉';
  if (k.startsWith('contract_')) return '📄';
  if (k.startsWith('rental_')) return '🚗';
  if (k.startsWith('travel_')) return '🧭';
  if (k === 'offer_new') return '📨';
  if (k === 'offer_accepted') return '✅';
  if (k === 'rating') return '⭐';
  if (k === 'loyalty') return '🎁';
  if (k === 'reward') return '🏆';
  if (k === 'wallet_negative') return '⚠️';
  if (k === 'transfer_in' || k === 'payment_in' || k === 'card_topup' || k === 'commission') return '💰';
  if (k === 'admin') return '🛡️';
  return '🔔';
}

// الوقت بشكل مفهوم
function when(s: string): string {
  const d = new Date(s); const now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} د`;
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return `اليوم ${hm}`;
  if (d.toDateString() === y.toDateString()) return `أمس ${hm}`;
  return `${d.getDate()}/${d.getMonth() + 1} ${hm}`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<N[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const uidRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('my_notifications', { p_limit: 100 });
    setLoading(false); setLoaded(true);
    if (error) return toast.show(errMsg(error), 'err');
    setItems((data as N[]) || []);
    // فتح الشاشة = الكل صار مقروء (التمييز بيضل ظاهر لحد ما تطلع)
    if ((data as N[] | null)?.some(n => !n.read_at)) supabase.rpc('mark_notifications_read').then(() => {}, () => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // الإشعارات الجديدة بتطلع فوق مباشرة وهي مفتوحة
  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id; if (!id) return;
      uidRef.current = id;
      ch = supabase.channel(`notif_list_${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${id}` }, (p: any) => {
          const n = p.new as N; if (!n?.id) return;
          setItems(prev => prev.some(x => x.id === n.id) ? prev : [{ ...n, read_at: null }, ...prev]);
          supabase.rpc('mark_notifications_read').then(() => {}, () => {});
        })
        .subscribe();
    });
    return () => { if (ch) supabase.removeChannel(ch); };
  }, []);

  const open = (n: N) => {
    const to = routeForNotification({ ...(n.data || {}), kind: n.kind });
    if (to && to !== '/') router.push(to as any);
  };

  const unread = items.filter(n => !n.read_at).length;

  return (
    <View style={ui.page}>
      <Header title="الإشعارات" onBack={() => router.back()}
        right={unread > 0 ? <View style={s.newPill}><Text style={s.newPillT}>{unread} جديد</Text></View> : null} />
      <FlatList
        data={items}
        keyExtractor={n => n.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={loaded ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 44 }}>🔕</Text>
            <Text style={s.emptyT}>لا توجد إشعارات حتى الآن</Text>
            <Text style={ui.sub}>ستصلك هنا العروض والقبول والمكافآت</Text>
          </View>
        ) : null}
        renderItem={({ item: n }) => {
          const to = routeForNotification({ ...(n.data || {}), kind: n.kind });
          const isNew = !n.read_at;
          return (
            <Pressable onPress={() => open(n)} style={({ pressed }) => [s.row, isNew && s.rowNew, pressed && { opacity: 0.7 }]}>
              <View style={[s.ic, isNew && s.icNew]}><Text style={{ fontSize: 20 }}>{iconFor(n.kind)}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={s.top}>
                  <Text style={[s.title, isNew && { fontWeight: '900' }]} numberOfLines={2}>{n.title}</Text>
                  {isNew && <View style={s.dot} />}
                </View>
                {!!n.body && <Text style={s.body} numberOfLines={3}>{n.body}</Text>}
                <View style={s.foot}>
                  <Text style={s.time}>{when(n.created_at)}</Text>
                  {to !== '/' && <Text style={s.go}>افتح ←</Text>}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row-reverse', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12, marginBottom: 8 },
  rowNew: { backgroundColor: '#fff7ed', borderColor: '#fdba74' },
  ic: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  icNew: { backgroundColor: '#ffedd5' },
  top: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: C.txt, textAlign: 'right' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF6B00' },
  body: { fontSize: 13, color: '#334155', textAlign: 'right', marginTop: 3, lineHeight: 19 },
  foot: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 },
  time: { fontSize: 11, color: C.mute },
  go: { fontSize: 11, color: '#FF6B00', fontWeight: '800' },
  newPill: { backgroundColor: '#FF6B00', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  newPillT: { color: '#fff', fontSize: 11, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 80 },
  emptyT: { fontSize: 16, fontWeight: '900', color: C.txt },
});
