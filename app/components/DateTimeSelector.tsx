import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import DatePicker, { ymd } from './DatePicker';
import TimePicker, { timeLabel } from './TimePicker';

type Props = { value: string; onChange: (value: string) => void; minDate?: Date };

const datePart = (value: string) => String(value || '').slice(0, 10);
const timePart = (value: string) => {
  const match = /[ T]([0-9]{1,2}:[0-9]{2})/.exec(String(value || ''));
  return match?.[1] || '';
};

// Choose date and time from visual pickers; users never need to type a timestamp.
export default function DateTimeSelector({ value, onChange, minDate = new Date() }: Props) {
  const [open, setOpen] = useState<'date' | 'time' | null>(null);
  const date = datePart(value);
  const time = timePart(value);

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <Pressable onPress={() => setOpen('date')} style={s.button} accessibilityRole="button" accessibilityLabel="اختيار التاريخ">
          <Text style={s.buttonText} numberOfLines={1}>{date ? `📅 ${date}` : '📅 اختر التاريخ'}</Text>
        </Pressable>
        <Pressable onPress={() => setOpen('time')} style={s.button} accessibilityRole="button" accessibilityLabel="اختيار الساعة">
          <Text style={s.buttonText} numberOfLines={1}>{time ? `🕒 ${timeLabel(time)}` : '🕒 اختر الساعة'}</Text>
        </Pressable>
      </View>
      {!!value && <Pressable onPress={() => onChange('')} style={s.clear} accessibilityRole="button" accessibilityLabel="مسح الموعد">
        <Text style={s.clearText}>مسح الموعد</Text>
      </Pressable>}
      <DatePicker
        visible={open === 'date'}
        value={date}
        minDate={minDate}
        title="اختر التاريخ"
        onClose={() => setOpen(null)}
        onPick={picked => onChange(`${picked} ${time || '09:00'}`)}
      />
      <TimePicker
        visible={open === 'time'}
        value={time}
        title="اختر الساعة"
        onClose={() => setOpen(null)}
        onPick={picked => onChange(`${date || ymd(new Date())} ${picked}`)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 5, marginTop: 4 },
  row: { flexDirection: 'row-reverse', gap: 7 },
  button: { flex: 1, minWidth: 0, minHeight: 42, paddingHorizontal: 9, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 11, backgroundColor: '#fff', justifyContent: 'center' },
  buttonText: { textAlign: 'right', color: '#334155', fontWeight: '800', fontSize: 11 },
  clear: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2 },
  clearText: { color: '#64748b', fontSize: 10, fontWeight: '700' },
});
