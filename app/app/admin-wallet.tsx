import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { money, txLabel, fmtWalletId, fmtCard } from '../utils/wallet';
import { errMsg } from '../utils/errors';
import { fmtDateTime } from '../utils/events';
import { useToast } from '../components/Toast';
import { Header, Pill, Tabs, Empty, Row, Btn, Sheet, ui, C } from '../components/DriverUI';

// لوحة المدير: المستخدمين (تسوية، إعادة تعيين الرمز)، بطاقات الشحن، التقرير
export default function AdminWalletScreen() {
  const router = useRouter();
  const toast = useToast();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState('users');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // المستخدمين
  const [q, setQ] = useState('');
  const [u, setU] = useState<any>(null);
  const [adjSign, setAdjSign] = useState<1 | -1>(1);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjConfirm, setAdjConfirm] = useState(false);

  // البطاقات
  const [batches, setBatches] = useState<any[] | null>(null);
  const [cAmount, setCAmount] = useState('');
  const [cCount, setCCount] = useState('');
  const [cBatch, setCBatch] = useState('');
  const [newCodes, setNewCodes] = useState<{ code: string; amount: number }[] | null>(null);
  const [disableCode, setDisableCode] = useState('');

  // التقرير
  const [report, setReport] = useState<any>(null);

  const loadBatches = useCallback(async () => { const { data } = await supabase.rpc('admin_topup_batches'); setBatches((data || []) as any[]); }, []);
  const loadReport = useCallback(async () => { const { data } = await supabase.rpc('admin_wallet_report', {}); setReport(data); }, []);

  useEffect(() => {
    supabase.rpc('my_wallet').then(({ data }) => {
      const ok = !!data?.is_admin;
      setAllowed(ok);
      if (ok) { loadBatches(); loadReport(); }
    });
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadBatches(), loadReport(), u ? findUser(u.wallet_id) : Promise.resolve()]);
    setRefreshing(false);
  };

  const findUser = async (query?: string) => {
    const v = (query ?? q).replace(/\D/g, '');
    if (v.length < 8) return toast.show('أدخل معرّف المحفظة أو رقم الهاتف', 'err');
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_find_user', { p_query: v });
    setBusy(false);
    if (error) { setU(null); return toast.show(errMsg(error), 'err'); }
    setU(data);
  };
  const adjNum = Number(adjAmount.replace(',', '.'));
  const doAdjust = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_wallet_adjust', { p_user: u.id, p_amount: adjSign * adjNum, p_note: adjNote.trim() });
    setBusy(false); setAdjConfirm(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show(`تمت التسوية. الرصيد الآن ${money(data.balance)}`);
    setAdjAmount(''); setAdjNote('');
    findUser(u.wallet_id); loadReport();
  };
  const resetPin = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_reset_wallet_pin', { p_user: u.id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تمت إعادة تعيين الرمز السري. ينشئ المستخدم رمزاً جديداً عند أول عملية');
    findUser(u.wallet_id);
  };

  const createCards = async () => {
    const amount = Number(cAmount), count = parseInt(cCount, 10);
    if (!(amount > 0)) return toast.show('أدخل قيمة البطاقة', 'err');
    if (!(count >= 1 && count <= 1000)) return toast.show('العدد من 1 إلى 1000', 'err');
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_create_topup_cards', { p_amount: amount, p_count: count, p_batch: cBatch.trim() || null });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setNewCodes((data || []) as any[]);
    setCAmount(''); setCCount(''); setCBatch('');
    loadBatches();
  };
  const disableCard = async () => {
    const code = disableCode.replace(/\D/g, '');
    if (code.length !== 14) return toast.show('رقم البطاقة 14 رقماً', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('admin_disable_topup_card', { p_code: code });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم تعطيل البطاقة');
    setDisableCode(''); loadBatches();
  };

  if (allowed === false) {
    return (
      <View style={ui.page}>
        <Header title="إدارة المحافظ" onBack={() => router.back()} />
        <Empty icon="🔐" title="هذه الصفحة للمدير فقط" />
      </View>
    );
  }

  return (
    <View style={ui.page}>
      <Header title="إدارة المحافظ" onBack={() => router.back()} />
      <Tabs value={tab} onChange={setTab} tabs={[{ k: 'users', label: 'المستخدمون' }, { k: 'cards', label: 'البطاقات' }, { k: 'report', label: 'التقرير' }]} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {tab === 'users' && <>
          <View style={ui.card}>
            <Text style={[ui.label, { marginTop: 0 }]}>معرّف المحفظة أو رقم الهاتف</Text>
            <TextInput value={q} onChangeText={v => setQ(v.replace(/[^\d+ ]/g, ''))} keyboardType="phone-pad" placeholder="1234 5678 أو 09xxxxxxxx" style={ui.input} />
            <View style={ui.btns}><Btn label="بحث" onPress={() => findUser()} loading={busy && !u} /></View>
          </View>
          {u && <>
            <View style={ui.card}>
              <View style={ui.cardTop}>
                <Text style={ui.h}>{u.name || 'بدون اسم'}</Text>
                <Pill text={u.has_pin ? 'لديه رمز سري' : 'بدون رمز'} tone={u.has_pin ? 'ok' : 'mute'} />
              </View>
              <Row k="معرّف المحفظة" v={fmtWalletId(u.wallet_id)} />
              <Row k="الهاتف" v={u.phone || '—'} />
              <Row k="الرصيد" v={money(u.balance)} strong />
              {u.has_pin && <View style={ui.btns}><Btn small tone="ghost" label="إعادة تعيين الرمز السري" onPress={resetPin} loading={busy} /></View>}
            </View>
            <View style={ui.card}>
              <Text style={[ui.h, { fontSize: 14 }]}>تسوية يدوية</Text>
              <View style={ui.btns}>
                <Btn small label="إضافة +" tone={adjSign === 1 ? 'ok' : 'ghost'} onPress={() => setAdjSign(1)} />
                <Btn small label="خصم −" tone={adjSign === -1 ? 'err' : 'ghost'} onPress={() => setAdjSign(-1)} />
              </View>
              <Text style={ui.label}>المبلغ</Text>
              <TextInput value={adjAmount} onChangeText={v => setAdjAmount(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" placeholder="0" style={ui.input} />
              <Text style={ui.label}>السبب</Text>
              <TextInput value={adjNote} onChangeText={setAdjNote} maxLength={120} placeholder="مثال: استرجاع دفعة بالخطأ" style={ui.input} />
              <View style={ui.btns}><Btn label="متابعة" onPress={() => {
                if (!(adjNum > 0)) return toast.show('أدخل مبلغاً صحيحاً', 'err');
                if (!adjNote.trim()) return toast.show('اكتب سبب التسوية', 'err');
                setAdjConfirm(true);
              }} /></View>
            </View>
            {!!u.last_tx?.length && <View style={[ui.card, { paddingVertical: 4 }]}>
              <Text style={[ui.h, { fontSize: 14, marginTop: 8 }]}>آخر الحركات</Text>
              {u.last_tx.map((t: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row-reverse', paddingVertical: 8, borderBottomWidth: i === u.last_tx.length - 1 ? 0 : 1, borderBottomColor: '#f1f5f9' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', textAlign: 'right', fontSize: 13 }}>{txLabel(t)}</Text>
                    <Text style={ui.sub}>{fmtDateTime(t.created_at)}{t.note ? ` • ${t.note}` : ''}</Text>
                  </View>
                  <Text style={{ fontWeight: '900', color: Number(t.amount) < 0 ? C.err : C.ok }}>{Number(t.amount) > 0 ? '+' : ''}{money(t.amount)}</Text>
                </View>
              ))}
            </View>}
          </>}
        </>}

        {tab === 'cards' && <>
          <View style={ui.card}>
            <Text style={[ui.h, { fontSize: 14 }]}>إنشاء دفعة بطاقات</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              <View style={{ flex: 1 }}><Text style={ui.label}>قيمة البطاقة</Text>
                <TextInput value={cAmount} onChangeText={v => setCAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="100" style={ui.input} /></View>
              <View style={{ flex: 1 }}><Text style={ui.label}>العدد</Text>
                <TextInput value={cCount} onChangeText={v => setCCount(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="50" style={ui.input} /></View>
            </View>
            <Text style={ui.label}>اسم الدفعة (اختياري)</Text>
            <TextInput value={cBatch} onChangeText={setCBatch} maxLength={40} placeholder="مثال: دفعة تشرين 1" style={ui.input} />
            <View style={ui.btns}><Btn label="إنشاء البطاقات" onPress={createCards} loading={busy} /></View>
          </View>
          <View style={ui.card}>
            <Text style={[ui.h, { fontSize: 14 }]}>تعطيل بطاقة مفقودة</Text>
            <TextInput value={fmtCard(disableCode)} onChangeText={v => setDisableCode(v.replace(/\D/g, '').slice(0, 14))} keyboardType="number-pad"
              placeholder="0000 0000 0000 00" maxLength={17} style={[ui.input, { marginTop: 8, letterSpacing: 2, textAlign: 'center' }]} />
            <View style={ui.btns}><Btn label="تعطيل" tone="err" onPress={disableCard} loading={busy} disabled={disableCode.length !== 14} /></View>
          </View>
          <Text style={[ui.h, { fontSize: 14, marginVertical: 8 }]}>الدفعات</Text>
          {!batches ? <Text style={ui.note}>جاري التحميل…</Text> : batches.length === 0 ? <Empty icon="💳" title="لا توجد بطاقات بعد" /> : batches.map((b, i) => (
            <View key={i} style={ui.card}>
              <View style={ui.cardTop}><Text style={ui.h}>{b.batch}</Text><Pill text={`قيمة ${money(b.amount)}`} tone="brand" /></View>
              <View style={ui.metrics}>
                <View style={ui.metric}><Text style={ui.metricV}>{b.total}</Text><Text style={ui.metricK}>الكل</Text></View>
                <View style={ui.metric}><Text style={[ui.metricV, { color: C.ok }]}>{b.used}</Text><Text style={ui.metricK}>مستخدمة</Text></View>
                <View style={ui.metric}><Text style={ui.metricV}>{Number(b.total) - Number(b.used) - Number(b.disabled)}</Text><Text style={ui.metricK}>متاحة</Text></View>
                <View style={ui.metric}><Text style={[ui.metricV, { color: C.err }]}>{b.disabled}</Text><Text style={ui.metricK}>معطّلة</Text></View>
              </View>
              <Text style={ui.sub}>{fmtDateTime(b.created_at)}</Text>
            </View>
          ))}
        </>}

        {tab === 'report' && (!report ? <Text style={ui.note}>جاري التحميل…</Text> : <>
          <Text style={[ui.sub, { marginBottom: 8 }]}>من {report.from} إلى {report.to}</Text>
          <View style={ui.card}>
            <Row k="العمولات المحصّلة" v={money(report.commissions)} />
            <Row k="خصومات الدفع من التطبيق" v={`−${money(report.discounts)}`} />
            <Row k="صافي الإيراد" v={money(report.net_revenue)} strong />
          </View>
          <View style={ui.card}>
            <Row k="شحن البطاقات" v={money(report.card_topups)} />
            <Row k="الدفعات عبر التطبيق" v={money(report.payments)} />
            <Row k="التحويلات بين المستخدمين" v={money(report.transfers)} />
            <Row k="التسويات اليدوية" v={money(report.adjustments)} />
          </View>
          <View style={ui.card}>
            <Row k="مجموع أرصدة المستخدمين" v={money(report.total_balances)} strong />
            <Row k="مجموع الديون (أرصدة سالبة)" v={money(report.total_debt)} />
          </View>
        </>)}
      </ScrollView>

      {/* تأكيد التسوية */}
      <Sheet visible={adjConfirm} onClose={() => setAdjConfirm(false)} title="تأكيد التسوية">
        {u && <>
          <Row k="المستخدم" v={u.name} />
          <Row k="العملية" v={adjSign === 1 ? 'إضافة' : 'خصم'} />
          <Row k="المبلغ" v={money(adjNum)} strong />
          <Row k="الرصيد بعد التسوية" v={money(Number(u.balance) + adjSign * adjNum)} />
          <Row k="السبب" v={adjNote} />
          <View style={ui.btns}>
            <Btn label="تأكيد" tone={adjSign === 1 ? 'ok' : 'err'} onPress={doAdjust} loading={busy} />
            <Btn label="رجوع" tone="ghost" onPress={() => setAdjConfirm(false)} />
          </View>
        </>}
      </Sheet>

      {/* أرقام البطاقات الجديدة */}
      <Sheet visible={!!newCodes} onClose={() => setNewCodes(null)} title={`تم إنشاء ${newCodes?.length || 0} بطاقة`}>
        <Text style={ui.note}>انسخ الأرقام الآن للطباعة. لا تظهر مرة أخرى في التطبيق.</Text>
        <ScrollView style={{ maxHeight: 360, marginTop: 8 }}>
          <Text selectable style={{ fontFamily: 'monospace', fontSize: 15, lineHeight: 26, textAlign: 'center', color: C.txt }}>
            {(newCodes || []).map(c => `${fmtCard(c.code)}  —  ${money(c.amount)}`).join('\n')}
          </Text>
        </ScrollView>
        <View style={ui.btns}><Btn label="تم" onPress={() => setNewCodes(null)} /></View>
      </Sheet>

      {toast.node}
    </View>
  );
}
