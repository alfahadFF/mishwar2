import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, RefreshControl, Modal, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase, hasSession } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { useToast } from '../components/Toast';
import { Header, Tabs, Pill, Empty, Row, Btn, CallBtn, ui, C } from '../components/DriverUI';
import PointPicker from '../components/PointPicker';

type Point = { ll: number[]; label: string } | null;
type RequestForm = { point: Point; destination: string; passengers: number; bags: number; hasLuggage: boolean; notes: string };
const EMPTY_FORM: RequestForm = { point: null, destination: '', passengers: 1, bags: 0, hasLuggage: false, notes: '' };
const STATUS: Record<string, [string, 'warn' | 'ok' | 'err' | 'mute']> = {
  open: ['مفتوح', 'warn'], accepted: ['تم اختيار عرض', 'ok'], cancelled: ['ملغي', 'mute'], closed: ['أُغلق بعد الحجز', 'ok'],
  confirmed: ['مؤكد', 'ok'], completed: ['مكتمل', 'mute'], pending: ['بانتظار الرد', 'warn'], rejected: ['غير مختار', 'mute'],
};
const when = (v: any) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('ar-SY', { dateStyle: 'medium', timeStyle: 'short' });
};
const money = (v: any) => `$${Number(v || 0).toFixed(2)}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text>{children}</View>;
}
function Counter({ label, value, onChange, min = 0, max = 99 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <View style={s.counterRow}>
      <Text style={s.counterLabel}>{label}</Text>
      <View style={s.counter}>
        <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={s.counterBtn}><Text style={s.counterBtnT}>−</Text></Pressable>
        <Text style={s.counterValue}>{value}</Text>
        <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={s.counterBtn}><Text style={s.counterBtnT}>+</Text></Pressable>
      </View>
    </View>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggleRow}>
      <Text style={s.counterLabel}>{label}</Text>
      <View style={s.toggleChoices}>
        {[['yes', 'نعم', true], ['no', 'لا', false]].map(([k, title, v]) => (
          <Pressable key={String(k)} onPress={() => onChange(Boolean(v))} style={[s.toggle, value === v && s.toggleOn]}>
            <Text style={[s.toggleText, value === v && s.toggleTextOn]}>{String(title)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function TravelScreen() {
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const toast = useToast();
  const [tab, setTab] = useState('browse');
  const [listings, setListings] = useState<any[]>([]);
  const [mine, setMine] = useState<{ requests: any[]; bookings: any[] }>({ requests: [], bookings: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [providerEnabled, setProviderEnabled] = useState(false);
  const [profileType, setProfileType] = useState('');
  const [authed, setAuthed] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [request, setRequest] = useState<RequestForm>(EMPTY_FORM);
  const [selected, setSelected] = useState<any>(null);
  const [booking, setBooking] = useState<RequestForm>(EMPTY_FORM);
  const [pointTarget, setPointTarget] = useState<'request' | 'booking' | null>(null);

  const loadListings = useCallback(async () => {
    const { data, error } = await supabase.rpc('travel_search');
    if (error) { toast.show(errMsg(error), 'err'); return; }
    setListings((data || []) as any[]);
  }, []);
  const loadMine = useCallback(async () => {
    if (!(await hasSession())) { setMine({ requests: [], bookings: [] }); return; }
    const { data, error } = await supabase.rpc('travel_my_data');
    if (error) { toast.show(errMsg(error), 'err'); return; }
    const d = (data || {}) as any;
    setMine({ requests: d.requests || [], bookings: d.bookings || [] });
  }, []);
  const loadProviderStatus = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const signedIn = !!sessionData.session;
    setAuthed(signedIn);
    if (!signedIn) { setProviderEnabled(false); setProfileType(''); return; }
    const { data } = await supabase.rpc('my_work_profile');
    const type = (data as any)?.type || '';
    setProfileType(type);
    setProviderEnabled(!!(data as any)?.travel && ['driver', 'business'].includes(type));
  }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadListings(), loadMine(), loadProviderStatus()]);
    setRefreshing(false);
  }, [loadListings, loadMine, loadProviderStatus]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (tabParam === 'mine') setTab('mine'); }, [tabParam]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const openBooking = (listing: any) => {
    setSelected(listing);
    setBooking({ ...EMPTY_FORM, destination: listing.destination || '' });
  };
  const postRequest = async () => {
    if (!request.point) return toast.show('حدد موقع الالتقاط على الخريطة', 'err');
    if (!request.destination.trim()) return toast.show('اكتب الوجهة', 'err');
    if (request.passengers < 1) return toast.show('حدد عدد الركاب', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('travel_post_request', {
      p_pickup_lat: request.point.ll[0], p_pickup_lng: request.point.ll[1], p_pickup_label: request.point.label,
      p_destination: request.destination.trim(), p_passengers: request.passengers, p_bags: request.bags,
      p_has_luggage: request.hasLuggage, p_notes: request.notes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم نشر طلب السفر؛ يمكن لمقدمي الخدمة إرسال عروض خاصة به ✓');
    setRequestOpen(false); setRequest(EMPTY_FORM); setTab('mine'); await loadMine();
  };
  const bookListing = async () => {
    if (!selected) return;
    if (!booking.point) return toast.show('حدد موقع الالتقاط على الخريطة', 'err');
    if (booking.passengers > Number(selected.seats_left)) return toast.show('عدد الركاب يتجاوز المقاعد المتاحة', 'err');
    if (selected.baggage_limit != null && booking.bags > Number(selected.baggage_limit)) return toast.show('عدد الحقائب يتجاوز السعة المعلنة', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('travel_book_listing', {
      p_listing: selected.id, p_pickup_lat: booking.point.ll[0], p_pickup_lng: booking.point.ll[1], p_pickup_label: booking.point.label,
      p_passengers: booking.passengers, p_bags: booking.bags, p_has_luggage: booking.hasLuggage, p_notes: booking.notes.trim() || null,
    });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم تأكيد حجز الرحلة ✓'); setSelected(null); setBooking(EMPTY_FORM); setTab('mine'); await loadMine(); await loadListings();
  };
  const chooseOffer = async (offer: any) => {
    setBusy(true);
    const { error } = await supabase.rpc('travel_choose_offer', { p_offer: offer.id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم اختيار العرض وإغلاق الطلب أمام بقية مقدمي الخدمة ✓'); await loadMine();
  };
  const cancelRequest = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('travel_cancel_request', { p_request: id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم إلغاء طلب السفر'); await loadMine();
  };

  const startProviderRegistration = async () => {
    if (profileType === 'business') return router.push('/office-register' as any);
    if (profileType === 'transporter') return toast.show('خدمة السفريات متاحة للسائق أو المكتب', 'info');
    const { error } = await supabase.rpc('set_work_intent', { p_role: 'travel' });
    if (error) return toast.show(errMsg(error), 'err');
    router.push('/work-register?role=travel' as any);
  };
  const totalMine = mine.requests.length + mine.bookings.length;
  return (
    <View style={ui.page}>
      <Header title="السفريات" onBack={() => router.back()} right={<Btn small label="📣 طلب سفر" onPress={() => setRequestOpen(true)} />} />
      {authed && ['personal','driver','business'].includes(profileType) && <View style={s.providerLink}>
        <Btn small tone="ghost" label={providerEnabled ? '🧭 لوحة مقدّم الخدمة' : '🧭 قدّم خدمة السفريات'} onPress={providerEnabled ? () => router.push('/travel-provider' as any) : startProviderRegistration} />
      </View>}
      <Tabs tabs={[{ k: 'browse', label: 'الرحلات المنشورة', n: listings.length }, { k: 'mine', label: 'طلباتي وحجوزاتي', n: totalMine }]} value={tab} onChange={setTab} />
      {tab === 'browse' ? (
        <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <View style={s.notice}><Text style={s.noticeText}>اختر رحلة منشورة، أو أرسل طلباً ليقدّم لك السائقون والمكاتب عروضاً خاصة. موقع الالتقاط يحدده الراكب، ولا يوجد مكان انطلاق ثابت.</Text></View>
          {!listings.length && !refreshing && <Empty icon="🧭" title="لا توجد رحلات متاحة حالياً" sub="يمكنك نشر طلب سفر لتصلك عروض خاصة" />}
          {listings.map(x => (
            <View key={x.id} style={ui.card}>
              <View style={ui.cardTop}><Text style={ui.h}>إلى {x.destination}</Text><Pill text={`${x.seats_left} مقعد متاح`} tone="ok" /></View>
              <Text style={ui.sub}>مقدّم الخدمة: {x.provider_name || 'مقدّم سفريات'} • الانطلاق {when(x.departure_at)}</Text>
              <View style={ui.chips}>
                <Pill text={`${money(x.fare_per_passenger)} لكل راكب`} tone="brand" />
                {x.baggage_limit != null && <Pill text={`حقائب حتى ${x.baggage_limit}`} tone="mute" />}
                <Pill text={x.security_approval ? 'إمكانية إصدار موافقات أمنية' : 'دون موافقات أمنية'} tone={x.security_approval ? 'ok' : 'mute'} />
              </View>
              {!!x.notes && <Text style={s.notes}>{x.notes}</Text>}
              <Text style={s.flexPickup}>الالتقاط من الموقع الذي تحدده عند الحجز</Text>
              <Btn label="اختيار الرحلة" onPress={() => openBooking(x)} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          {!mine.requests.length && !mine.bookings.length && <>
            <Empty icon="🧾" title={authed ? 'لا توجد طلبات أو حجوزات بعد' : 'سجّل الدخول لمتابعة طلباتك'} sub="يمكنك تصفح الرحلات أو نشر طلب سفر" />
            {!authed && <Btn label="تسجيل الدخول" onPress={() => router.push('/login' as any)} />}
          </>}
          {mine.requests.map(r => {
            const status = STATUS[r.status] || [r.status || '—', 'mute'];
            return <View key={r.id} style={ui.card}>
              <View style={ui.cardTop}><Text style={ui.h}>طلب إلى {r.destination}</Text><Pill text={status[0]} tone={status[1]} /></View>
              <Text style={ui.sub}>الالتقاط: {r.pickup_label} • {r.passengers} ركاب • {r.bags || 0} حقائب</Text>
              {!!r.has_luggage && <Text style={s.notes}>مع الراكب عفش</Text>}
              {!!r.notes && <Text style={s.notes}>{r.notes}</Text>}
              {r.status === 'open' && <Text style={s.waiting}>بانتظار عروض مقدمي الخدمة</Text>}
              {r.status === 'closed' && r.close_reason === 'booked_listing' && <Text style={s.waiting}>تم إغلاق هذا الطلب بعد حجز رحلة منشورة إلى الوجهة نفسها.</Text>}
              {!!r.offers?.length && <View style={s.offerBlock}>
                <Text style={s.offerTitle}>العروض الخاصة بهذا الطلب</Text>
                {r.offers.map((o: any) => <View key={o.id} style={s.offer}>
                  <View style={ui.cardTop}><Text style={s.offerName}>{o.provider_name || 'مقدّم سفريات'}</Text><Pill text={`${money(o.fare_per_passenger)} لكل راكب`} tone="brand" /></View>
                  {!!o.notes && <Text style={s.notes}>{o.notes}</Text>}
                  {o.status === 'pending' && r.status === 'open' && <Btn small tone="ok" loading={busy} label="اختيار هذا العرض" onPress={() => chooseOffer(o)} />}
                  {o.status === 'accepted' && r.status === 'accepted' && <View style={{ gap: 7, marginTop: 8 }}>
                    <Text style={s.waiting}>تم الاختيار؛ أُغلق الطلب أمام بقية مقدمي الخدمة.</Text>
                    {!!o.provider_phone && <CallBtn phone={o.provider_phone} />}
                  </View>}
                  {o.status === 'rejected' && <Text style={s.muted}>لم يتم اختيار هذا العرض.</Text>}
                </View>)}
              </View>}
              {r.status === 'open' && <Btn small tone="err" loading={busy} label="إلغاء الطلب" onPress={() => cancelRequest(r.id)} />}
            </View>;
          })}
          {mine.bookings.map(b => <View key={b.id} style={ui.card}>
            <View style={ui.cardTop}><Text style={ui.h}>رحلة إلى {b.destination}</Text><Pill text={STATUS[b.status]?.[0] || b.status} tone={STATUS[b.status]?.[1] || 'mute'} /></View>
            <Text style={ui.sub}>{b.departure_at ? `الانطلاق ${when(b.departure_at)} • ` : ''}الالتقاط: {b.pickup_label || '—'}</Text>
            <Row k="عدد الركاب" v={String(b.passengers)} /><Row k="الأجرة لكل راكب" v={money(b.fare_per_passenger)} /><Row k="المجموع" v={money(b.total)} strong />
            {!!b.has_luggage && <Text style={s.notes}>مع الراكب عفش • {b.bags || 0} حقائب</Text>}
            {b.status === 'confirmed' && <View style={{ gap: 8, marginTop: 8 }}>
              <Row k="مقدّم الخدمة" v={b.provider_name || '—'} />
              {!!b.provider_phone && <CallBtn phone={b.provider_phone} />}
            </View>}
          </View>)}
        </ScrollView>
      )}

      <Modal visible={requestOpen} animationType="slide" onRequestClose={() => setRequestOpen(false)}>
        <View style={ui.page}>
          <Header title="طلب سفر" onBack={() => setRequestOpen(false)} />
          <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
            <Text style={s.formIntro}>انشر طلبك ليتمكّن مقدمو السفر من إرسال أجرة خاصة لهذه الرحلة.</Text>
            <Field label="موقع الالتقاط"><Pressable style={s.pickButton} onPress={() => setPointTarget('request')}><Text style={s.pickText}>{request.point?.label || 'حدد موقعك على الخريطة'}</Text><Text>📍</Text></Pressable></Field>
            <Field label="الوجهة"><TextInput value={request.destination} onChangeText={v => setRequest(x => ({ ...x, destination: v }))} placeholder="اكتب المدينة أو المنطقة المقصودة" placeholderTextColor="#94a3b8" style={s.input} /></Field>
            <Counter label="عدد الركاب" value={request.passengers} min={1} max={50} onChange={n => setRequest(x => ({ ...x, passengers: n }))} />
            <Counter label="عدد الحقائب" value={request.bags} min={0} max={50} onChange={n => setRequest(x => ({ ...x, bags: n }))} />
            <Toggle label="هل معك عفش؟" value={request.hasLuggage} onChange={v => setRequest(x => ({ ...x, hasLuggage: v }))} />
            <Field label="ملاحظات (اختياري)"><TextInput value={request.notes} onChangeText={v => setRequest(x => ({ ...x, notes: v }))} multiline placeholder="أي تفاصيل تساعد مقدم الخدمة" placeholderTextColor="#94a3b8" style={[s.input, s.multiline]} /></Field>
            <Btn label="نشر طلب السفر" loading={busy} onPress={postRequest} />
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={ui.page}>
          <Header title="حجز رحلة" onBack={() => setSelected(null)} />
          <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
            <View style={s.notice}><Text style={s.noticeText}>إلى {selected?.destination} • {when(selected?.departure_at)} • {money(selected?.fare_per_passenger)} لكل راكب</Text></View>
            <Text style={s.formIntro}>حدّد موقع الالتقاط المرن. تظهر بيانات التواصل بعد تأكيد الحجز.</Text>
            <Field label="موقع الالتقاط"><Pressable style={s.pickButton} onPress={() => setPointTarget('booking')}><Text style={s.pickText}>{booking.point?.label || 'حدد موقعك على الخريطة'}</Text><Text>📍</Text></Pressable></Field>
            <Counter label={`عدد الركاب (المتاح ${selected?.seats_left || 0})`} value={booking.passengers} min={1} max={Math.max(1, Number(selected?.seats_left) || 1)} onChange={n => setBooking(x => ({ ...x, passengers: n }))} />
            <Counter label={`عدد الحقائب${selected?.baggage_limit != null ? ` (الحد ${selected.baggage_limit})` : ''}`} value={booking.bags} min={0} max={30} onChange={n => setBooking(x => ({ ...x, bags: n }))} />
            <Toggle label="هل معك عفش؟" value={booking.hasLuggage} onChange={v => setBooking(x => ({ ...x, hasLuggage: v }))} />
            <Field label="ملاحظات (اختياري)"><TextInput value={booking.notes} onChangeText={v => setBooking(x => ({ ...x, notes: v }))} multiline placeholder="أي تفاصيل عن نقطة الالتقاط أو الأمتعة" placeholderTextColor="#94a3b8" style={[s.input, s.multiline]} /></Field>
            <Row k="الأجرة لكل راكب" v={money(selected?.fare_per_passenger)} />
            <Row k="المجموع التقديري" v={money(Number(selected?.fare_per_passenger || 0) * booking.passengers)} strong />
            <Btn label="تأكيد الحجز" loading={busy} onPress={bookListing} />
          </ScrollView>
        </View>
      </Modal>

      <PointPicker visible={pointTarget !== null} title="موقع الالتقاط" initial={pointTarget === 'request' ? request.point?.ll || null : booking.point?.ll || null}
        onClose={() => setPointTarget(null)} onConfirm={(ll, label) => {
          const point = { ll, label };
          if (pointTarget === 'request') setRequest(x => ({ ...x, point }));
          else if (pointTarget === 'booking') setBooking(x => ({ ...x, point }));
          setPointTarget(null);
        }} />
    </View>
  );
}

const s = StyleSheet.create({
  providerLink: { paddingHorizontal: 12, paddingTop: 4, alignItems: 'flex-start' },
  notice: { backgroundColor: '#F0FDFA', borderColor: '#99F6E4', borderWidth: 1, padding: 11, borderRadius: 13, marginBottom: 10 },
  noticeText: { color: '#115E59', fontSize: 12, fontWeight: '700', textAlign: 'right', lineHeight: 18 },
  notes: { color: C.mute, textAlign: 'right', fontSize: 12, marginTop: 6, lineHeight: 18 },
  flexPickup: { color: '#0F766E', textAlign: 'right', fontSize: 11, fontWeight: '800', marginTop: 8, marginBottom: 10 },
  waiting: { color: '#92400E', fontSize: 12, fontWeight: '800', textAlign: 'right', marginVertical: 7 },
  muted: { color: C.mute, fontSize: 11, textAlign: 'right', marginTop: 5 },
  offerBlock: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, gap: 8 },
  offerTitle: { textAlign: 'right', color: C.txt, fontWeight: '900', fontSize: 13 },
  offer: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: C.line, gap: 6 },
  offerName: { fontSize: 13, fontWeight: '900', color: C.txt, textAlign: 'right' },
  form: { padding: 16, paddingBottom: 42, gap: 13 },
  formIntro: { color: C.mute, textAlign: 'right', lineHeight: 20, fontSize: 12, fontWeight: '700' },
  field: { gap: 6 },
  label: { color: C.txt, textAlign: 'right', fontSize: 13, fontWeight: '900' },
  input: { backgroundColor: '#fff', borderWidth: 1.3, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: C.txt, textAlign: 'right', fontSize: 14 },
  multiline: { minHeight: 82, textAlignVertical: 'top' },
  pickButton: { minHeight: 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.3, borderColor: C.line, backgroundColor: '#fff', flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  pickText: { flex: 1, color: C.txt, textAlign: 'right', fontSize: 13, fontWeight: '700' },
  counterRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', minHeight: 42 },
  counterLabel: { flex: 1, color: C.txt, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  counterBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  counterBtnT: { color: C.txt, fontSize: 20, fontWeight: '900' },
  counterValue: { minWidth: 24, textAlign: 'center', color: C.txt, fontWeight: '900', fontSize: 15 },
  toggleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  toggleChoices: { flexDirection: 'row-reverse', gap: 6 },
  toggle: { minWidth: 56, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9' },
  toggleOn: { backgroundColor: '#0F766E' },
  toggleText: { color: C.txt, fontWeight: '800', fontSize: 12 },
  toggleTextOn: { color: '#fff' },
});
