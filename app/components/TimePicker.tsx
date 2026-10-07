import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINS = [0, 15, 30, 45];
const p2 = (n: number) => String(n).padStart(2, '0');
export const hm = (v?: string | null) => (v ? String(v).slice(0, 5) : '');
export const timeLabel = (v?: string | null) => {
  if (!v) return '';
  const [h, m] = hm(v).split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${p2(m || 0)} ${h < 12 ? 'صباحاً' : 'مساءً'}`;
};

// اختيار الساعة والدقيقة بالنقر (بدون كتابة)
export default function TimePicker({ visible, value, title, onClose, onPick }:
  { visible: boolean; value?: string | null; title?: string; onClose: () => void; onPick: (v: string) => void }) {
  const [h, setH] = useState<number | null>(null);
  const [m, setM] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const [vh, vm] = hm(value).split(':').map(Number);
    setH(Number.isFinite(vh) ? vh : null);
    setM(MINS.includes(vm) ? vm : 0);
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.shade} onPress={onClose} />
      <View style={s.box}>
        {!!title && <Text style={s.title}>{title}</Text>}
        <Text style={s.lbl}>الساعة</Text>
        <View style={s.grid}>
          {HOURS.map(x => (
            <Pressable key={x} onPress={() => setH(x)} style={[s.cell, h === x && s.on]}>
              <Text style={[s.cellT, h === x && s.onT]}>{x % 12 === 0 ? 12 : x % 12}</Text>
              <Text style={[s.ap, h === x && s.onT]}>{x < 12 ? 'ص' : 'م'}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.lbl}>الدقيقة</Text>
        <View style={s.row}>
          {MINS.map(x => (
            <Pressable key={x} onPress={() => setM(x)} style={[s.min, m === x && s.on]}>
              <Text style={[s.cellT, m === x && s.onT]}>{p2(x)}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable disabled={h === null} onPress={() => { if (h !== null) { onPick(`${p2(h)}:${p2(m)}`); onClose(); } }}
          style={[s.ok, h === null && { opacity: 0.4 }]}>
          <Text style={s.okT}>{h === null ? 'اختر الساعة' : `تأكيد ${timeLabel(`${p2(h)}:${p2(m)}`)}`}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  shade: { flex: 1, backgroundColor: 'rgba(15,23,42,.45)' },
  box: { position: 'absolute', left: 16, right: 16, top: '18%', backgroundColor: '#fff', borderRadius: 20, padding: 16 },
  title: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  lbl: { fontSize: 12, fontWeight: '800', textAlign: 'right', marginTop: 10, marginBottom: 6, color: '#334155' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  cell: { width: '14.5%', paddingVertical: 7, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  row: { flexDirection: 'row-reverse', gap: 8 },
  min: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  on: { backgroundColor: '#4F46E5' },
  cellT: { fontWeight: '800', fontSize: 14, color: '#0f172a' },
  ap: { fontSize: 9, color: '#64748b' },
  onT: { color: '#fff' },
  ok: { marginTop: 14, height: 48, borderRadius: 14, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  okT: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
