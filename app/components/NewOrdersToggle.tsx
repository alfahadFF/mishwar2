import React, { useCallback, useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../utils/supabase';
import { getMyLocation } from '../utils/location';

// زر «استقبال إشعارات الطلبات الجديدة» + حفظ آخر موقع لمقدم الخدمة
export default function NewOrdersToggle({ ping, compact, onChange }: { ping?: boolean; compact?: boolean; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState<boolean | null>(null);
  useFocusEffect(useCallback(() => {
    supabase.rpc('my_push_prefs').then(({ data }) => setOn((data as any)?.new_orders ?? true), () => {});
    if (ping) getMyLocation().then(({ ll, real }) => {
      if (real) supabase.rpc('provider_location_ping', { p_lat: ll[0], p_lng: ll[1] }).then(() => {}, () => {});
    });
  }, [ping]));
  const toggle = async (v: boolean) => {
    setOn(v);
    const { error } = await supabase.rpc('set_new_orders_push', { p_on: v });
    if (error) setOn(!v); else onChange?.(v);
  };
  if (on === null) return null;
  if (compact) return (
    <Pressable onPress={() => toggle(!on)} style={[s.pill, !on && s.off]} hitSlop={6}>
      <Text style={s.pillT}>{on ? '🔔' : '🔕'}</Text>
    </Pressable>
  );
  return (
    <View style={[s.card, !on && s.cardOff]}>
      <View style={{ flex: 1 }}>
        <Text style={s.h}>{on ? '🔔' : '🔕'} إشعارات الطلبات الجديدة</Text>
        <Text style={s.sub}>{on ? 'يصلك إشعار بكل طلب جديد قريب منك حتى لو كان التطبيق مغلقاً' : 'متوقفة — تستمر إشعارات طلباتك الحالية بالوصول'}</Text>
      </View>
      <Switch value={on} onValueChange={toggle} trackColor={{ true: '#86efac', false: '#e2e8f0' }} thumbColor={on ? '#16a34a' : '#94a3b8'} />
    </View>
  );
}
const s = StyleSheet.create({
  card: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 14, padding: 10, marginBottom: 10 },
  cardOff: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  h: { fontWeight: '800', fontSize: 13, color: '#0f172a', textAlign: 'right' },
  sub: { fontSize: 11, color: '#64748b', textAlign: 'right', marginTop: 2 },
  pill: { backgroundColor: '#f0fdf4', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  off: { backgroundColor: '#f1f5f9' },
  pillT: { fontSize: 13 },
});
