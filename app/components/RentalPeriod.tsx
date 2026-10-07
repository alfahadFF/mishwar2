import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import DatePicker, { ymd, parseYmd } from './DatePicker';
import TimePicker, { timeLabel } from './TimePicker';
import { C, ui } from './DriverUI';
import { UNIT, Unit, unitCount } from '../utils/rental';

export type Period = { unit: Unit; count: number; date: string; time: string; price: string };
export const newPeriod = (unit: Unit, price?: number | null): Period => {
  const d = new Date(Date.now() + 2 * 3600e3);
  return { unit, count: 1, date: ymd(d), time: `${String(d.getHours()).padStart(2, '0')}:00`, price: price ? String(price) : '' };
};
export const periodStart = (p: Period) => {
  const d = parseYmd(p.date) || new Date();
  const [h, m] = p.time.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};
export const periodTotal = (p: Period) => Math.round((Number(p.price) || 0) * p.count * 100) / 100;

// المدة + العدد + البداية + السعر للوحدة، والمجموع يُحسب تلقائياً
export default function RentalPeriod({ units, value, onChange, fixedPrice, prices }:
  { units: Unit[]; value: Period; onChange: (p: Period) => void; fixedPrice?: boolean; prices?: Record<string, number> }) {
  const [dp, setDp] = useState(false);
  const [tp, setTp] = useState(false);
  const set = (x: Partial<Period>) => onChange({ ...value, ...x });
  const pickUnit = (u: Unit) => set({ unit: u, count: Math.min(value.count, UNIT[u].max), price: prices?.[u] ? String(prices[u]) : fixedPrice ? '' : value.price });
  const max = UNIT[value.unit].max;
  const total = periodTotal(value);
  return (
    <View>
      <Text style={ui.label}>مدة الإيجار</Text>
      <View style={ui.chips}>
        {units.map(u => (
          <Pressable key={u} onPress={() => pickUnit(u)} style={[s.chip, value.unit === u && s.on]}>
            <Text style={[s.chipT, value.unit === u && s.onT]}>بال{UNIT[u].n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={ui.label}>العدد</Text>
      <View style={s.step}>
        <Pressable onPress={() => set({ count: Math.min(max, value.count + 1) })} style={s.stepB}><Text style={s.stepT}>+</Text></Pressable>
        <Text style={s.stepV}>{unitCount(value.unit, value.count)}</Text>
        <Pressable onPress={() => set({ count: Math.max(1, value.count - 1) })} style={s.stepB}><Text style={s.stepT}>−</Text></Pressable>
      </View>
      <Text style={ui.label}>بداية الإيجار</Text>
      <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
        <Pressable onPress={() => setDp(true)} style={[ui.input, s.pick]}><Text>📅 {value.date}</Text></Pressable>
        <Pressable onPress={() => setTp(true)} style={[ui.input, s.pick]}><Text>🕒 {timeLabel(value.time)}</Text></Pressable>
      </View>
      <Text style={ui.label}>السعر لل{UNIT[value.unit].n} ($)</Text>
      {fixedPrice
        ? <View style={[ui.input, s.pick]}><Text style={{ fontWeight: '800' }}>${value.price || '—'} (سعر ثابت)</Text></View>
        : <TextInput value={value.price} onChangeText={t => set({ price: t.replace(/[^\d.]/g, '') })} keyboardType="decimal-pad" placeholder="اكتب سعرك" style={ui.input} />}
      <View style={s.total}>
        <Text style={{ color: C.mute }}>المجموع</Text>
        <Text style={{ fontWeight: '900', fontSize: 18, color: C.txt }}>${total}</Text>
      </View>
      <DatePicker visible={dp} value={value.date} minDate={new Date()} title="بداية الإيجار" onClose={() => setDp(false)} onPick={v => { set({ date: v }); setDp(false); }} />
      <TimePicker visible={tp} value={value.time} title="ساعة الاستلام" onClose={() => setTp(false)} onPick={v => { set({ time: v }); setTp(false); }} />
    </View>
  );
}

const s = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff' },
  chipT: { fontWeight: '700', color: C.txt },
  on: { backgroundColor: C.brand, borderColor: C.brand },
  onT: { color: '#fff' },
  step: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  stepB: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  stepT: { fontSize: 22, fontWeight: '900', color: C.brand },
  stepV: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 16 },
  pick: { flex: 1, justifyContent: 'center' },
  total: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: 12, backgroundColor: '#f1f5f9', borderRadius: 12 },
});
