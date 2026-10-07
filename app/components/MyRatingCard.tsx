import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { TAGS, SERVICE_LABEL, LEVELS } from '../utils/rating';

// كرت «تقييمي» لمقدم الخدمة — بدون أسماء الزبائن
export default function MyRatingCard({ compact }: { compact?: boolean }) {
  const [d, setD] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useFocusEffect(useCallback(() => {
    supabase.rpc('my_rating_summary').then(({ data }) => { if (data) setD(data); }, () => {});
  }, []));
  if (!d) return null;
  const n = Number(d.n || 0);
  const L = LEVELS[d.level || 'bronze'];
  if (compact) return <Pressable onPress={() => router.push('/incentives' as any)} style={s.pill}><Text style={s.pillT}>{L.e} {n ? `⭐ ${Number(d.avg).toFixed(1)} (${n})` : '⭐ جديد'}</Text></Pressable>;
  const tags = Object.entries(d.tags || {}).sort((a: any, b: any) => b[1] - a[1]);
  return (
    <Pressable onPress={() => n && setOpen(!open)} style={s.card}>
      <View style={s.top}>
        <Text style={s.h}>⭐ تقييمي <Text style={{ color: L.c }}>{L.e} {L.n}</Text></Text>
        <Text style={s.big}>{n ? `${Number(d.avg).toFixed(1)}` : '—'} <Text style={s.n}>{n ? `(${n} تقييم)` : 'لا توجد تقييمات بعد'}</Text></Text>
      </View>
      {!!tags.length && (
        <View style={s.chips}>
          {tags.slice(0, open ? 20 : 4).map(([k, c]: any) => (
            <View key={k} style={[s.chip, { backgroundColor: TAGS[k]?.pos ? '#ecfdf5' : '#fef2f2' }]}>
              <Text style={s.chipT}>{TAGS[k]?.l || k} × {c}</Text>
            </View>
          ))}
        </View>
      )}
      {open && (d.recent || []).map((r: any, i: number) => (
        <View key={i} style={s.row}>
          <Text style={s.rowS}>{r.stars ? '★'.repeat(r.stars) : '—'}</Text>
          <Text style={s.rowT} numberOfLines={1}>{SERVICE_LABEL[r.service]} {(r.tags || []).map((k: string) => TAGS[k]?.l.split(' ')[0]).join(' ')}</Text>
        </View>
      ))}
      {n > 0 && <Text style={s.more}>{open ? 'إخفاء' : 'عرض التفاصيل'}</Text>}
      <Pressable onPress={() => router.push('/incentives' as any)} style={s.inc}><Text style={s.incT}>🏆 حوافزي ومكافأة الشهر ←</Text></Pressable>
    </Pressable>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fde68a', borderRadius: 16, padding: 12, marginBottom: 10 },
  top: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  h: { fontWeight: '900', fontSize: 15, color: '#0f172a' },
  big: { fontWeight: '900', fontSize: 20, color: '#b45309' },
  n: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  chipT: { fontSize: 11, fontWeight: '700', color: '#0f172a' },
  row: { flexDirection: 'row-reverse', gap: 8, marginTop: 6, alignItems: 'center' },
  rowS: { color: '#f59e0b', fontSize: 13, minWidth: 70, textAlign: 'right' },
  rowT: { flex: 1, textAlign: 'right', fontSize: 12, color: '#334155' },
  pill: { backgroundColor: '#fffbeb', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  pillT: { fontSize: 11, fontWeight: '900', color: '#92400e' },
  inc: { marginTop: 10, backgroundColor: '#fff7ed', borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  incT: { color: '#c2410c', fontWeight: '900', fontSize: 13 },
  more: { textAlign: 'center', color: '#4F46E5', fontSize: 12, marginTop: 8, fontWeight: '700' },
});
