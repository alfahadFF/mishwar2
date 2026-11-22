import React, { useState } from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import TimePicker, { timeLabel } from './TimePicker';

type Props = { value: string; onChange: (value: string) => void; placeholder?: string; style?: any; accessibilityLabel?: string };

export default function TimeSelector({ value, onChange, placeholder = 'اختر الساعة', style, accessibilityLabel = 'اختيار الساعة' }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={s.wrap}>
      <Pressable onPress={() => setVisible(true)} style={[s.button, style, { flex: 1 }]} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        <Text style={s.text}>{value ? `🕒 ${timeLabel(value)}` : `🕒 ${placeholder}`}</Text>
      </Pressable>
      {!!value && <Pressable onPress={() => onChange('')} style={s.clear} accessibilityRole="button" accessibilityLabel="مسح الوقت">
        <Text style={s.clearText}>مسح</Text>
      </Pressable>}
      <TimePicker visible={visible} value={value} title={accessibilityLabel} onClose={() => setVisible(false)} onPick={onChange} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  button: { minHeight: 40, justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 11, paddingHorizontal: 10 },
  text: { textAlign: 'right', color: '#334155', fontWeight: '800', fontSize: 12 },
  clear: { minHeight: 32, paddingHorizontal: 6, justifyContent: 'center' },
  clearText: { color: '#64748b', fontSize: 10, fontWeight: '700' },
});
