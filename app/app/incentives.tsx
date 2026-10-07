import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { LEVELS } from '../utils/rating';
import { useToast } from '../components/Toast';
import { Header, ui, C } from '../components/DriverUI';

// شروط كل مستوى (نفس أرقام السيرفر)
const NEED: Record<string, { n: number; avg: number; next?: string }> = {
  bronze: { n: 0, avg: 0, next: 'silver' }, silver: { n: 20, avg: 4.3, next: 'gold' },
  gold: { n: 50, avg: 4.6, next: 'diamond' }, diamond: { n: 100, avg: 4.8 },
};
const PERKS: Record<string, string[]> = {
  bronze: ['تصلك طلبات التكسي بعد المستويات الأعلى القريبة'],
  silver: ['تصلك طلبات التكسي قبل المستوى البرونزي', 'شارة 🥈 بجانب عروضك', '+2% فوق مكافأة الشهر'],
  gold: ['تصلك طلبات التكسي قبل المستويين الفضي والبرونزي', 'تظهر عروضك وإعلاناتك في الأعلى', 'شارة 🥇', '+5% فوق مكافأة الشهر'],
  diamond: ['تصلك طلبات التكسي أولاً', 'تظهر عروضك وإعلاناتك أول القائمة', 'شارة 💎', '+10% فوق مكافأة الشهر'],
};
const MIN = 450, CAP = 900;
const money = (v: any) => `$${Number(v || 0).toFixed(2)}`;
const monthName = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getFullYear()}`; };

export default function IncentivesScreen() {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('my_incentives');
    setLoading(false);
    if (error) return toast.show(errMsg(error), 'err');
    setD(data);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const lvl = d?.level || 'bronze';
  const L = LEVELS[lvl];
  const nx = NEED[lvl].next ? NEED[NEED[lvl].next!] : null;
  const NL = NEED[lvl].next ? LEVELS[NEED[lvl].next!] : null;
  const n = Number(d?.n || 0), avg = d?.avg == null ? null : Number(d.avg);
  const vol = Number(d?.month_volume || 0);
  const volPct = Math.min(1, vol / CAP);
  const toMin = Math.max(0, MIN - vol);
  const nextStep = vol < MIN ? toMin : (d?.base_pct >= 30 ? 0 : 15 - ((vol - MIN) % 15));

  return (
    <View style={ui.page}>
      <Header title="🏆 حوافزي" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {!!d && <>
          <View style={[s.level, { backgroundColor: L.bg, borderColor: L.c + '55' }]}>
            <Text style={{ fontSize: 44 }}>{L.e}</Text>
            <Text style={[s.levelN, { color: L.c }]}>المستوى {L.n}</Text>
            <Text style={s.levelS}>{n ? `⭐ ${avg?.toFixed(1)} على آخر ${Math.min(n, 100)} تقييم • ${n} تقييم` : 'لا توجد تقييمات بعد'}</Text>
            {nx && NL && <>
              <View style={s.bar}><View style={[s.barIn, { width: `${Math.min(1, n / nx.n) * 100}%`, backgroundColor: L.c }]} /></View>
              <Text style={s.levelS}>
                للمستوى {NL.n}: {nx.n} تقييم + متوسط {nx.avg}
                {n < nx.n ? ` • باقي ${nx.n - n} تقييم` : ''}{avg != null && avg < nx.avg ? ` • يجب أن يرتفع المتوسط إلى ${nx.avg}` : ''}
              </Text>
            </>}
            {!nx && <Text style={s.levelS}>أعلى مستوى 🎉 — حافظ على متوسط 4.8</Text>}
          </View>

          <View style={ui.card}>
            <Text style={ui.h}>ميزات مستواك</Text>
            {PERKS[lvl].map((p, i) => <Text key={i} style={ui.sub}>• {p}</Text>)}
            <Text style={[ui.sub, { color: C.mute, marginTop: 6 }]}>يُحسب المستوى على آخر 100 تقييم، لذا يرتفع وينخفض حسب جودة خدمتك.</Text>
          </View>

          <View style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>📊 مكافأة هذا الشهر</Text>
              <Text style={s.days}>باقي {d.days_left} يوم</Text>
            </View>
            <View style={s.line}><Text style={s.k}>مجموع طلباتك المكتملة</Text><Text style={s.v}>{money(vol)}</Text></View>
            <View style={s.bar}>
              <View style={[s.barIn, { width: `${volPct * 100}%`, backgroundColor: vol >= MIN ? C.ok : '#FF6B00' }]} />
              <View style={[s.mark, { right: `${(MIN / CAP) * 100}%` }]} />
            </View>
            <View style={[s.line, { marginTop: 2 }]}><Text style={s.tiny}>0</Text><Text style={s.tiny}>الحد {MIN}$</Text><Text style={s.tiny}>السقف {CAP}$</Text></View>
            <Text style={[ui.sub, { marginTop: 6 }]}>
              {vol < MIN ? `باقي ${money(toMin)} لبدء احتساب المكافأة` : d.base_pct >= 30 ? 'وصلت للسقف 30% 🎉' : `كل ${money(nextStep)} زيادة = +1%`}
            </Text>
            <View style={s.line}><Text style={s.k}>نسبة الطلبات</Text><Text style={s.v}>{d.base_pct}%</Text></View>
            <View style={s.line}><Text style={s.k}>زيادة المستوى</Text><Text style={s.v}>{vol >= MIN ? `+${d.bonus_pct}%` : `+${d.bonus}% (بعد الحد)`}</Text></View>
            <View style={s.line}><Text style={s.k}>عمولة الشهر حتى الآن</Text><Text style={s.v}>{money(d.month_commission)}</Text></View>
            <View style={s.line}>
              <Text style={s.k}>تقييم الشهر</Text>
              <Text style={[s.v, { color: d.rating_ok ? C.ok : C.err }]}>{d.month_avg == null ? '—' : Number(d.month_avg).toFixed(1)} {d.rating_ok ? '✓' : '✗ (المطلوب 4.0)'}</Text>
            </View>
            <View style={s.total}><Text style={s.totalK}>المكافأة المتوقعة</Text><Text style={s.totalV}>{money(d.expected)}</Text></View>
            <Text style={[ui.sub, { textAlign: 'center' }]}>تُضاف تلقائياً إلى محفظتك في بداية الشهر القادم</Text>
          </View>

          <View style={ui.card}>
            <Text style={ui.h}>كيف تُحسب؟</Text>
            <Text style={ui.sub}>• من {MIN}$ مجموع طلبات في الشهر تبدأ المكافأة</Text>
            <Text style={ui.sub}>• كل 15$ فوق الـ {MIN}$ = 1% من عمولة الشهر، حتى 30%</Text>
            <Text style={ui.sub}>• وتُضاف إليها زيادة المستوى: فضي 2% • ذهبي 5% • ماسي 10%</Text>
            <Text style={ui.sub}>• الشرط: تقييم الشهر 4.0 فأكثر</Text>
            <Text style={ui.sub}>• لا تُحتسب الطلبات الملغاة، ولا أكثر من طلبين يومياً مع الزبون نفسه</Text>
          </View>

          <Text style={[ui.label, { marginTop: 4 }]}>المكافآت السابقة</Text>
          {!d.history?.length && <Text style={[ui.sub, { textAlign: 'center' }]}>لا توجد أشهر منتهية بعد</Text>}
          {(d.history || []).map((h: any, i: number) => (
            <View key={i} style={s.row}>
              <Text style={[s.amt, { color: Number(h.amount) > 0 ? C.ok : C.mute }]}>{Number(h.amount) > 0 ? '+' + money(h.amount) : '—'}</Text>
              <Text style={s.rowT}>شهر {monthName(h.month)} • {money(h.volume)} • {h.pct}%</Text>
              <Text style={s.rowD}>{LEVELS[h.level || 'bronze']?.e}</Text>
            </View>
          ))}
        </>}
      </ScrollView>
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  level: { borderRadius: 18, borderWidth: 1, padding: 16, alignItems: 'center', marginBottom: 10 },
  levelN: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  levelS: { fontSize: 12, color: '#475569', marginTop: 6, textAlign: 'center' },
  bar: { width: '100%', height: 10, borderRadius: 6, backgroundColor: '#e2e8f0', marginTop: 10, overflow: 'hidden', position: 'relative' },
  barIn: { height: '100%', borderRadius: 6, position: 'absolute', right: 0 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#0f172a' },
  days: { fontSize: 12, color: C.mute, fontWeight: '700' },
  line: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  k: { fontSize: 13, color: '#475569' },
  v: { fontSize: 14, fontWeight: '800', color: C.txt },
  tiny: { fontSize: 10, color: C.mute },
  total: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.okBg, borderRadius: 12, padding: 12, marginTop: 12 },
  totalK: { fontWeight: '900', color: C.ok },
  totalV: { fontWeight: '900', fontSize: 22, color: C.ok },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: C.line },
  amt: { fontWeight: '900', fontSize: 14, minWidth: 64, textAlign: 'right' },
  rowT: { flex: 1, textAlign: 'right', fontSize: 12, color: C.txt },
  rowD: { fontSize: 16 },
});
