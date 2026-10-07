import Stars from '../components/Stars';
import { attachRatings } from '../utils/rating';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Image, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '../utils/supabase';
import { vName } from '../utils/vehicles';
import { money } from '../utils/wallet';
import { errMsg } from '../utils/errors';
import { evName, eventKind, fmtDateTime, weddingDetails } from '../utils/events';
import { useToast } from '../components/Toast';
import { EventMap, vehicleLine } from '../components/EventMap';
import ContractMap from '../components/ContractMap';
import { CT_CATS, unitOf, durText, ctVehName, daysText } from '../utils/contracts';
import DatePicker from '../components/DatePicker';
import TimePicker, { timeLabel, hm } from '../components/TimePicker';
import ShareTripBtn from '../components/ShareTripBtn';
import { Header, Pill, Tabs, Empty, Row, Btn, CallBtn, Sheet, ui, C } from '../components/DriverUI';
import ProviderPhotos from '../components/ProviderPhotos';
import AirportOrders from '../components/AirportOrders';

const CARGO_ST: Record<string, [string, any]> = { open: ['بانتظار العروض', 'warn'], accepted: ['تم الاتفاق', 'ok'], completed: ['مكتمل', 'mute'], cancelled: ['ملغى', 'err'] };
const EV_ST: Record<string, [string, any]> = { pending: ['بانتظار العروض', 'warn'], accepted: ['اكتملت المركبات', 'ok'], completed: ['مكتمل', 'mute'], cancelled: ['ملغى', 'err'] };
const POLL_MS = 20000;
const CT_ST: Record<string, [string, any]> = { pending: ['بانتظار العروض', 'warn'], accepted: ['اكتملت المركبات', 'ok'], completed: ['منتهٍ', 'mute'], cancelled: ['ملغى', 'err'] };
const dOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : '—');
const cargoWhen = (o: any) => (o.timing_type === 'scheduled' ? `${dOnly(o.scheduled_date)} • ${timeLabel(o.scheduled_time) || '—'}` : 'فوري');

