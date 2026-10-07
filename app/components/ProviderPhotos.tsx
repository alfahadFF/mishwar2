import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, Modal, StyleSheet } from 'react-native';
import { supabase } from '../utils/supabase';

// صورة السائق وصورة المركبة إن أرفقهما. الاسم والهاتف لا يظهران هنا (يظهران بعد القبول فقط)
type Service = 'cargo_offer' | 'event_offer' | 'contract_offer' | 'cargo' | 'taxi' | 'taxi_shared';
export default function ProviderPhotos({ service, refId, hideVehicle }: { service: Service; refId?: string | null; hideVehicle?: boolean }) {
  const [p, setP] = useState<{ driver?: string | null; vehicle?: string | null } | null>(null);
  const [big, setBig] = useState<string | null>(null);
  useEffect(() => {
    if (!refId) return;
    supabase.rpc('provider_photos', { p_service: service, p_refs: [refId] }).then(({ data }) => setP((data as any)?.[refId] || null));
  }, [service, refId]);
  const items = [p?.driver && { k: 'd', uri: p.driver, t: 'السائق' }, !hideVehicle && p?.vehicle && { k: 'v', uri: p.vehicle, t: 'المركبة' }]
    .filter(Boolean) as { k: string; uri: string; t: string }[];
  if (!items.length) return null;
  return (
    <View style={s.row}>
      {items.map(x => (
        <Pressable key={x.k} onPress={() => setBig(x.uri)} style={{ alignItems: 'center' }}>
          <Image source={{ uri: x.uri }} style={[s.img, x.k === 'd' && { borderRadius: 28 }]} />
          <Text style={s.t}>{x.t}</Text>
        </Pressable>
      ))}
      <Modal visible={!!big} transparent animationType="fade" onRequestClose={() => setBig(null)}>
        <Pressable style={s.overlay} onPress={() => setBig(null)}>
          {!!big && <Image source={{ uri: big }} style={s.big} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row-reverse', gap: 12, marginTop: 8 },
  img: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#f1f5f9' },
  t: { fontSize: 10, color: '#64748b', marginTop: 3, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  big: { width: '92%', height: '70%' },
});
