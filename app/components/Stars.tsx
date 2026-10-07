import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Rating, LEVELS } from '../utils/rating';

// ⭐ 4.8 · 120 — أو «جديد» إذا ما في تقييمات
export default function Stars({ r, small }: { r?: Rating | null; small?: boolean }) {
  if (r === undefined) return null;
  const has = !!r && r.n > 0 && r.avg != null;
  return (
    <View style={[s.box, !has && s.newBox]}>
      <Text style={[s.t, small && { fontSize: 11 }, !has && s.newT]}>{has ? `${r!.level && r!.level !== 'bronze' ? LEVELS[r!.level].e + ' ' : ''}⭐ ${Number(r!.avg).toFixed(1)} · ${r!.n}` : '✨ جديد'}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  box: { backgroundColor: '#fffbeb', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  newBox: { backgroundColor: '#f1f5f9' },
  t: { fontWeight: '800', fontSize: 12, color: '#92400e' },
  newT: { color: '#64748b' },
});
