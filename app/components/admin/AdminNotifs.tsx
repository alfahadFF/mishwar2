import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { supabase } from '../../utils/supabase';
import { fmtDateTime } from '../../utils/events';
import { Empty, ui, C } from '../DriverUI';

// إشعارات الإدارة الخاصة: الضغط يفتح القسم المناسب
const target = (k: string) => (k === 'work_new' || k === 'work_updated' ? 'verify' : k.startsWith('driver_') ? 'cancels' : null);

export default function AdminNotifs({ onOpen, onSeen }: { onOpen: (k: string) => void; onSeen: () => void }) {
  const [list, setList] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    const { data } = await supabase.rpc('admin_notifications_list');
    setList(((data || []) as any[]).map(r => r.admin_notifications_list || r));
    await supabase.rpc('admin_notifications_read'); onSeen();
  };
  useEffect(() => { load(); }, []);
  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      {!list ? <Empty icon="⏳" title="جاري التحميل" /> : list.length === 0 ? <Empty icon="🔕" title="لا توجد إشعارات" /> : list.map(n => {
        const go = target(n.kind);
        return (
          <Pressable key={n.id} disabled={!go} onPress={() => go && onOpen(go)} style={[ui.card, !n.read_at && { borderColor: '#a5b4fc', borderWidth: 2 }]}>
            <Text style={ui.h}>{n.title}</Text>
            {!!n.body && <Text style={ui.sub}>{n.body}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={[ui.sub, { fontSize: 11 }]}>{fmtDateTime(n.created_at)}</Text>
              {!!go && <Text style={{ color: C.brand, fontWeight: '800', fontSize: 12 }}>فتح ←</Text>}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
