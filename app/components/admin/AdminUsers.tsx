import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { supabase } from '../../utils/supabase';
import { errMsg } from '../../utils/errors';
import { money, fmtWalletId } from '../../utils/wallet';
import { TYPE_NAME, fmtD } from '../../utils/admin';
import { useToast } from '../Toast';
import { Pill, Empty, Row, Btn, Sheet, CallBtn, ui, C } from '../DriverUI';

// البحث عن مستخدم بالهاتف أو المعرّف، وإيقاف الحساب أو إلغاء إيقافه
export default function AdminUsers({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [u, setU] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const find = async (query = q) => {
    const v = query.trim();
    if (v.length < 6) return toast.show('أدخل رقم الهاتف أو المعرّف', 'err');
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_user', { p_query: v });
    setLoading(false);
    if (error) { setU(null); return toast.show(errMsg(error), 'err'); }
    setU(data);
  };
  const suspend = async () => {
    if (!reason.trim()) return toast.show('اكتب سبب الإيقاف', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('admin_suspend_user', { p_user: u.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setSheet(false); setReason(''); toast.show('تم إيقاف الحساب'); find(u.wallet_id || q); onChange();
  };
  const unsuspend = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_unsuspend_user', { p_user: u.id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم إلغاء الإيقاف'); find(u.wallet_id || q); onChange();
  };

  const r = u?.rating;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <TextInput value={q} onChangeText={setQ} placeholder="رقم الهاتف أو المعرّف" placeholderTextColor="#94a3b8"
            style={[ui.input, { flex: 1 }]} onSubmitEditing={() => find()} returnKeyType="search" autoCapitalize="characters" />
          <View style={{ width: 90 }}><Btn label="بحث" loading={loading} onPress={() => find()} /></View>
        </View>

        {!u ? <Empty icon="🔎" title="ابحث عن مستخدم" sub="بالهاتف أو المعرّف" /> : (
          <View style={[ui.card, { marginTop: 12 }]}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{u.office_name || u.full_name || fmtWalletId(u.wallet_id)}</Text>
              {u.deleted ? <Pill text="محذوف" tone="mute" /> : u.suspended ? <Pill text="موقوف" tone="err" /> : <Pill text="فعّال" tone="ok" />}
            </View>
            <View style={{ marginTop: 6 }}>
              <Row k="المعرّف" v={fmtWalletId(u.wallet_id)} />
              <Row k="الهاتف" v={u.phone || '—'} />
              <Row k="النوع" v={(TYPE_NAME[u.type] || u.type) + (u.is_admin ? ' • إدارة' : '')} />
              <Row k="الرصيد" v={`$${money(u.balance)}`} strong />
              <Row k="الطلبات المكتملة" v={String(u.orders ?? 0)} />
              {u.work && <Row k="التقييم" v={r && r.n ? `${Number(r.avg).toFixed(1)} ⭐ (${r.n})` : 'لا يوجد'} />}
              {u.work && <Row k="التحقق" v={u.verified ? 'تم التحقق' : 'بانتظار التحقق'} />}
              {u.taxi_suspended && <Row k="التكسي" v="موقوف بسبب الإلغاءات" />}
              <Row k="تاريخ التسجيل" v={fmtD(u.registered_at)} />
              {u.suspended && <Row k="سبب الإيقاف" v={u.suspend_reason || '—'} />}
              {u.suspended && <Row k="تاريخ الإيقاف" v={fmtD(u.suspended_at)} />}
            </View>
            {!u.deleted && !u.is_admin && (
              <View style={ui.btns}>
                {u.suspended ? <Btn label="إلغاء الإيقاف" tone="ok" loading={busy} onPress={unsuspend} />
                  : <Btn label="إيقاف الحساب" tone="err" onPress={() => { setReason(''); setSheet(true); }} />}
                {!!u.phone && <CallBtn phone={u.phone} />}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="إيقاف الحساب">
        <Text style={ui.label}>سبب الإيقاف</Text>
        <TextInput value={reason} onChangeText={setReason} placeholder="يظهر السبب للمستخدم" placeholderTextColor="#94a3b8" multiline maxLength={200}
          style={[ui.input, { height: 80, paddingTop: 10, textAlignVertical: 'top' }]} />
        <Text style={ui.note}>الموقوف لا يستطيع طلب أو قبول أي خدمة حتى إلغاء الإيقاف، ويصله إشعار بالسبب.</Text>
        <View style={ui.btns}>
          <Btn label="تأكيد الإيقاف" tone="err" loading={busy} onPress={suspend} />
          <Btn label="رجوع" tone="ghost" onPress={() => setSheet(false)} />
        </View>
        {toast.node}
      </Sheet>
      {!sheet && toast.node}
    </View>
  );
}