export default function MyOrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const toast = useToast();
  const [tab, setTab] = useState<string>(params.tab === 'events' || params.tab === 'contracts' || params.tab === 'airport' ? params.tab : 'cargo');
  const [cargo, setCargo] = useState<any[] | null>(null);
  const [events, setEvents] = useState<any[] | null>(null);
  const [openCargo, setOpenCargo] = useState<any>(null);
  const [cargoOffers, setCargoOffers] = useState<any[] | null>(null);
  const [openEvent, setOpenEvent] = useState<any>(null);
  const [evOffers, setEvOffers] = useState<any[] | null>(null);
  const [contracts, setContracts] = useState<any[] | null>(null);
  const [openCt, setOpenCt] = useState<any>(null);
  const [ctOffers, setCtOffers] = useState<any[] | null>(null);
  const [endFor, setEndFor] = useState<any>(null);
  const [confirm, setConfirm] = useState<{ kind: 'cargo' | 'event' | 'contract'; offer: any } | null>(null);
  const [revealed, setRevealed] = useState<{ name?: string; phone?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [payCount, setPayCount] = useState(0);
  const [editCargo, setEditCargo] = useState<any>(null);
  const [edTiming, setEdTiming] = useState<'urgent' | 'scheduled'>('urgent');
  const [edDate, setEdDate] = useState('');
  const [edTime, setEdTime] = useState('');
  const [edNotes, setEdNotes] = useState('');
  const [edDateOpen, setEdDateOpen] = useState(false);
  const [edTimeOpen, setEdTimeOpen] = useState(false);
  const [cancelCargoFor, setCancelCargoFor] = useState<any>(null);

  const loadPay = useCallback(async () => { const { data } = await supabase.rpc('my_payables'); setPayCount(((data || []) as any[]).length); }, []);
  const loadCargo = useCallback(async () => { const { data } = await supabase.rpc('my_cargo_orders'); setCargo((data || []) as any[]); }, []);
  const loadEvents = useCallback(async () => { const { data } = await supabase.rpc('my_event_orders'); setEvents((data || []) as any[]); }, []);
  const loadContracts = useCallback(async () => { const { data } = await supabase.rpc('my_contract_orders'); setContracts((data || []) as any[]); }, []);
  const loadCtOffers = useCallback(async (id: string) => { const { data } = await supabase.rpc('customer_contract_offers', { p_order: id }); setCtOffers(await attachRatings('contract_offer', (data || []) as any[])); }, []);
  const loadCargoOffers = useCallback(async (id: string) => { const { data } = await supabase.rpc('customer_cargo_offers', { p_order: id }); setCargoOffers(await attachRatings('cargo_offer', (data || []) as any[])); }, []);
  const loadEvOffers = useCallback(async (id: string) => { const { data } = await supabase.rpc('customer_event_offers', { p_order: id }); setEvOffers(await attachRatings('event_offer', (data || []) as any[])); }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(!!data.user);
      if (data.user) { loadCargo(); loadEvents(); loadContracts(); loadPay(); }
    });
  }, []);
  // تحديث دوري للعروض المفتوحة
  useEffect(() => {
    const t = setInterval(() => {
      if (openCargo) loadCargoOffers(openCargo.id);
      if (openEvent) loadEvOffers(openEvent.id);
      if (openCt) loadCtOffers(openCt.id);
      if (!openCargo && !openEvent && !openCt) { loadCargo(); loadEvents(); loadContracts(); }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [openCargo, openEvent, openCt]);

  useFocusEffect(useCallback(() => { if (authed) loadPay(); }, [authed, loadPay]));
  const onRefresh = async () => { setRefreshing(true); await Promise.all([loadCargo(), loadEvents(), loadContracts(), loadPay()]); setRefreshing(false); };
  const showCargo = (o: any) => { setOpenCargo(o); setCargoOffers(null); if (o.status === 'open') loadCargoOffers(o.id); };
  const showCt = (o: any) => { setOpenCt(o); setCtOffers(null); loadCtOffers(o.id); };
  const showEvent = (o: any) => { setOpenEvent(o); setEvOffers(null); loadEvOffers(o.id); };

  const doAccept = async () => {
    if (!confirm) return;
    setBusy(true);
    if (confirm.kind === 'cargo') {
      const { error } = await supabase.rpc('accept_cargo_offer', { p_offer_id: confirm.offer.id });
      if (error) { setBusy(false); setConfirm(null); return toast.show(errMsg(error), 'err'); }
      const { data } = await supabase.rpc('my_cargo_orders');
      const list = (data || []) as any[];
      setCargo(list);
      const o = list.find(x => x.id === openCargo?.id);
      setBusy(false); setConfirm(null); setOpenCargo(null);
      setRevealed({ name: o?.carrier_name, phone: o?.carrier_phone });
    } else if (confirm.kind === 'contract') {
      const { data, error } = await supabase.rpc('accept_contract_offer', { p_offer_id: confirm.offer.id });
      setBusy(false); setConfirm(null);
      if (error) { if (openCt) loadCtOffers(openCt.id); return toast.show(errMsg(error), 'err'); }
      setRevealed({ name: data?.driver_name, phone: data?.driver_phone });
      if (openCt) loadCtOffers(openCt.id);
      loadContracts();
    } else {
      const { data, error } = await supabase.rpc('accept_event_offer', { p_offer_id: confirm.offer.id });
      setBusy(false); setConfirm(null);
      if (error) { if (openEvent) loadEvOffers(openEvent.id); return toast.show(errMsg(error), 'err'); }
      setRevealed({ name: data?.driver_name, phone: data?.driver_phone });
      if (openEvent) loadEvOffers(openEvent.id);
      loadEvents().then(() => {});
    }
  };
  const startEditCargo = (o: any) => {
    setEdTiming(o.timing_type === 'scheduled' ? 'scheduled' : 'urgent');
    setEdDate(o.scheduled_date ? String(o.scheduled_date).slice(0, 10) : '');
    setEdTime(hm(o.scheduled_time));
    setEdNotes(o.notes || '');
    setEditCargo(o);
  };
  const saveCargoEdit = async () => {
    if (!editCargo) return;
    if (edTiming === 'scheduled' && (!edDate || !edTime)) return toast.show('اختر التاريخ والساعة', 'err');
    const changes: Record<string, any> = {
      timing_type: edTiming,
      scheduled_date: edTiming === 'scheduled' ? edDate : null,
      scheduled_time: edTiming === 'scheduled' ? edTime : null,
      is_urgent: edTiming === 'urgent',
      notes: edNotes.trim() || null,
    };
    setBusy(true);
    const { data, error } = await supabase.rpc('edit_cargo_order', { p_order: editCargo.id, p_changes: changes });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    const changed = (data?.changed || []) as string[];
    const wasAccepted = editCargo.status === 'accepted';
    setEditCargo(null);
    const { data: list } = await supabase.rpc('my_cargo_orders');
    const arr = (list || []) as any[];
    setCargo(arr);
    const fresh = arr.find(x => x.id === editCargo.id);
    if (fresh) setOpenCargo(fresh);
    if (!changed.length) return toast.show('لم يتغير شيء', 'info');
    toast.show(wasAccepted ? 'تم حفظ التعديل وإبلاغ الناقل' : 'تم حفظ التعديل');
  };
  const cancelCargo = async () => {
    if (!cancelCargoFor) return;
    setBusy(true);
    const { error } = await supabase.rpc('cancel_cargo_order', { p_order: cancelCargoFor.id });
    setBusy(false); setCancelCargoFor(null);
    if (error) return toast.show(errMsg(error), 'err');
    setOpenCargo(null); toast.show('تم إلغاء الطلب', 'info'); loadCargo();
  };
  const rejectEv = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('reject_event_offer', { p_offer: id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم رفض العرض', 'info');
    if (openEvent) loadEvOffers(openEvent.id);
  };
  const cancelEv = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('cancel_event_order', { p_order: id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setOpenEvent(null); toast.show('تم إلغاء الطلب', 'info'); loadEvents();
  };

  const rejectCt = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('reject_contract_offer', { p_offer: id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم رفض العرض', 'info');
    if (openCt) loadCtOffers(openCt.id);
  };
  const cancelCt = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('cancel_contract_order', { p_order: id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setOpenCt(null); toast.show('تم إلغاء الطلب', 'info'); loadContracts();
  };
  const endCt = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('end_contract_offer', { p_offer: endFor.id });
    setBusy(false); setEndFor(null);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم إنهاء العقد', 'info');
    if (openCt) loadCtOffers(openCt.id);
    loadContracts();
  };
  const curCt = openCt ? (contracts || []).find(c => c.id === openCt.id) || openCt : null;
  // تحديث بيانات الطلب المفتوح بعد إعادة التحميل
  const curEvent = openEvent ? (events || []).find(e => e.id === openEvent.id) || openEvent : null;

  return (
    <View style={ui.page}>
      <Header title="طلباتي" onBack={() => router.back()} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { k: 'cargo', label: 'النقل', n: (cargo || []).filter(o => o.status === 'open').length },
        { k: 'events', label: 'المناسبات', n: (events || []).filter(o => o.status === 'pending').length },
        { k: 'contracts', label: 'العقود', n: (contracts || []).filter(o => o.status === 'pending').length },
        { k: 'airport', label: 'المطار' },
      ]} />

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {authed === false ? <Empty icon="🔐" title="سجّل الدخول لعرض طلباتك" /> : null}
        {authed && payCount > 0 && (
          <Pressable onPress={() => router.push('/wallet' as any)} style={[ui.banner, { backgroundColor: C.okBg, borderColor: '#a7f3d0', flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }]}>
            <Text style={{ flex: 1, color: C.ok, fontWeight: '900', textAlign: 'right' }}>لديك {payCount === 1 ? 'خدمة مكتملة' : `${payCount} خدمات مكتملة`} بانتظار الدفع من التطبيق</Text>
            <Text style={{ color: C.ok, fontWeight: '900' }}>ادفع ←</Text>
          </Pressable>
        )}

        {authed && tab === 'airport' && <AirportOrders />}

        {authed && tab === 'cargo' && (!cargo ? <Empty icon="⏳" title="جاري التحميل" /> : cargo.length === 0 ? (
          <Empty icon="🚚" title="لا توجد طلبات نقل" sub="الطلبات التي تنشرها تظهر هنا مع عروض الناقلين" />
        ) : cargo.map(o => {
          const st = CARGO_ST[o.status] || [o.status, 'mute'];
          return (
            <Pressable key={o.id} onPress={() => showCargo(o)} style={ui.card}>
              <View style={ui.cardTop}><Text style={ui.h}>{o.cargo_type || 'طلب نقل'}</Text><Pill text={st[0]} tone={st[1]} /></View>
              <Text style={ui.sub} numberOfLines={1}>📍 {o.pickup_points?.[0]?.label || '—'}  ←  🏁 {(o.dropoff_points || []).slice(-1)[0]?.label || '—'}</Text>
              <View style={ui.chips}>
                <Pill text={vName(o.vehicle_class)} tone="brand" />
                <Pill text={fmtDateTime(o.created_at)} />
                {o.agreed_price ? <Pill text={`السعر ${money(o.agreed_price)}`} tone="ok" /> : null}
              </View>
            </Pressable>
          );
        }))}

        {authed && tab === 'events' && (!events ? <Empty icon="⏳" title="جاري التحميل" /> : events.length === 0 ? (
          <Empty icon="🎉" title="لا توجد طلبات مناسبات" sub="الطلبات التي تنشرها تظهر هنا مع عروض السائقين" />
        ) : events.map(o => {
          const st = EV_ST[o.status] || [o.status, 'mute'];
          return (
            <Pressable key={o.id} onPress={() => showEvent(o)} style={ui.card}>
              <View style={ui.cardTop}><Text style={ui.h}>{eventKind(o)}</Text><Pill text={st[0]} tone={st[1]} /></View>
              <Text style={ui.sub} numberOfLines={1}>📍 {o.gathering_point || '—'} • {fmtDateTime(o.gathering_time)}</Text>
              <View style={ui.chips}>
                {(o.items || []).map((it: any) => <Pill key={it.type} text={`${evName(it.type)} ${it.count - it.left}/${it.count}`} tone={it.left === 0 ? 'ok' : 'mute'} />)}
              </View>
            </Pressable>
          );
        }))}

        {authed && tab === 'contracts' && (!contracts ? <Empty icon="⏳" title="جاري التحميل" /> : contracts.length === 0 ? (
          <Empty icon="📄" title="لا توجد عقود" sub="طلبات العقود التي تنشرها تظهر هنا مع عروض السائقين" />
        ) : contracts.map(o => {
          const st = CT_ST[o.status] || [o.status, 'mute'];
          return (
            <Pressable key={o.id} onPress={() => showCt(o)} style={ui.card}>
              <View style={ui.cardTop}><Text style={ui.h}>{CT_CATS[o.contract_category] || '📄 عقد'} • {unitOf(o.contract_unit).label}</Text><Pill text={st[0]} tone={st[1]} /></View>
              <Text style={ui.sub}>📅 {durText(o.contract_unit, o.unit_count)} • {dOnly(o.start_date)} ← {dOnly(o.end_date)}</Text>
              <View style={ui.chips}>
                {(o.items || []).map((it: any) => <Pill key={it.type} text={`${ctVehName(it.type)} ${it.count - it.left}/${it.count}`} tone={it.left === 0 ? 'ok' : 'mute'} />)}
              </View>
            </Pressable>
          );
        }))}
      </ScrollView>

      {toast.node}

      {/* طلب عقد */}
      <Sheet visible={!!curCt && !confirm && !endFor} onClose={() => setOpenCt(null)} title={curCt ? `${CT_CATS[curCt.contract_category] || '📄 عقد'} • ${unitOf(curCt.contract_unit).label}` : ''}>
        {curCt && <ScrollView>
          <ContractMap o={curCt} />
          <Row k="المدة" v={durText(curCt.contract_unit, curCt.unit_count)} strong />
          <Row k="من" v={dOnly(curCt.start_date)} />
          <Row k="إلى" v={dOnly(curCt.end_date)} />
          <Row k="أيام الدوام" v={daysText(curCt.days)} />
          <Row k="عدد الأشخاص" v={curCt.num_people} />
          {(curCt.items || []).map((it: any) => {
            const list = (ctOffers || []).filter(f => f.item_type === it.type);
            return (
              <View key={it.type} style={{ marginTop: 10 }}>
                <View style={ui.cardTop}>
                  <Text style={[ui.h, { fontSize: 14 }]}>{ctVehName(it.type)}</Text>
                  <Pill text={`${it.count - it.left} من ${it.count}`} tone={it.left === 0 ? 'ok' : 'warn'} />
                </View>
                {!ctOffers ? <Text style={ui.note}>جاري التحميل…</Text> : list.length === 0 ? (
                  <Text style={ui.note}>{it.left > 0 && curCt.status === 'pending' ? 'بانتظار العروض' : ''}</Text>
                ) : list.map(f => <ContractOfferCard key={f.id} f={f} canAct={it.left > 0 && curCt.status === 'pending'} busy={busy}
                    onAccept={() => setConfirm({ kind: 'contract', offer: f })} onReject={() => rejectCt(f.id)} onEnd={() => setEndFor(f)} />)}
              </View>
            );
          })}
          {curCt.status === 'pending' && !(ctOffers || []).some(f => f.status === 'accepted') && (
            <View style={[ui.btns, { marginTop: 16 }]}><Btn label="إلغاء الطلب" tone="err" onPress={() => cancelCt(curCt.id)} loading={busy} /></View>
          )}
        </ScrollView>}
        {toast.node}
      </Sheet>

      <Sheet visible={!!endFor} onClose={() => setEndFor(null)} title="إنهاء العقد">
        {endFor && <>
          <Row k="المركبة" v={vehicleLine(endFor.vehicle)} />
          <Row k="السائق" v={endFor.driver_name} />
          <Text style={ui.note}>ينتهي التعاقد مع هذه المركبة من الآن. لا يمكن التراجع عن الإنهاء.</Text>
          <View style={ui.btns}>
            <Btn label="إنهاء العقد" tone="err" onPress={endCt} loading={busy} />
            <Btn label="رجوع" tone="ghost" onPress={() => setEndFor(null)} />
          </View>
        </>}
      </Sheet>

      {/* طلب نقل */}
      <Sheet visible={!!openCargo && !confirm && !editCargo && !cancelCargoFor} onClose={() => setOpenCargo(null)} title={openCargo?.cargo_type || 'طلب نقل'}>
        {openCargo && <ScrollView>
          <Row k="المركبة" v={vName(openCargo.vehicle_class)} />
          <Row k="الانطلاق" v={openCargo.pickup_points?.[0]?.label} />
          <Row k="الوصول" v={(openCargo.dropoff_points || []).slice(-1)[0]?.label} />
          {openCargo.route_info?.km ? <Row k="المسافة" v={`${Number(openCargo.route_info.km).toFixed(1)} كم`} /> : null}
          <Row k="الميزانية" v={openCargo.budget_type === 'fixed' && openCargo.budget_to ? `${money(openCargo.budget_from)} – ${money(openCargo.budget_to)}` : 'طلب عروض أسعار'} />
          <Row k="الموعد" v={cargoWhen(openCargo)} />
          {!!openCargo.notes && <Row k="ملاحظات" v={openCargo.notes} />}
          {(openCargo.status === 'open' || openCargo.status === 'accepted') && <View style={ui.btns}>
            <Btn small label="تعديل الموعد والملاحظات" tone="ghost" onPress={() => startEditCargo(openCargo)} />
            {openCargo.status === 'open' && <Btn small label="إلغاء الطلب" tone="err" onPress={() => setCancelCargoFor(openCargo)} />}
          </View>}
          {openCargo.status !== 'open' ? (<>
            <Row k="الناقل" v={openCargo.carrier_name} strong />
            <Row k="مركبة الناقل" v={vName(openCargo.carrier_vehicle)} />
            <ProviderPhotos service="cargo" refId={openCargo.id} />
            <Row k="السعر المتفق عليه" v={money(openCargo.agreed_price)} strong />
            {openCargo.status === 'accepted' && <View style={ui.btns}><CallBtn phone={openCargo.carrier_phone} /></View>}
            {openCargo.status === 'accepted' && <View style={ui.btns}><ShareTripBtn service="cargo" refId={openCargo.id} /></View>}
          </>) : (<>
            <Text style={ui.label}>العروض</Text>
            {!cargoOffers ? <Text style={ui.note}>جاري التحميل…</Text> : cargoOffers.length === 0 ? (
              <Empty icon="⏳" title="بانتظار عروض الناقلين" sub="تصلك العروض من الناقلين القريبين ضمن 10 كم" />
            ) : cargoOffers.map(f => (
              <View key={f.id} style={[ui.card, { padding: 10 }]}>
                <View style={ui.cardTop}>
                  <Text style={[ui.h, { fontSize: 17 }]}>{money(f.price)}</Text>
                  <Pill text={vName(f.carrier_vehicle)} tone="brand" />
                </View>
                <ProviderPhotos service="cargo_offer" refId={f.id} />
                <Stars r={f.rating} />
                {!!f.message && <Text style={ui.sub}>{f.message}</Text>}
                <Text style={ui.sub}>{fmtDateTime(f.created_at)}</Text>
                <View style={ui.btns}><Btn small label="قبول العرض" tone="ok" onPress={() => setConfirm({ kind: 'cargo', offer: f })} /></View>
              </View>
            ))}
            <Text style={ui.note}>اسم الناقل ورقمه يظهران بعد قبول العرض.</Text>
          </>)}
        </ScrollView>}
        {toast.node}
      </Sheet>

      {/* تعديل طلب النقل */}
      <Sheet visible={!!editCargo} onClose={() => setEditCargo(null)} title="تعديل الطلب">
        {editCargo && <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={ui.label}>الموعد</Text>
          <View style={ui.btns}>
            <Btn small label="فوري" tone={edTiming === 'urgent' ? 'brand' : 'ghost'} onPress={() => setEdTiming('urgent')} />
            <Btn small label="مجدول" tone={edTiming === 'scheduled' ? 'brand' : 'ghost'} onPress={() => setEdTiming('scheduled')} />
          </View>
          {edTiming === 'scheduled' && <View style={ui.btns}>
            <Btn small label={edDate ? `📅 ${edDate}` : '📅 التاريخ'} tone="ghost" onPress={() => setEdDateOpen(true)} />
            <Btn small label={edTime ? `🕒 ${timeLabel(edTime)}` : '🕒 الساعة'} tone="ghost" onPress={() => setEdTimeOpen(true)} />
          </View>}
          <Text style={ui.label}>ملاحظات للناقل</Text>
          <TextInput value={edNotes} onChangeText={setEdNotes} multiline maxLength={300} placeholder="مثال: البناء بجانب الصيدلية"
            style={[ui.input, { height: 84, textAlignVertical: 'top', paddingTop: 10 }]} />
          <Text style={ui.note}>{editCargo.status === 'accepted'
            ? 'بعد الاتفاق يمكن تعديل الموعد والملاحظات فقط، ويصل التعديل للناقل. لتغيير أمر آخر تواصل معه.'
            : 'يصل الطلب المعدّل للناقلين القريبين.'}</Text>
          <View style={ui.btns}>
            <Btn label="حفظ التعديل" onPress={saveCargoEdit} loading={busy} />
            <Btn label="رجوع" tone="ghost" onPress={() => setEditCargo(null)} />
          </View>
        </ScrollView>}
        <DatePicker visible={edDateOpen} value={edDate} minDate={new Date()} title="تاريخ النقل" onClose={() => setEdDateOpen(false)} onPick={setEdDate} />
        <TimePicker visible={edTimeOpen} value={edTime} title="ساعة النقل" onClose={() => setEdTimeOpen(false)} onPick={setEdTime} />
        {toast.node}
      </Sheet>

      {/* تأكيد إلغاء طلب النقل */}
      <Sheet visible={!!cancelCargoFor} onClose={() => setCancelCargoFor(null)} title="إلغاء الطلب">
        {cancelCargoFor && <>
          <Text style={ui.note}>يُلغى الطلب وتُرفض العروض المعلّقة عليه. لا يمكن التراجع عن الإلغاء.</Text>
          <View style={ui.btns}>
            <Btn label="إلغاء الطلب" tone="err" onPress={cancelCargo} loading={busy} />
            <Btn label="رجوع" tone="ghost" onPress={() => setCancelCargoFor(null)} />
          </View>
        </>}
      </Sheet>

      {/* طلب مناسبة */}
      <Sheet visible={!!curEvent && !confirm} onClose={() => setOpenEvent(null)} title={curEvent ? eventKind(curEvent) : ''}>
        {curEvent && <ScrollView>
          <EventMap o={curEvent} />
          <Row k="الموعد" v={fmtDateTime(curEvent.gathering_time)} />
          <Row k="عدد الأشخاص" v={curEvent.num_people} />
          {(curEvent.items || []).map((it: any) => {
            const list = (evOffers || []).filter(f => f.item_type === it.type);
            return (
              <View key={it.type} style={{ marginTop: 10 }}>
                <View style={ui.cardTop}>
                  <Text style={[ui.h, { fontSize: 14 }]}>{evName(it.type)}{it.type === 'wedding_car' && weddingDetails(it) ? ` • ${weddingDetails(it)}` : ''}</Text>
                  <Pill text={`${it.count - it.left} من ${it.count}`} tone={it.left === 0 ? 'ok' : 'warn'} />
                </View>
                {!evOffers ? <Text style={ui.note}>جاري التحميل…</Text> : list.length === 0 ? (
                  <Text style={ui.note}>{it.left > 0 ? 'بانتظار العروض' : ''}</Text>
                ) : list.map(f => <EventOfferCard key={f.id} f={f} canAct={it.left > 0 && curEvent.status === 'pending'} busy={busy}
                    onAccept={() => setConfirm({ kind: 'event', offer: f })} onReject={() => rejectEv(f.id)} />)}
              </View>
            );
          })}
          {curEvent.status === 'pending' && !(evOffers || []).some(f => f.status === 'accepted') && (
            <View style={[ui.btns, { marginTop: 16 }]}><Btn label="إلغاء الطلب" tone="err" onPress={() => cancelEv(curEvent.id)} loading={busy} /></View>
          )}
        </ScrollView>}
        {toast.node}
      </Sheet>

      {/* تأكيد القبول */}
      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title="تأكيد قبول العرض">
        {confirm && <>
          <Row k={confirm.kind === 'contract' ? `السعر ${unitOf(confirm.offer.unit).per}` : 'السعر'} v={money(confirm.offer.price)} strong />
          <Row k="المركبة" v={confirm.kind === 'cargo' ? vName(confirm.offer.carrier_vehicle) : vehicleLine(confirm.offer.vehicle)} />
          {confirm.kind === 'contract' && <Row k="الإجمالي" v={`${money(confirm.offer.total)} (${unitOf(confirm.offer.unit).label})`} />}
          <Text style={ui.note}>بعد القبول يظهر لك اسم {confirm.kind === 'cargo' ? 'الناقل' : 'السائق'} ورقم هاتفه للتواصل.</Text>
          <View style={ui.btns}>
            <Btn label="قبول" tone="ok" onPress={doAccept} loading={busy} />
            <Btn label="رجوع" tone="ghost" onPress={() => setConfirm(null)} />
          </View>
        </>}
      </Sheet>

      <Sheet visible={!!revealed} onClose={() => setRevealed(null)} title="تم قبول العرض">
        {revealed && <>
          <Row k="الاسم" v={revealed.name} strong />
          <Row k="الهاتف" v={revealed.phone} />
          <View style={ui.btns}><CallBtn phone={revealed.phone} /></View>
          <View style={ui.btns}><Btn label="تم" tone="ghost" onPress={() => setRevealed(null)} /></View>
        </>}
      </Sheet>
    </View>
  );
}

function EventOfferCard({ f, canAct, busy, onAccept, onReject }: { f: any; canAct: boolean; busy: boolean; onAccept: () => void; onReject: () => void }) {
  const v = f.vehicle || {};
  const accepted = f.status === 'accepted';
  return (
    <View style={[ui.card, { padding: 10, marginTop: 6, marginBottom: 0 }, accepted && { borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' }]}>
      <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
        {v.photo ? <Image source={{ uri: v.photo }} style={{ width: 72, height: 54, borderRadius: 8, backgroundColor: '#f1f5f9' }} /> : null}
        <View style={{ flex: 1 }}>
          <View style={ui.cardTop}>
            <Text style={[ui.h, { fontSize: 17 }]}>{money(f.price)}</Text>
            {accepted ? <Pill text="مقبول" tone="ok" /> : f.status === 'rejected' ? <Pill text="مرفوض" tone="mute" /> : null}
          </View>
          <Text style={ui.sub}>{vehicleLine(v)}</Text>
          {v.seats ? <Text style={ui.sub}>{v.seats} مقعد</Text> : null}
          {!!f.message && <Text style={[ui.sub, { color: C.txt }]}>{f.message}</Text>}
          <Stars r={f.rating} />
          <ProviderPhotos service="event_offer" refId={f.id} hideVehicle={!!v.photo} />
        </View>
      </View>
      {accepted ? (<>
        <Row k="السائق" v={f.driver_name} strong />
        <View style={ui.btns}><CallBtn phone={f.driver_phone} /></View>
        {!f.completed_at && <View style={ui.btns}><ShareTripBtn service="events" refId={f.id} /></View>}
      </>) : f.status === 'pending' && canAct ? (
        <View style={ui.btns}>
          <Btn small label="قبول" tone="ok" onPress={onAccept} />
          <Btn small label="رفض" tone="ghost" onPress={onReject} loading={busy} />
        </View>
      ) : null}
    </View>
  );
}

function ContractOfferCard({ f, canAct, busy, onAccept, onReject, onEnd }: { f: any; canAct: boolean; busy: boolean; onAccept: () => void; onReject: () => void; onEnd: () => void }) {
  const v = f.vehicle || {};
  const accepted = f.status === 'accepted';
  const U = unitOf(f.unit);
  return (
    <View style={[ui.card, { padding: 10, marginTop: 6, marginBottom: 0 }, accepted && !f.ended_at && { borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' }]}>
      <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
        {v.photo ? <Image source={{ uri: v.photo }} style={{ width: 72, height: 54, borderRadius: 8, backgroundColor: '#f1f5f9' }} /> : null}
        <View style={{ flex: 1 }}>
          <View style={ui.cardTop}>
            <Text style={[ui.h, { fontSize: 17 }]}>{money(f.price)} <Text style={{ fontSize: 12, color: C.mute }}>{U.per}</Text></Text>
            {accepted ? <Pill text={f.ended_at ? 'منتهٍ' : 'مقبول'} tone={f.ended_at ? 'mute' : 'ok'} /> : f.status === 'rejected' ? <Pill text="مرفوض" tone="mute" /> : null}
          </View>
          <Text style={ui.sub}>الإجمالي: {money(f.total)}</Text>
          <Text style={ui.sub}>{vehicleLine(v)}</Text>
          {v.seats ? <Text style={ui.sub}>{v.seats} مقعد</Text> : null}
          {!!f.message && <Text style={[ui.sub, { color: C.txt }]}>{f.message}</Text>}
          <Stars r={f.rating} />
          <ProviderPhotos service="contract_offer" refId={f.id} hideVehicle={!!v.photo} />
        </View>
      </View>
      {accepted ? (<>
        <Row k="السائق" v={f.driver_name} strong />
        {!f.ended_at && <View style={ui.btns}><CallBtn phone={f.driver_phone} /></View>}
        {!f.ended_at && <View style={ui.btns}><ShareTripBtn service="contracts" refId={f.id} /></View>}
        {!f.ended_at && <View style={ui.btns}><Btn small label="إنهاء العقد" tone="err" onPress={onEnd} /></View>}
      </>) : f.status === 'pending' && canAct ? (
        <View style={ui.btns}>
          <Btn small label="قبول" tone="ok" onPress={onAccept} />
          <Btn small label="رفض" tone="ghost" onPress={onReject} loading={busy} />
        </View>
      ) : null}
    </View>
  );
}
