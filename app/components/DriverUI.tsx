import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator, Linking } from 'react-native';

export const C = { brand: '#4F46E5', ok: '#047857', okBg: '#ecfdf5', warn: '#b45309', warnBg: '#fffbeb', err: '#b91c1c', errBg: '#fef2f2', txt: '#0f172a', mute: '#64748b', line: '#e2e8f0', bg: '#f8fafc' };

export function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={s.head}>
      <Pressable onPress={onBack} style={s.back} hitSlop={8}><Text style={{ fontSize: 18 }}>→</Text></Pressable>
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      <View style={{ flexDirection: 'row-reverse', gap: 6 }}>{right}</View>
    </View>
  );
}

export function Pill({ text, tone = 'mute', onPress }: { text: string; tone?: 'mute' | 'ok' | 'warn' | 'err' | 'brand'; onPress?: () => void }) {
  const st: [any, any] = ({ mute: [s.pMute, s.tMute], ok: [s.pOk, s.tOk], warn: [s.pWarn, s.tWarn], err: [s.pErr, s.tErr], brand: [s.pBrand, s.tBrand] } as Record<string, [any, any]>)[tone];
  const body = <View style={[s.pill, st[0]]}><Text style={[s.pillT, st[1]]} numberOfLines={1}>{text}</Text></View>;
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export function Tabs({ tabs, value, onChange }: { tabs: { k: string; label: string; n?: number }[]; value: string; onChange: (k: string) => void }) {
  return (
    <View style={s.tabs}>
      {tabs.map(t => (
        <Pressable key={t.k} onPress={() => onChange(t.k)} style={[s.tab, value === t.k && s.tabOn]}>
          <Text style={[s.tabT, value === t.k && s.tabTOn]}>{t.label}{t.n ? ` (${t.n})` : ''}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Empty({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <View style={s.empty}>
      <Text style={{ fontSize: 38 }}>{icon}</Text>
      <Text style={s.emptyT}>{title}</Text>
      {!!sub && <Text style={s.emptyS}>{sub}</Text>}
    </View>
  );
}

export function Row({ k, v, strong }: { k: string; v?: React.ReactNode; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowK}>{k}</Text>
      <Text style={[s.rowV, strong && { fontWeight: '900', color: C.txt }]}>{v ?? '—'}</Text>
    </View>
  );
}

export function Btn({ label, onPress, tone = 'brand', disabled, loading, small }: { label: string; onPress: () => void; tone?: 'brand' | 'ok' | 'ghost' | 'err'; disabled?: boolean; loading?: boolean; small?: boolean }) {
  const bg = { brand: C.brand, ok: '#059669', ghost: '#f1f5f9', err: '#fee2e2' }[tone];
  const fg = tone === 'ghost' ? C.txt : tone === 'err' ? C.err : '#fff';
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} style={[s.btn, small && s.btnSm, { backgroundColor: bg }, (disabled || loading) && { opacity: 0.5 }]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnT, small && { fontSize: 12 }, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function CallBtn({ phone }: { phone?: string | null }) {
  if (!phone) return null;
  return <Btn label={`📞 اتصال ${phone}`} tone="ok" onPress={() => Linking.openURL('tel:' + phone)} />;
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.shade} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grab} />
        {!!title && <Text style={s.sheetH}>{title}</Text>}
        {children}
      </View>
    </Modal>
  );
}

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12, marginBottom: 10 },
  cardNew: { borderColor: '#a5b4fc', borderWidth: 2 },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  h: { fontSize: 15, fontWeight: '900', color: C.txt, textAlign: 'right' },
  sub: { fontSize: 12, color: C.mute, textAlign: 'right', marginTop: 3 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  metrics: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  metric: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  metricV: { fontWeight: '900', fontSize: 14, color: C.txt },
  metricK: { fontSize: 10, color: C.mute, marginTop: 2 },
  banner: { borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1 },
  input: { borderWidth: 1.5, borderColor: C.line, borderRadius: 12, height: 46, paddingHorizontal: 12, backgroundColor: '#fff', textAlign: 'right', fontSize: 15 },
  label: { fontSize: 12, fontWeight: '800', textAlign: 'right', marginBottom: 4, marginTop: 10 },
  note: { fontSize: 12, color: C.mute, textAlign: 'right', marginTop: 6, lineHeight: 18 },
  btns: { flexDirection: 'row-reverse', gap: 8, marginTop: 12 },
});

const s = StyleSheet.create({
  head: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 44, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line, gap: 8 },
  back: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '900', textAlign: 'right', color: C.txt },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, maxWidth: 220 },
  pillT: { fontSize: 11, fontWeight: '800' },
  pMute: { backgroundColor: '#f1f5f9', borderColor: C.line }, tMute: { color: '#334155' },
  pOk: { backgroundColor: C.okBg, borderColor: '#a7f3d0' }, tOk: { color: C.ok },
  pWarn: { backgroundColor: C.warnBg, borderColor: '#fde68a' }, tWarn: { color: C.warn },
  pErr: { backgroundColor: C.errBg, borderColor: '#fecaca' }, tErr: { color: C.err },
  pBrand: { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }, tBrand: { color: C.brand },
  tabs: { flexDirection: 'row-reverse', margin: 12, marginBottom: 6, backgroundColor: '#eef2f7', borderRadius: 14, padding: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  tabOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabT: { fontWeight: '800', fontSize: 13, color: C.mute },
  tabTOn: { color: C.txt },
  empty: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 20 },
  emptyT: { fontWeight: '900', fontSize: 15, marginTop: 8, color: C.txt, textAlign: 'center' },
  emptyS: { color: C.mute, fontSize: 12, marginTop: 4, textAlign: 'center', lineHeight: 18 },
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 10 },
  rowK: { color: C.mute, fontSize: 13 },
  rowV: { color: '#334155', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'left' },
  btn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnSm: { height: 38, borderRadius: 11, flex: 0 },
  btnT: { fontWeight: '900', fontSize: 14 },
  shade: { flex: 1, backgroundColor: 'rgba(15,23,42,.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 26, maxHeight: '92%' },
  grab: { width: 42, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginBottom: 10 },
  sheetH: { fontSize: 17, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
});
