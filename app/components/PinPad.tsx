import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

// لوحة إدخال الرمز السري (4 أرقام) بدون لوحة مفاتيح النظام
export default function PinPad({ visible, title, sub, error, busy, onClose, onDone }:
  { visible: boolean; title: string; sub?: string; error?: string | null; busy?: boolean; onClose: () => void; onDone: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  useEffect(() => { if (visible) setPin(''); }, [visible, title]);
  useEffect(() => { if (error) setPin(''); }, [error]);
  const press = (k: string) => {
    if (busy || !k) return;
    if (k === '⌫') return setPin(p => p.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) setTimeout(() => onDone(next), 120);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.shade} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grab} />
        <Text style={s.title}>{title}</Text>
        {!!sub && <Text style={s.sub}>{sub}</Text>}
        <View style={s.dots}>
          {[0, 1, 2, 3].map(i => <View key={i} style={[s.dot, i < pin.length && s.dotOn, !!error && s.dotErr]} />)}
        </View>
        <View style={{ height: 22, justifyContent: 'center' }}>
          {busy ? <ActivityIndicator /> : !!error && <Text style={s.err}>{error}</Text>}
        </View>
        <View style={s.grid}>
          {KEYS.map((k, i) => (
            <Pressable key={i} disabled={!k} onPress={() => press(k)} style={({ pressed }) => [s.key, !k && { backgroundColor: 'transparent' }, pressed && k ? s.keyP : null]}>
              <Text style={[s.keyT, k === '⌫' && { fontSize: 20 }]}>{k}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onClose} style={s.cancel}><Text style={s.cancelT}>إلغاء</Text></Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  shade: { flex: 1, backgroundColor: 'rgba(15,23,42,.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24 },
  grab: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '900', textAlign: 'center', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 18 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#cbd5e1' },
  dotOn: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  dotErr: { borderColor: '#b91c1c' },
  err: { color: '#b91c1c', fontWeight: '800', textAlign: 'center', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 6 },
  key: { width: '31%', height: 58, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  keyP: { backgroundColor: '#e0e7ff' },
  keyT: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  cancel: { marginTop: 12, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancelT: { fontWeight: '900', color: '#64748b' },
});
