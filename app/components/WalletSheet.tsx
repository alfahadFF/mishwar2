import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { Wallet, money, txLabel } from '../utils/wallet';
import { fmtDateTime } from '../utils/events';


export default function WalletSheet({ visible, wallet, onClose }: { visible: boolean; wallet: Wallet | null; onClose: () => void }) {
  const router = useRouter();
  const [tx, setTx] = useState<any[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    setTx(null);
    supabase.rpc('my_wallet_transactions', { p_limit: 30 }).then(({ data }) => setTx((data || []) as any[]));
  }, [visible]);
  const free = Number(wallet?.free_days_left || 0) > 0;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.back} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grab} />
        <Text style={s.h}>المحفظة</Text>
        <View style={[s.bal, (Number(wallet?.balance) < 0) ? s.balNeg : null]}>
          <Text style={s.balL}>الرصيد الحالي</Text>
          <Text style={[s.balV, (Number(wallet?.balance) < 0) ? { color: '#b91c1c' } : null]}>{money(wallet?.balance)}</Text>
          {(Number(wallet?.balance) < 0) && <Text style={s.warn}>الرصيد سالب، توقف ظهور الطلبات حتى الشحن</Text>}
        </View>
        {free && (
          <View style={s.free}>
            <Text style={s.freeT}>الفترة المجانية: متبقٍ {wallet?.free_days_left} يوم</Text>
            <Text style={s.freeS}>بدون عمولة حتى {fmtDateTime(wallet?.free_until).slice(0, 10)}، ثم عمولة 12% من السعر المتفق عليه</Text>
          </View>
        )}
        <Text style={s.sub}>الحركات</Text>
        {!tx ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
          <ScrollView style={{ maxHeight: 320 }}>
            {tx.length === 0 && <Text style={s.empty}>لا توجد حركات بعد</Text>}
            {tx.map(t => (
              <View key={t.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowT}>{txLabel(t)}</Text>
                  <Text style={s.rowS}>{fmtDateTime(t.created_at)}{t.gross ? ` • السعر ${money(t.gross)}` : ''}</Text>
                </View>
                <Text style={[s.amt, { color: Number(t.amount) < 0 ? '#b91c1c' : '#047857' }]}>{Number(t.amount) > 0 ? '+' : ''}{money(t.amount)}</Text>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <Pressable onPress={() => { onClose(); router.push('/wallet' as any); }} style={[s.close, { flex: 1, backgroundColor: '#4F46E5' }]}><Text style={[s.closeT, { color: '#fff' }]}>إضافة رصيد وتحويل</Text></Pressable>
          <Pressable onPress={onClose} style={[s.close, { flex: 1 }]}><Text style={s.closeT}>إغلاق</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(15,23,42,.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 26 },
  grab: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 10 },
  h: { fontSize: 17, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  bal: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 14, alignItems: 'center' },
  balNeg: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  balL: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  balV: { fontSize: 28, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  warn: { fontSize: 12, color: '#b91c1c', fontWeight: '800', marginTop: 6, textAlign: 'center' },
  free: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 14, padding: 12, marginTop: 10 },
  freeT: { fontWeight: '900', color: '#065f46', textAlign: 'right' },
  freeS: { fontSize: 12, color: '#047857', marginTop: 3, textAlign: 'right' },
  sub: { fontWeight: '900', marginTop: 14, marginBottom: 6, textAlign: 'right' },
  empty: { textAlign: 'center', color: '#94a3b8', paddingVertical: 20 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 10 },
  rowT: { fontWeight: '800', textAlign: 'right' },
  rowS: { fontSize: 11, color: '#64748b', textAlign: 'right', marginTop: 2 },
  amt: { fontWeight: '900', fontSize: 15 },
  close: { marginTop: 14, height: 46, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  closeT: { fontWeight: '900' },
});
