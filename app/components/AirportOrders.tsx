import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { money } from '../utils/wallet';
import { AP_KIND, AP_ST, paxLine, whenLine } from '../utils/airport';
import { vehicleLine } from './EventMap';
import Stars from './Stars';
import DatePicker, { ymd } from './DatePicker';
import TimePicker, { timeLabel, hm } from './TimePicker';
import ShareTripBtn from './ShareTripBtn';
import { useToast } from './Toast';
import { Pill, Empty, Row, Btn, CallBtn, Sheet, ui, C } from './DriverUI';

// طلبات المطار للزبون داخل «طلباتي»: العروض، والاختيار، والتعديل، والإلغاء
export default function AirportOrders() {
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any>(null);
  const [offers, setOffers] = useState<any[] | null>(null);
  const [confirm, setConfirm] = useState<any>(null);
  const [revealed, setRevealed] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [edDate, setEdDate] = useState('');
  const [edTime, setEdTime] = useState('');
  const [edNotes, setEdNotes] = useState('');
  const [dOpen, setDOpen] = useState(false);
  const [tOpen, setTOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { const { data } = await supabase.rpc('my_airport_orders'); setList((data || []) as any[]); }, []);
  const loadOffers = useCallback(async (id: string) => { const { data } = await supabase.rpc('customer_airport_offers', { p_order: id }); setOffers((data || []) as any[]); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (open) loadOffers(open.id); else load(); }, 20000);
    return () => clearInterval(t);
  }, [open]);

  const show = (o: any) => { setOpen(o); setOffers(null); loadOffers(o.id); };
  const run = async (fn: string, args: any, ok: string) => {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast.show(errMsg(error), 'err'); return false; }
    toast.show(ok); return true;
  };
  const accept = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('accept_airport_offer', { p_offer: confirm.id });
    setBusy(false); setConfirm(null);
    if (error) { if (open) loadOffers(open.id); return toast.show(errMsg(error), 'err'); }
    setOpen(null); setRevealed(data); load();
  };
  const startEdit = (o: any) => {
    const d = new Date(o.trip_at);
    setEdDate(ymd(d)); setEdTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setEdNotes(o.notes || ''); setEdit(o);
  };
  const saveEdit = async () => {
    const at = new Date(`${edDate}T${hm(edTime)}:00`);
    if (at.getTime() < Date.now() + 30 * 60e3) return toast.show('اختر موعداً بعد نصف ساعة على الأقل', 'err');
    if (await run('edit_airport_order', { p_order: edit.id, p: { trip_at: at.toISOString(), notes: edNotes.trim() } }, 'تم حفظ التعديل، وأُبلغ السائق ✓')) {
      setEdit(null); setOpen(null); load();
    }
  };

  const cur = open && (list || []).find(x => x.id === open.id) || open;
  return (
    <View>
      <Btn label="✈️ طلب جديد" onPress={() => router.push('/airport' as any)} />
      <View style={{ height: 10 }} />
      {!list ? <Empty icon="⏳" title="جاري التحميل" /> : list.length === 0 ? (
        <Empty icon="✈️" title="لا توجد طلبات مطار" sub="الطلبات التي تنشرها تظهر هنا مع عروض السائقين" />
      ) : list.map(o => {
        const st = AP_ST[o.status] || [o.status, 'mute'];
        return (
          <Pressable key={o.id} onPress={() => show(o)} style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{AP_KIND[o.kind]} • {o.airport_name}</Text>
              <Pill text={st[0]} tone={st[1]} />
            </View>
            <Text style={ui.sub}>🕒 {whenLine(o)}</Text>
            <Text style={ui.sub}>{paxLine(o)}</Text>
            {o.status === 'pending' && <View style={ui.chips}><Pill text={o.offers ? `${o.offers} عرض` : 'بانتظار العروض'} tone={o.offers ? 'brand' : 'mute'} /></View>}
            {o.status === 'accepted' && !!o.driver_name && <Text style={[ui.sub, { color: C.ok, fontWeight: '800' }]}>السائق: {o.driver_name}</Text>}
          </Pressable>
        );
      })}

      <Sheet visible={!!cur && !confirm && !edit} onClose={() => setOpen(null)} title={cur ? `${AP_KIND[cur.kind]} • ${cur.airport_name}` : ''}>
        {cur && <ScrollView>
          <Row k="الموعد" v={whenLine(cur)} />
          <Row k="الانطلاق" v={cur.pickup_label || '—'} />
          <Row k="الركاب" v={paxLine(cur)} />
          {!!cur.notes && <Row k="ملاحظات" v={cur.notes} />}
          {cur.status === 'accepted' && <>
            <Row k="السائق" v={cur.driver_name} strong />
            <Row k="السعر المتفق عليه" v={money(cur.agreed_price)} strong />
            <View style={ui.btns}><CallBtn phone={cur.driver_phone} /></View>
            <View style={ui.btns}><Btn small label="تعديل الموعد والملاحظات" tone="ghost" onPress={() => startEdit(cur)} /></View>
          </>}
          {cur.status === 'pending' && <>
            <View style={ui.btns}>
              <Btn small label="تعديل الطلب" tone="ghost" onPress={() => { setOpen(null); router.push(`/airport?edit=${cur.id}` as any); }} />
              <Btn small label="إلغاء الطلب" tone="err" loading={busy} onPress={async () => { if (await run('cancel_airport_order', { p_order: cur.id }, 'تم إلغاء الطلب')) { setOpen(null); load(); } }} />
            </View>
            <Text style={ui.label}>العروض</Text>
            {!offers ? <Text style={ui.note}>جاري التحميل…</Text> : offers.length === 0 ? (
              <Empty icon="⏳" title="بانتظار عروض السائقين" sub="يصل الطلب للسائقين ضمن 20 كم من نقطة الانطلاق" />
            ) : offers.map(f => (
              <View key={f.id} style={[ui.card, { padding: 10 }]}>
                <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                  {!!f.vehicle?.photo && <Image source={{ uri: f.vehicle.photo }} style={{ width: 72, height: 54, borderRadius: 8, backgroundColor: '#f1f5f9' }} />}
                  {!!f.driver_photo && <Image source={{ uri: f.driver_photo }} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#f1f5f9' }} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[ui.h, { fontSize: 17 }]}>{money(f.price)}</Text>
                    <Text style={ui.sub}>{vehicleLine(f.vehicle)}</Text>
                    {f.vehicle?.seats ? <Text style={ui.sub}>{f.vehicle.seats} مقعد</Text> : null}
                    <Stars r={f.rating} />
                  </View>
                </View>
                {!!f.message && <Text style={[ui.sub, { color: C.txt, marginTop: 6 }]}>{f.message}</Text>}
                <View style={ui.btns}>
                  <Btn small label="قبول" tone="ok" onPress={() => setConfirm(f)} />
                  <Btn small label="رفض" tone="ghost" loading={busy} onPress={async () => { if (await run('reject_airport_offer', { p_offer: f.id }, 'تم رفض العرض')) loadOffers(cur.id); }} />
                </View>
              </View>
            ))}
          </>}
          {cur.status === 'accepted' && <View style={ui.btns}><ShareTripBtn service="airport" refId={cur.id} /></View>}
        </ScrollView>}
        {toast.node}
      </Sheet>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title="تأكيد قبول العرض">
        {confirm && <>
          <Row k="السعر" v={money(confirm.price)} strong />
          <Row k="المركبة" v={vehicleLine(confirm.vehicle)} />
          <Text style={ui.note}>بعد القبول يظهر لك اسم السائق ورقم هاتفه للتواصل.</Text>
          <View style={ui.btns}>
            <Btn label="قبول" tone="ok" onPress={accept} loading={busy} />
            <Btn label="رجوع" tone="ghost" onPress={() => setConfirm(null)} />
          </View>
        </>}
      </Sheet>

      <Sheet visible={!!revealed} onClose={() => setRevealed(null)} title="تم قبول العرض">
        {revealed && <>
          <Row k="الاسم" v={revealed.driver_name} strong />
          <Row k="الهاتف" v={revealed.driver_phone} />
          <View style={ui.btns}><CallBtn phone={revealed.driver_phone} /></View>
          <View style={ui.btns}><Btn label="تم" tone="ghost" onPress={() => setRevealed(null)} /></View>
        </>}
      </Sheet>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title="تعديل الموعد والملاحظات">
        {edit && <ScrollView keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            <View style={{ flex: 1 }}><Btn label={`📅 ${edDate}`} tone="ghost" onPress={() => setDOpen(true)} /></View>
            <View style={{ flex: 1 }}><Btn label={`🕒 ${timeLabel(edTime)}`} tone="ghost" onPress={() => setTOpen(true)} /></View>
          </View>
          <Text style={ui.label}>ملاحظات</Text>
          <TextInput value={edNotes} onChangeText={setEdNotes} multiline maxLength={300}
            style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, minHeight: 70, textAlign: 'right', textAlignVertical: 'top', color: C.txt }} />
          <View style={ui.btns}>
            <Btn label="حفظ" onPress={saveEdit} loading={busy} />
            <Btn label="رجوع" tone="ghost" onPress={() => setEdit(null)} />
          </View>
          <DatePicker visible={dOpen} value={edDate} minDate={new Date()} onClose={() => setDOpen(false)} onPick={v => { setEdDate(v); setDOpen(false); }} />
          <TimePicker visible={tOpen} value={edTime} onClose={() => setTOpen(false)} onPick={v => { setEdTime(v); setTOpen(false); }} />
        </ScrollView>}
        {toast.node}
      </Sheet>
      {toast.node}
    </View>
  );
}
