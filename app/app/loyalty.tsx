import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { fmtWalletId } from '../utils/wallet';
import { useToast } from '../components/Toast';
import { Header, Btn, Sheet, ui, C } from '../components/DriverUI';

const LEVELS: Record<string, { n: string; e: string; c: string; bg: string; min: number }> = {
  bronze: { n: 'برونزي', e: '🥉', c: '#9a3412', bg: '#fff7ed', min: 0 },
  silver: { n: 'فضي', e: '🥈', c: '#475569', bg: '#f1f5f9', min: 101 },
  gold: { n: 'ذهبي', e: '🥇', c: '#a16207', bg: '#fefce8', min: 201 },
  diamond: { n: 'ماسي', e: '💎', c: '#0e7490', bg: '#ecfeff', min: 401 },
};
const NEXT: Record<string, string> = { bronze: 'silver', silver: 'gold', gold: 'diamond' };
const SVC: Record<string, string> = { taxi: 'رحلة تكسي', taxi_shared: 'رحلة مشتركة', cargo: 'نقل', events: 'مناسبة', contracts: 'عقد', rental: 'إيجار', invite: 'دعوة صديق' };
const fmtD = (s: string) => { const d = new Date(s); return `${d.getDate()}/${d.getMonth() + 1}`; };

export default function LoyaltyScreen() {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [amt, setAmt] = useState(100);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('my_loyalty');
    setLoading(false);
    if (error) return toast.show(errMsg(error), 'err');
    setD(data);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const maxRedeem = d ? Math.floor(Number(d.points) / 100) * 100 : 0;
  const redeem = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('redeem_points', { p_points: amt });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show(`تمت إضافة $${(data as any).usd} إلى محفظتك ✓`);
    setSheet(false); load();
  };
  const share = () => d?.invite_code && Share.share({ message: `حمّل تطبيق مشوار وسجّل برمز الدعوة: ${d.invite_code}` }).catch(() => {});

  const L = LEVELS[d?.level || 'bronze'];
  const next = d && NEXT[d.level] ? LEVELS[NEXT[d.level]] : null;
  const lp = Number(d?.level_points || 0);
  const pct = next ? Math.max(0, Math.min(1, (lp - L.min) / (next.min - L.min))) : 1;

  return (
    <View style={ui.page}>
      <Header title="نقاطي" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {!!d && <>
          <View style={[s.level, { backgroundColor: L.bg, borderColor: L.c + '55' }]}>
            <Text style={s.levelE}>{L.e}</Text>
            <Text style={[s.levelN, { color: L.c }]}>المستوى {L.n}</Text>
            <View style={s.bar}><View style={[s.barIn, { width: `${pct * 100}%`, backgroundColor: L.c }]} /></View>
            <Text style={s.levelS}>{next ? `باقي ${Math.max(0, next.min - lp)} نقطة للمستوى ${next.n}` : 'وصلت لأعلى مستوى 🎉'}</Text>
          </View>

          <View style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>🎁 رصيد النقاط</Text>
              <Text style={s.big}>{d.points}</Text>
            </View>
            <Text style={ui.sub}>تساوي ${(Number(d.points) / 100).toFixed(2)} • كل 100 نقطة = 1$</Text>
            <View style={{ marginTop: 10 }}>
              <Btn label="تحويل لرصيد المحفظة" disabled={maxRedeem < 100} onPress={() => { setAmt(Math.min(100, maxRedeem) || 100); setSheet(true); }} />
            </View>
            {maxRedeem < 100 && <Text style={[ui.sub, { textAlign: 'center' }]}>التحويل متاح من 100 نقطة فأكثر</Text>}
          </View>

          <View style={ui.card}>
            <Text style={ui.h}>👥 ادعُ أصدقاءك</Text>
            <Text style={ui.sub}>كل صديق يسجّل برمزك ويُكمل أول طلب = 10 نقاط لك</Text>
            <View style={s.code}><Text style={s.codeT}>{fmtWalletId(d.invite_code)}</Text></View>
            <Btn tone="ghost" label="📤 مشاركة رمز الدعوة" onPress={share} />
            {Number(d.invited) > 0 && <Text style={[ui.sub, { textAlign: 'center' }]}>سجّل برمزك {d.invited} {Number(d.invited) === 1 ? 'صديق' : 'أصدقاء'}</Text>}
          </View>

          <View style={ui.card}>
            <Text style={ui.h}>كيف تجمع النقاط؟</Text>
            <Text style={ui.sub}>• كل 1$ تدفعه = نقطة</Text>
            <Text style={ui.sub}>• كل طلب مكتمل = نقطة إضافية</Text>
            <Text style={ui.sub}>• تُضاف النقاط بعد انتهاء الخدمة، وليس لها تاريخ انتهاء</Text>
          </View>

          <Text style={[ui.label, { marginTop: 4 }]}>السجل</Text>
          {!d.history?.length && <Text style={[ui.sub, { textAlign: 'center' }]}>لا توجد نقاط بعد — يبدأ العدّاد مع أول طلب مكتمل</Text>}
          {(d.history || []).map((h: any, i: number) => (
            <View key={i} style={s.row}>
              <Text style={[s.pts, { color: h.points < 0 ? C.err : C.ok }]}>{h.points > 0 ? '+' : ''}{h.points}</Text>
              <Text style={s.rowT}>{h.kind === 'redeem' ? `تحويل لرصيد $${h.amount}` : (SVC[h.service] || 'نقاط') + (h.amount && h.kind === 'earn' ? ` • $${Number(h.amount)}` : '')}</Text>
              <Text style={s.rowD}>{fmtD(h.at)}</Text>
            </View>
          ))}
        </>}
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="تحويل النقاط لرصيد">
        <View style={s.step}>
          <Pressable onPress={() => setAmt(a => Math.min(maxRedeem, a + 100))} style={s.stepB}><Text style={s.stepT}>+</Text></Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.big}>{amt}</Text>
            <Text style={ui.sub}>نقطة = ${(amt / 100).toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => setAmt(a => Math.max(100, a - 100))} style={s.stepB}><Text style={s.stepT}>−</Text></Pressable>
        </View>
        {maxRedeem > 100 && <Pressable onPress={() => setAmt(maxRedeem)}><Text style={s.all}>الكل ({maxRedeem})</Text></Pressable>}
        <Text style={[ui.sub, { textAlign: 'center', marginVertical: 8 }]}>يبقى مستواك {L.n}، ويعود عدّاد المستوى إلى بدايته.</Text>
        <Btn label={`تحويل $${(amt / 100).toFixed(2)}`} loading={busy} onPress={redeem} />
      </Sheet>
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  level: { borderRadius: 18, borderWidth: 1, padding: 16, alignItems: 'center', marginBottom: 10 },
  levelE: { fontSize: 44 },
  levelN: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  bar: { width: '100%', height: 10, borderRadius: 6, backgroundColor: '#e2e8f0', marginTop: 12, overflow: 'hidden' },
  barIn: { height: '100%', borderRadius: 6 },
  levelS: { fontSize: 12, color: '#475569', marginTop: 6 },
  big: { fontSize: 26, fontWeight: '900', color: C.txt },
  code: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 12, alignItems: 'center', marginVertical: 10 },
  codeT: { fontSize: 24, fontWeight: '900', letterSpacing: 3, color: C.brand },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: C.line },
  pts: { fontWeight: '900', fontSize: 15, minWidth: 50, textAlign: 'right' },
  rowT: { flex: 1, textAlign: 'right', fontSize: 13, color: C.txt },
  rowD: { fontSize: 11, color: C.mute },
  step: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginTop: 6 },
  stepB: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  stepT: { fontSize: 24, fontWeight: '900', color: C.brand },
  all: { textAlign: 'center', color: C.brand, fontWeight: '800', marginTop: 8 },
});
