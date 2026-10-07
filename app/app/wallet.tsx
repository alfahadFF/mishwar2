import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../utils/supabase';
import { useWallet, money, txLabel, fmtWalletId, fmtCard, SVC_NAME } from '../utils/wallet';
import { errMsg } from '../utils/errors';
import { formatWalletUsd } from '../utils/taxi-pricing';
import { fmtDateTime } from '../utils/events';
import { useToast } from '../components/Toast';
import PinPad from '../components/PinPad';
import { Header, Pill, Empty, Row, Btn, Sheet, ui, C } from '../components/DriverUI';

type Payable = { service: string; ref_id: string; period: number; title: string; done_at?: string; payee_name?: string; gross: number; discount_pct: number; discount: number; to_pay: number };
const payableMoney = (p: Payable, amount: number) => p.service === 'taxi' ? formatWalletUsd(amount) : money(amount);

export default function WalletScreen() {
  const router = useRouter();
  const toast = useToast();
  const { wallet, refresh } = useWallet();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isDriver, setIsDriver] = useState(false);
  const [tx, setTx] = useState<any[] | null>(null);
  const [payables, setPayables] = useState<Payable[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [topupOpen, setTopupOpen] = useState(false);
  const [card, setCard] = useState('');

  const [trOpen, setTrOpen] = useState(false);
  const [trQuery, setTrQuery] = useState('');
  const [trUser, setTrUser] = useState<{ wallet_id: string; name: string } | null>(null);
  const [trAmount, setTrAmount] = useState('');
  const [trNote, setTrNote] = useState('');

  const [payFor, setPayFor] = useState<Payable | null>(null);
  // فتح الدفع مباشرة عند القدوم من شاشة الرحلة: /wallet?pay=taxi:<id>
  const { pay: payParam } = useLocalSearchParams<{ pay?: string }>();
  const [payParamUsed, setPayParamUsed] = useState(false);
  useEffect(() => {
    if (payParamUsed || !payParam || !payables) return;
    setPayParamUsed(true);
    const [svc, ref] = String(payParam).split(':');
    const hit = payables.find(p => p.service === svc && p.ref_id === ref);
    if (hit) setPayFor(hit); else toast.show(errMsg('ALREADY_PAID'), 'err');
  }, [payParam, payables, payParamUsed]);

  // الرمز السري
  type PinMode = 'enter' | 'old' | 'create1' | 'create2';
  type PinAction = { type: 'transfer' } | { type: 'pay'; p: Payable } | { type: 'change' };
  const [pinMode, setPinMode] = useState<PinMode | null>(null);
  const [pinAction, setPinAction] = useState<PinAction | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [oldPin, setOldPin] = useState<string | null>(null);
  const [newPin, setNewPin] = useState<string | null>(null);

  const loadTx = useCallback(async () => { const { data } = await supabase.rpc('my_wallet_transactions', { p_limit: 50 }); setTx((data || []) as any[]); }, []);
  const loadPayables = useCallback(async () => { const { data } = await supabase.rpc('my_payables'); setPayables((data || []) as any[]); }, []);
  const loadAll = useCallback(async () => { await Promise.all([refresh(), loadTx(), loadPayables()]); }, [refresh, loadTx, loadPayables]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(!!data.user);
      if (!data.user) return;
      loadTx(); loadPayables();
      supabase.rpc('my_driver_profile').then(({ data: p }) => setIsDriver(!!(p?.vehicle_class || p?.event_vehicle_type)));
    });
  }, []);

  const onRefresh = async () => { setRefreshing(true); await loadAll(); setRefreshing(false); };
  const balance = Number(wallet?.balance || 0);
  const pct = Number(wallet?.discount_pct || 0);
  const limit = Number(wallet?.transfer_limit || 0);
  const limitLeft = Math.max(limit - Number(wallet?.transferred_today || 0), 0);

  // شحن ببطاقة
  const redeem = async () => {
    const code = card.replace(/\D/g, '');
    if (code.length !== 14) return toast.show('رقم البطاقة 14 رقماً', 'err');
    setBusy(true);
    const { data, error } = await supabase.rpc('redeem_topup_card', { p_code: code });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    if (data?.error) return toast.show(errMsg(data.error), 'err');
    setTopupOpen(false); setCard('');
    toast.show(`تمت إضافة ${money(data.amount)} إلى رصيدك`);
    loadAll();
  };

  // تحويل رصيد
  const closeTransfer = () => { setTrOpen(false); setTrUser(null); setTrQuery(''); setTrAmount(''); setTrNote(''); };
  const findUser = async () => {
    const q = trQuery.replace(/\D/g, '');
    if (q.length < 8) return toast.show('أدخل معرّف المحفظة (8 أرقام) أو رقم الهاتف', 'err');
    setBusy(true);
    const { data, error } = await supabase.rpc('wallet_find_user', { p_query: q });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setTrUser(data);
  };
  const amountNum = Number(trAmount.replace(',', '.'));
  const sendTransfer = () => {
    if (!trUser) return;
    if (!(amountNum > 0)) return toast.show('أدخل مبلغاً صحيحاً', 'err');
    if (amountNum > balance) return toast.show('رصيدك لا يكفي', 'err');
    if (limit > 0 && amountNum > limitLeft) return toast.show(`تجاوزت حد التحويل اليومي. المتبقي اليوم: ${money(limitLeft)}`, 'err');
    requirePin({ type: 'transfer' });
  };

  // الدفع من التطبيق
  const pay = () => { if (payFor) requirePin({ type: 'pay', p: payFor }); };

  const closePin = () => { setPinMode(null); setPinAction(null); setPinErr(null); setOldPin(null); setNewPin(null); setPinBusy(false); };
  const requirePin = (action: PinAction) => {
    if (wallet?.pin_locked_until && new Date(wallet.pin_locked_until) > new Date()) return toast.show(errMsg('PIN_LOCKED'), 'err');
    setPinAction(action); setPinErr(null);
    setPinMode(action.type === 'change' ? 'old' : wallet?.has_pin ? 'enter' : 'create1');
  };

  // تنفيذ التحويل أو الدفع بعد إدخال الرمز
  const runAction = async (action: PinAction, pin: string) => {
    setPinBusy(true);
    let res: { data: any; error: any };
    if (action.type === 'transfer') {
      res = await supabase.rpc('wallet_transfer', { p_to: trUser!.wallet_id, p_amount: amountNum, p_note: trNote.trim() || null, p_pin: pin });
    } else if (action.type === 'pay') {
      res = await supabase.rpc('pay_from_wallet', { p_service: action.p.service, p_ref: action.p.ref_id, p_period: action.p.period, p_pin: pin });
    } else return;
    setPinBusy(false);
    const { data, error } = res;
    const code: string | undefined = data?.error;
    if (code === 'PIN_WRONG' || code === 'PIN_ENTER') { setPinMode('enter'); return setPinErr(errMsg(code)); }
    if (code === 'PIN_REQUIRED') { setPinErr(null); return setPinMode('create1'); }
    closePin();
    if (code === 'PIN_LOCKED') { refresh(); return toast.show(errMsg(code), 'err'); }
    if (code === 'DAILY_LIMIT') return toast.show(`تجاوزت حد التحويل اليومي. المتبقي اليوم: ${money(data.left)}`, 'err');
    if (error) { if (action.type === 'pay') setPayFor(null); loadAll(); return toast.show(errMsg(error), 'err'); }
    if (action.type === 'transfer') {
      const name = trUser?.name;
      closeTransfer();
      toast.show(`تم تحويل ${money(amountNum)} إلى ${name}`);
    } else {
      setPayFor(null);
      toast.show(Number(data?.discount) > 0 ? `تم الدفع ووفّرت ${money(data.discount)}` : 'تم الدفع');
    }
    loadAll();
  };

  const onPin = async (pin: string) => {
    if (!pinMode || !pinAction) return;
    setPinErr(null);
    if (pinMode === 'enter') return runAction(pinAction, pin);
    if (pinMode === 'old') { setOldPin(pin); return setPinMode('create1'); }
    if (pinMode === 'create1') { setNewPin(pin); return setPinMode('create2'); }
    if (pin !== newPin) { setNewPin(null); setPinMode('create1'); return setPinErr('الرمزان غير متطابقين، أعد المحاولة'); }
    setPinBusy(true);
    const { data, error } = await supabase.rpc('set_wallet_pin', { p_new: pin, p_old: oldPin });
    setPinBusy(false);
    if (error) { setNewPin(null); setPinMode('create1'); return setPinErr(errMsg(error)); }
    if (data?.error) {
      if (data.error === 'PIN_LOCKED') { closePin(); refresh(); return toast.show(errMsg('PIN_LOCKED'), 'err'); }
      setOldPin(null); setNewPin(null); setPinMode('old'); return setPinErr('الرمز الحالي غير صحيح');
    }
    await refresh();
    if (pinAction.type === 'change') { closePin(); return toast.show(oldPin ? 'تم تغيير الرمز السري' : 'تم إنشاء الرمز السري'); }
    runAction(pinAction, pin);
  };
  const pinTitle = pinMode === 'enter' ? 'أدخل الرمز السري' : pinMode === 'old' ? 'أدخل الرمز الحالي'
    : pinMode === 'create1' ? (pinAction?.type === 'change' && oldPin ? 'أدخل الرمز الجديد' : 'أنشئ رمزاً سرياً للمحفظة') : 'أكّد الرمز السري';
  const pinSub = pinMode === 'enter'
    ? (pinAction?.type === 'transfer' ? `تحويل ${money(amountNum)} إلى ${trUser?.name || ''}` : pinAction?.type === 'pay' ? `دفع ${money(pinAction.p.to_pay)}` : undefined)
    : pinMode === 'create1' ? '4 أرقام تُطلب قبل كل تحويل أو دفع' : undefined;


  if (authed === false) {
    return (
      <View style={ui.page}>
        <Header title="المحفظة" onBack={() => router.back()} />
        <Empty icon="👛" title="سجّل الدخول لعرض محفظتك" />
        {toast.node}
      </View>
    );
  }

  return (
    <View style={ui.page}>
      <Header title="المحفظة" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* الرصيد */}
        <View style={[s.balCard, (Number(wallet?.balance) < 0) && s.balNeg]}>
          <Text style={s.balL}>الرصيد الحالي • USD</Text>
          <Text style={[s.balV, (Number(wallet?.balance) < 0) && { color: C.err }]}>{wallet ? formatWalletUsd(balance) : '—'}</Text>
          <Text style={s.idT}>معرّف المحفظة: <Text style={s.idV}>{fmtWalletId(wallet?.wallet_id)}</Text></Text>
          {(Number(wallet?.balance) < 0) && <Text style={s.neg}>الرصيد سالب، اشحن لمتابعة استقبال الطلبات</Text>}
          <View style={s.actions}>
            <Pressable onPress={() => setTopupOpen(true)} style={[s.act, { backgroundColor: C.brand }]}><Text style={s.actI}>＋</Text><Text style={[s.actT, { color: '#fff' }]}>إضافة رصيد</Text></Pressable>
            <Pressable onPress={() => setTrOpen(true)} style={[s.act, { backgroundColor: '#eef2ff' }]}><Text style={[s.actI, { color: C.brand }]}>⇄</Text><Text style={[s.actT, { color: C.brand }]}>تحويل رصيد</Text></Pressable>
          </View>
        </View>

        {pct > 0 && (
          <View style={[ui.banner, { backgroundColor: C.okBg, borderColor: '#a7f3d0' }]}>
            <Text style={{ color: C.ok, fontWeight: '900', textAlign: 'right' }}>ادفع من التطبيق ووفّر {pct}% من قيمة كل طلب</Text>
          </View>
        )}
        {isDriver && Number(wallet?.free_days_left || 0) > 0 && (
          <View style={[ui.banner, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
            <Text style={{ color: '#166534', fontWeight: '800', textAlign: 'right' }}>الفترة المجانية: متبقٍ {wallet?.free_days_left} يوم بدون عمولة</Text>
          </View>
        )}

        <View style={[ui.card, { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }]}>
          <Text style={{ fontSize: 20 }}>🔒</Text>
          <View style={{ flex: 1 }}>
            <Text style={[ui.h, { fontSize: 14 }]}>الرمز السري</Text>
            <Text style={ui.sub}>{wallet?.has_pin ? 'يُطلب قبل كل تحويل أو دفع' : 'لم يُنشأ بعد، يُطلب عند أول تحويل أو دفع'}{limit > 0 ? ` • حد التحويل اليومي ${money(limit)}` : ''}</Text>
          </View>
          <Btn small tone="ghost" label={wallet?.has_pin ? 'تغيير' : 'إنشاء'} onPress={() => wallet?.has_pin ? requirePin({ type: 'change' }) : (setPinAction({ type: 'change' }), setPinErr(null), setPinMode('create1'))} />
        </View>
        {wallet?.is_admin && (
          <Pressable onPress={() => router.push('/admin-wallet' as any)} style={[ui.banner, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]}>
            <Text style={{ color: C.brand, fontWeight: '900', textAlign: 'right' }}>🛠️ إدارة المحافظ والبطاقات ←</Text>
          </Pressable>
        )}

        {/* بانتظار الدفع */}
        {!!payables?.length && <>
          <Text style={s.sec}>بانتظار الدفع</Text>
          {payables.map(p => (
            <View key={`${p.service}-${p.ref_id}-${p.period}`} style={ui.card}>
              <View style={ui.cardTop}>
                <Text style={ui.h}>{p.title}</Text>
                <Pill text={SVC_NAME[p.service] || p.service} tone="brand" />
              </View>
              {!!p.payee_name && <Text style={ui.sub}>إلى: {p.payee_name}</Text>}
              {!!p.done_at && <Text style={ui.sub}>{fmtDateTime(p.done_at)}</Text>}
              <View style={ui.metrics}>
                <View style={ui.metric}><Text style={ui.metricV}>{payableMoney(p,p.gross)}</Text><Text style={ui.metricK}>السعر المتفق عليه</Text></View>
                {Number(p.discount) > 0 && <View style={ui.metric}><Text style={[ui.metricV, { color: C.ok }]}>−{payableMoney(p,p.discount)}</Text><Text style={ui.metricK}>خصم {p.discount_pct}%</Text></View>}
                <View style={ui.metric}><Text style={[ui.metricV, { color: C.brand }]}>{payableMoney(p,p.to_pay)}</Text><Text style={ui.metricK}>تدفع</Text></View>
              </View>
              <View style={ui.btns}><Btn label={`ادفع ${payableMoney(p,p.to_pay)}`} tone="ok" onPress={() => setPayFor(p)} /></View>
            </View>
          ))}
        </>}

        {/* الحركات */}
        <Text style={s.sec}>الحركات</Text>
        {!tx ? <Text style={ui.note}>جاري التحميل…</Text> : tx.length === 0 ? (
          <Empty icon="🧾" title="لا توجد حركات بعد" sub="الشحن والدفع والتحويلات تظهر هنا" />
        ) : (
          <View style={[ui.card, { paddingVertical: 4 }]}>
            {tx.map((t, i) => (
              <View key={t.id} style={[s.txRow, i === tx.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.txT}>{txLabel(t)}</Text>
                  <Text style={s.txS}>{fmtDateTime(t.created_at)}{t.note && !['payment_out', 'payment_in'].includes(t.kind) ? ` • ${t.note}` : ''}{Number(t.discount) > 0 ? ` • وفّرت ${money(t.discount)}` : ''}</Text>
                </View>
                <Text style={[s.txA, { color: Number(t.amount) < 0 ? C.err : C.ok }]}>{Number(t.amount) > 0 ? '+' : ''}{money(t.amount)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* إضافة رصيد */}
      <Sheet visible={topupOpen} onClose={() => { setTopupOpen(false); setCard(''); }} title="إضافة رصيد">
        <Text style={ui.label}>رقم بطاقة الشحن</Text>
        <TextInput value={fmtCard(card)} onChangeText={v => setCard(v.replace(/\D/g, '').slice(0, 14))} keyboardType="number-pad"
          placeholder="0000 0000 0000 00" maxLength={17} style={[ui.input, s.cardInput]} autoFocus />
        <Text style={ui.note}>أدخل الرقم المكوّن من 14 رقماً الموجود على البطاقة. كل بطاقة تُستخدم مرة واحدة.</Text>
        <View style={ui.btns}>
          <Btn label="شحن الرصيد" onPress={redeem} loading={busy} disabled={card.length !== 14} />
          <Btn label="رجوع" tone="ghost" onPress={() => { setTopupOpen(false); setCard(''); }} />
        </View>
        {toast.node}
      </Sheet>

      {/* تحويل رصيد */}
      <Sheet visible={trOpen && !pinMode} onClose={closeTransfer} title="تحويل رصيد">
        {!trUser ? <>
          <Text style={ui.label}>معرّف المحفظة أو رقم الهاتف</Text>
          <TextInput value={trQuery} onChangeText={v => setTrQuery(v.replace(/[^\d+ ]/g, ''))} keyboardType="phone-pad"
            placeholder="مثال: 1234 5678 أو 09xxxxxxxx" style={ui.input} autoFocus />
          <View style={ui.btns}>
            <Btn label="متابعة" onPress={findUser} loading={busy} />
            <Btn label="رجوع" tone="ghost" onPress={closeTransfer} />
          </View>
        </> : <>
          <View style={[ui.banner, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe', marginBottom: 0 }]}>
            <Text style={{ fontWeight: '900', textAlign: 'right', color: C.txt }}>{trUser.name}</Text>
            <Text style={[ui.sub, { marginTop: 2 }]}>معرّف المحفظة: {fmtWalletId(trUser.wallet_id)}</Text>
          </View>
          <Text style={ui.label}>المبلغ</Text>
          <TextInput value={trAmount} onChangeText={v => setTrAmount(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" placeholder="0" style={[ui.input, { fontSize: 20, fontWeight: '900' }]} autoFocus />
          <Text style={ui.note}>رصيدك: {money(balance)}{limit > 0 ? ` • المتبقي من حد التحويل اليوم: ${money(limitLeft)}` : ''}</Text>
          <Text style={ui.label}>ملاحظة (اختياري)</Text>
          <TextInput value={trNote} onChangeText={setTrNote} maxLength={80} placeholder="مثال: أجرة مشتركة" style={ui.input} />
          <View style={ui.btns}>
            <Btn label={amountNum > 0 ? `تحويل ${money(amountNum)}` : 'تحويل'} onPress={sendTransfer} loading={pinBusy} disabled={!(amountNum > 0) || amountNum > balance} />
            <Btn label="تغيير المستلم" tone="ghost" onPress={() => setTrUser(null)} />
          </View>
          {amountNum > balance && <Text style={[ui.note, { color: C.err }]}>المبلغ أكبر من رصيدك</Text>}
        </>}
        {toast.node}
      </Sheet>

      {/* تأكيد الدفع */}
      <Sheet visible={!!payFor && !pinMode} onClose={() => setPayFor(null)} title="الدفع من التطبيق">
        {payFor && <>
          <Row k="الخدمة" v={payFor.title} />
          {!!payFor.payee_name && <Row k="إلى" v={payFor.payee_name} />}
          <Row k="السعر المتفق عليه" v={payableMoney(payFor,payFor.gross)} />
          {Number(payFor.discount) > 0 && <Row k={`خصم الدفع من التطبيق ${payFor.discount_pct}%`} v={`−${payableMoney(payFor,payFor.discount)}`} />}
          <Row k="المبلغ المدفوع" v={payableMoney(payFor,payFor.to_pay)} strong />
          <Row k="رصيدك بعد الدفع" v={formatWalletUsd(balance - Number(payFor.to_pay))} />
          {balance < Number(payFor.to_pay) ? <>
            <Text style={[ui.note, { color: C.err }]}>رصيدك لا يكفي. أضف رصيداً ثم ادفع.</Text>
            <View style={ui.btns}>
              <Btn label="إضافة رصيد" onPress={() => { setPayFor(null); setTopupOpen(true); }} />
              <Btn label="رجوع" tone="ghost" onPress={() => setPayFor(null)} />
            </View>
          </> : (
            <View style={ui.btns}>
              <Btn label={`تأكيد الدفع ${payableMoney(payFor,payFor.to_pay)}`} tone="ok" onPress={pay} loading={pinBusy} />
              <Btn label="رجوع" tone="ghost" onPress={() => setPayFor(null)} />
            </View>
          )}
        </>}
      </Sheet>

      <PinPad visible={!!pinMode} title={pinTitle} sub={pinSub} error={pinErr} busy={pinBusy} onClose={closePin} onDone={onPin} />
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  balCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 16, alignItems: 'center', marginBottom: 10 },
  balNeg: { backgroundColor: C.errBg, borderColor: '#fecaca' },
  balL: { fontSize: 12, color: C.mute, fontWeight: '700' },
  balV: { fontSize: 34, fontWeight: '900', color: C.txt, marginTop: 2 },
  idT: { fontSize: 12, color: C.mute, marginTop: 4 },
  idV: { fontWeight: '900', color: '#334155', letterSpacing: 1 },
  neg: { fontSize: 12, color: C.err, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  actions: { flexDirection: 'row-reverse', gap: 8, marginTop: 14, alignSelf: 'stretch' },
  act: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 6 },
  actI: { fontSize: 18, fontWeight: '900', color: '#fff' },
  actT: { fontWeight: '900', fontSize: 14 },
  sec: { fontWeight: '900', fontSize: 14, textAlign: 'right', marginTop: 8, marginBottom: 8, color: C.txt },
  cardInput: { fontSize: 20, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  txRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 10 },
  txT: { fontWeight: '800', textAlign: 'right', color: C.txt, fontSize: 13 },
  txS: { fontSize: 11, color: C.mute, textAlign: 'right', marginTop: 2 },
  txA: { fontWeight: '900', fontSize: 15 },
});
