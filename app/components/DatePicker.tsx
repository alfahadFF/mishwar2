import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const WD = ['أحد', 'إثن', 'ثلا', 'أرب', 'خميس', 'جمعة', 'سبت'];
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseYmd = (s?: string | null) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };

// تقويم لاختيار تاريخ (بدون كتابة)
export default function DatePicker({ visible, value, minDate, title, onClose, onPick }:
  { visible: boolean; value?: string | null; minDate?: Date; title?: string; onClose: () => void; onPick: (v: string) => void }) {
  const init = parseYmd(value) || new Date();
  const [view, setView] = useState(new Date(init.getFullYear(), init.getMonth(), 1));
  useEffect(() => { if (visible) { const d = parseYmd(value) || new Date(); setView(new Date(d.getFullYear(), d.getMonth(), 1)); } }, [visible]);
  const min = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null;
  const first = view.getDay();
  const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const canPrev = !min || new Date(view.getFullYear(), view.getMonth(), 0) >= min;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.shade} onPress={onClose} />
      <View style={s.box}>
        {!!title && <Text style={s.title}>{title}</Text>}
        <View style={s.nav}>
          <Pressable disabled={!canPrev} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} style={[s.navBtn, !canPrev && { opacity: 0.3 }]}><Text style={s.navT}>›</Text></Pressable>
          <Text style={s.month}>{MONTHS[view.getMonth()]} {view.getFullYear()}</Text>
          <Pressable onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} style={s.navBtn}><Text style={s.navT}>‹</Text></Pressable>
        </View>
        <View style={s.grid}>
          {WD.map(w => <Text key={w} style={s.wd}>{w}</Text>)}
          {cells.map((d, i) => {
            if (!d) return <View key={i} style={s.cell} />;
            const date = new Date(view.getFullYear(), view.getMonth(), d);
            const off = !!min && date < min;
            const on = value === ymd(date);
            return (
              <Pressable key={i} disabled={off} onPress={() => { onPick(ymd(date)); onClose(); }} style={[s.cell, on && s.cellOn]}>
                <Text style={[s.cellT, off && { color: '#cbd5e1' }, on && { color: '#fff' }]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={onClose} style={s.close}><Text style={{ fontWeight: '900' }}>إغلاق</Text></Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,.45)' },
  box: { position: 'absolute', left: 16, right: 16, top: '18%', backgroundColor: '#fff', borderRadius: 20, padding: 14 },
  title: { fontWeight: '900', fontSize: 15, textAlign: 'center', marginBottom: 8 },
  nav: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  navT: { fontSize: 22, fontWeight: '900' },
  month: { fontWeight: '900', fontSize: 15 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap' },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, color: '#64748b', fontWeight: '800', paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  cellOn: { backgroundColor: '#4F46E5' },
  cellT: { fontWeight: '800', color: '#0f172a' },
  close: { marginTop: 10, height: 42, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
});
