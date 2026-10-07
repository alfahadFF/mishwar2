import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, RefreshControl, Modal, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { useToast } from '../components/Toast';
import { Header, Tabs, Pill, Empty, Row, Btn, CallBtn, ui, C } from '../components/DriverUI';
import DatePicker, { ymd } from '../components/DatePicker';
import TimePicker from '../components/TimePicker';

type ListingForm = { destination: string; date: string; time: string; seats: number; fare: string; bags: string; notes: string; security: boolean };
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); };
const emptyListing = (): ListingForm => ({ destination: '', date: tomorrow(), time: '09:00', seats: 4, fare: '', bags: '', notes: '', security: false });
const STATUS: Record<string, [string, 'warn' | 'ok' | 'err' | 'mute']> = {
  active: ['متاحة', 'ok'], paused: ['متوقفة مؤقتاً', 'warn'], full: ['اكتملت المقاعد', 'mute'], cancelled: ['ملغاة', 'err'],
  pending: ['بانتظار رد الراكب', 'warn'], accepted: ['تم القبول', 'ok'], rejected: ['لم يُختر العرض', 'mute'], confirmed: ['مؤكد', 'ok'],
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
function Counter({ label, value, onChange, min = 1, max = 50 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return <View style={s.counterRow}>
    <Text style={s.counterLabel}>{label}</Text>
    <View style={s.counter}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={s.counterBtn}><Text style={s.counterBtnT}>−</Text></Pressable>
      <Text style={s.counterValue}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={s.counterBtn}><Text style={s.counterBtnT}>+</Text></Pressable>
    </View>
  </View>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <View style={s.toggleRow}>
    <Text style={s.counterLabel}>{label}</Text>
    <View style={s.toggleChoices}>
      {[['yes', 'نعم', true], ['no', 'لا', false]].map(([k, title, v]) => <Pressable key={String(k)} onPress={() => onChange(Boolean(v))} style={[s.toggle, value === v && s.toggleOn]}>
        <Text style={[s.toggleText, value === v && s.toggleTextOn]}>{String(title)}</Text>
      </Pressable>)}
    </View>
  </View>;
}

export default function TravelProviderScreen() {
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const toast = useToast();
  const [tab, setTab] = useState('listings');
  const [profile, setProfile] = useState<any>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [data, setData] = useState<{ listings: any[]; requests: any[]; offers: any[]; bookings: any[] }>({ listings: [], requests: [], offers: [], bookings: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [listing, setListing] = useState<ListingForm>(emptyListing());
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [offerRequest, setOfferRequest] = useState<any>(null);
  const [offerFare, setOfferFare] = useState('');
  const [offerNotes, setOfferNotes] = useState('');

  const loadProfile = useCallback(async () => {
    const { data: p, error } = await supabase.rpc('my_work_profile');
    const value = error ? null : p || null;
    setProfile(value);
    setProfileLoaded(true);
    return value;
  }, []);
  const loadData = useCallback(async () => {
    const { data: d, error } = await supabase.rpc('travel_provider_data');
    if (error) { toast.show(errMsg(error), 'err'); return; }
    const x = (d || {}) as any;
    setData({ listings: x.listings || [], requests: x.requests || [], offers: x.offers || [], bookings: x.bookings || [] });
  }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    const p = await loadProfile();
    if (p?.travel && ['driver', 'business'].includes(p?.type)) await loadData();
    else setData({ listings: [], requests: [], offers: [], bookings: [] });
    setRefreshing(false);
  }, [loadProfile, loadData]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (['listings','requests','offers','bookings'].includes(tabParam || '')) setTab(tabParam!); }, [tabParam]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const createListing = async () => {
    if (!listing.destination.trim()) return toast.show('اكتب الوجهة', 'err');
    if (!(Number(listing.fare) > 0)) return toast.show('اكتب أجرة صحيحة لكل راكب', 'err');
    if (listing.bags.trim() && (!Number.isInteger(Number(listing.bags)) || Number(listing.bags) < 0)) return toast.show('عدد الحقائب غير صحيح', 'err');
    const [yy, mm, dd] = listing.date.split('-').map(Number);
    const [hh, min] = listing.time.split(':').map(Number);
    const departure = new Date(yy, mm - 1, dd, hh, min, 0, 0);
    if (!Number.isFinite(departure.getTime()) || departure.getTime() <= Date.now()) return toast.show('اختر موعد انطلاق لاحقاً', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('travel_create_listing', {
      p_destination: listing.destination.trim(), p_departure_at: departure.toISOString(), p_seats: listing.seats,
      p_fare_per_passenger: Number(listing.fare), p_baggage_limit: listing.bags.trim() ? Number(listing.bags) : null,
      p_notes: listing.notes.trim() || null, p_security_approval: listing.security,
    });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم نشر الرحلة ✓'); setNewOpen(false); setListing(emptyListing()); await loadData();
  };
  const listingAction = async (id: string, action: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('travel_listing_action', { p_listing: id, p_action: action });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show(action === 'cancel' ? 'تم إلغاء الرحلة' : action === 'pause' ? 'تم إيقاف الرحلة مؤقتاً' : 'تمت إعادة إتاحة الرحلة'); await loadData();
  };
  const sendOffer = async () => {
    if (!offerRequest) return;
    if (!(Number(offerFare) > 0)) return toast.show('اكتب أجرة صحيحة لكل راكب', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('travel_send_offer', { p_request: offerRequest.id, p_fare_per_passenger: Number(offerFare), p_notes: offerNotes.trim() || null });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم إرسال عرضك للراكب ✓'); setOfferRequest(null); setOfferFare(''); setOfferNotes(''); await loadData();
  };
  const openOffer = (r: any) => { setOfferRequest(r); setOfferFare(''); setOfferNotes(''); };
  const isProvider = !!profile?.travel && ['driver', 'business'].includes(profile?.type);
  const goRegister = () => router.push((profile?.type === 'business' ? '/office-register' : '/work-register?role=travel') as any);

  if (!profileLoaded) return <View style={ui.page}><Header title="خدمة السفريات" onBack={() => router.back()} /><View style={{ padding: 16 }}><Empty icon="🧭" title="جارٍ تحميل بيانات الخدمة" /></View></View>;
  if (!profile) return <View style={ui.page}>
    <Header title="خدمة السفريات" onBack={() => router.back()} />
    <View style={{ padding: 16, gap: 12 }}><Empty icon="🔐" title="سجّل الدخول للمتابعة" /><Btn label="تسجيل الدخول" onPress={() => router.push('/login' as any)} /><Btn tone="ghost" label="تصفح الرحلات" onPress={() => router.replace('/travel' as any)} /></View>
  </View>;
  if (!isProvider) return <View style={ui.page}>
    <Header title="خدمة السفريات" onBack={() => router.back()} />
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={ui.card}>
        <Text style={s.registerTitle}>انضم إلى مقدمي خدمة السفريات</Text>
        <Text style={s.registerText}>يمكن للسائق التسجيل ببيانات المركبة، ويمكن للمكتب تفعيل الخدمة من بيانات المكتب. لا توجد تعرفة عامة؛ تحدد أجرة كل رحلة أو عرض بشكل مستقل.</Text>
        <Btn label={profile?.type === 'business' ? 'تفعيل السفريات للمكتب' : 'التسجيل كسائق سفريات'} onPress={goRegister} />
        <Btn tone="ghost" label="تصفح الرحلات وطلبات السفر" onPress={() => router.replace('/travel' as any)} />
      </View>
    </ScrollView>
  </View>;

  return (
    <View style={ui.page}>
      <Header title="سفرياتي" onBack={() => router.back()} right={<Btn small label="＋ نشر رحلة" onPress={() => { setListing(emptyListing()); setNewOpen(true); }} />} />
      <View style={s.passengerLink}><Btn small tone="ghost" label="عرض الرحلات وطلبات السفر" onPress={() => router.push('/travel' as any)} /></View>
      <Tabs tabs={[
        { k: 'listings', label: 'رحلاتي', n: data.listings.length },
        { k: 'requests', label: 'طلبات الركاب', n: data.requests.length },
        { k: 'offers', label: 'عروضي', n: data.offers.length },
        { k: 'bookings', label: 'الحجوزات', n: data.bookings.length },
      ]} value={tab} onChange={setTab} />
      {tab === 'listings' && <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {!data.listings.length && <Empty icon="🧭" title="لم تنشر رحلات بعد" sub="انشر رحلة بوجهة وموعد وأجرة لكل راكب" />}
        {data.listings.map(x => <View key={x.id} style={ui.card}>
          <View style={ui.cardTop}><Text style={ui.h}>إلى {x.destination}</Text><Pill text={STATUS[x.status]?.[0] || x.status} tone={STATUS[x.status]?.[1] || 'mute'} /></View>
          <Text style={ui.sub}>الانطلاق {when(x.departure_at)} • المقاعد المتبقية {x.seats_left} من {x.seats_total}</Text>
          <View style={ui.chips}><Pill text={`${money(x.fare_per_passenger)} لكل راكب`} tone="brand" />{x.baggage_limit != null && <Pill text={`حد الحقائب ${x.baggage_limit}`} tone="mute" />}
            <Pill text={x.security_approval ? 'موافقات أمنية متاحة' : 'دون موافقات أمنية'} tone={x.security_approval ? 'ok' : 'mute'} /></View>
          {!!x.notes && <Text style={s.notes}>{x.notes}</Text>}
          <Text style={s.flexPickup}>لا يلزم مكان انطلاق ثابت؛ يحدد الراكب موقع الالتقاط عند الحجز.</Text>
          {(x.status === 'active' || x.status === 'paused') && <View style={s.actions}>
            <Btn small tone="ghost" label={x.status === 'active' ? 'إيقاف مؤقت' : 'إعادة الإتاحة'} loading={busy} onPress={() => listingAction(x.id, x.status === 'active' ? 'pause' : 'resume')} />
            <Btn small tone="err" label="إلغاء الرحلة" loading={busy} onPress={() => listingAction(x.id, 'cancel')} />
          </View>}
        </View>)}
      </ScrollView>}
      {tab === 'requests' && <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {!data.requests.length && <Empty icon="📣" title="لا توجد طلبات مفتوحة حالياً" sub="تظهر هنا طلبات السفر المفتوحة ضمن بلدك" />}
        {data.requests.map(r => <View key={r.id} style={ui.card}>
          <View style={ui.cardTop}><Text style={ui.h}>إلى {r.destination}</Text><Pill text={`${r.passengers} ركاب`} tone="brand" /></View>
          <Text style={ui.sub}>الالتقاط: {r.pickup_label || '—'} • {r.bags || 0} حقائب{r.has_luggage ? ' • مع الراكب عفش' : ''}</Text>
          {!!r.notes && <Text style={s.notes}>{r.notes}</Text>}
          {r.my_offer_id ? <Text style={s.sent}>أرسلت عرضاً لهذا الطلب؛ ينتظر اختيار الراكب.</Text> : <Btn label="إرسال عرض خاص لهذا الطلب" onPress={() => openOffer(r)} />}
        </View>)}
      </ScrollView>}
      {tab === 'offers' && <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {!data.offers.length && <Empty icon="💬" title="لم ترسل عروضاً بعد" sub="يمكنك إرسال سعر خاص لكل طلب مفتوح" />}
        {data.offers.map(o => <View key={o.id} style={ui.card}>
          <View style={ui.cardTop}><Text style={ui.h}>عرض إلى {o.destination}</Text><Pill text={STATUS[o.status]?.[0] || o.status} tone={STATUS[o.status]?.[1] || 'mute'} /></View>
          <Row k="الأجرة لكل راكب" v={money(o.fare_per_passenger)} strong />
          {!!o.notes && <Text style={s.notes}>{o.notes}</Text>}
          {o.status === 'accepted' && <View style={{ gap: 8, marginTop: 8 }}>
            <Text style={s.sent}>وافق الراكب على عرضك؛ بيانات التواصل متاحة الآن.</Text>
            {!!o.passenger_phone && <CallBtn phone={o.passenger_phone} />}
          </View>}
        </View>)}
      </ScrollView>}
      {tab === 'bookings' && <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {!data.bookings.length && <Empty icon="✅" title="لا توجد حجوزات مؤكدة بعد" />}
        {data.bookings.map(b => <View key={b.id} style={ui.card}>
          <View style={ui.cardTop}><Text style={ui.h}>رحلة إلى {b.destination}</Text><Pill text={STATUS[b.status]?.[0] || b.status} tone={STATUS[b.status]?.[1] || 'mute'} /></View>
          {!!b.departure_at && <Text style={ui.sub}>الانطلاق {when(b.departure_at)}</Text>}
          <Row k="موقع الالتقاط" v={b.pickup_label || '—'} /><Row k="عدد الركاب" v={String(b.passengers)} /><Row k="المجموع" v={money(b.total)} strong />
          {!!b.has_luggage && <Text style={s.notes}>مع الراكب عفش • {b.bags || 0} حقائب</Text>}
          {b.status === 'confirmed' && !!b.passenger_phone && <CallBtn phone={b.passenger_phone} />}
        </View>)}
      </ScrollView>}

      <Modal visible={newOpen} animationType="slide" onRequestClose={() => setNewOpen(false)}>
        <View style={ui.page}>
          <Header title="نشر رحلة سفريات" onBack={() => setNewOpen(false)} />
          <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
            <View style={s.notice}><Text style={s.noticeText}>حدد وجهة الرحلة وموعدها. لا نطلب مكان انطلاق ثابتاً؛ يحدد كل راكب موقع الالتقاط عند الحجز.</Text></View>
            <Field label="الوجهة"><TextInput value={listing.destination} onChangeText={v => setListing(x => ({ ...x, destination: v }))} placeholder="المدينة أو المنطقة المقصودة" placeholderTextColor="#94a3b8" style={s.input} /></Field>
            <Field label="تاريخ الانطلاق"><Pressable style={s.picker} onPress={() => setDateOpen(true)}><Text style={s.pickerText}>{listing.date}</Text><Text>📅</Text></Pressable></Field>
            <Field label="ساعة الانطلاق"><Pressable style={s.picker} onPress={() => setTimeOpen(true)}><Text style={s.pickerText}>{listing.time}</Text><Text>🕒</Text></Pressable></Field>
            <Counter label="عدد المقاعد" value={listing.seats} min={1} max={50} onChange={n => setListing(x => ({ ...x, seats: n }))} />
            <Field label="الأجرة لكل راكب"><TextInput value={listing.fare} onChangeText={v => setListing(x => ({ ...x, fare: v.replace(/[^0-9.]/g, '') }))} keyboardType="decimal-pad" placeholder="السعر لهذه الرحلة" placeholderTextColor="#94a3b8" style={s.input} /></Field>
            <Field label="الحد الأقصى للحقائب (اختياري)"><TextInput value={listing.bags} onChangeText={v => setListing(x => ({ ...x, bags: v.replace(/[^0-9]/g, '') }))} keyboardType="number-pad" placeholder="اتركه فارغاً إن لم تحدد حداً" placeholderTextColor="#94a3b8" style={s.input} /></Field>
            <Toggle label="إمكانية إصدار موافقات أمنية" value={listing.security} onChange={v => setListing(x => ({ ...x, security: v }))} />
            <Field label="ملاحظات (اختياري)"><TextInput value={listing.notes} onChangeText={v => setListing(x => ({ ...x, notes: v }))} multiline placeholder="أي تفاصيل عن الرحلة أو الالتقاط" placeholderTextColor="#94a3b8" style={[s.input, s.multiline]} /></Field>
            <Btn label="نشر الرحلة" loading={busy} onPress={createListing} />
          </ScrollView>
        </View>
      </Modal>
      <DatePicker visible={dateOpen} title="تاريخ الانطلاق" value={listing.date} minDate={new Date()} onClose={() => setDateOpen(false)} onPick={v => setListing(x => ({ ...x, date: v }))} />
      <TimePicker visible={timeOpen} title="ساعة الانطلاق" value={listing.time} onClose={() => setTimeOpen(false)} onPick={v => setListing(x => ({ ...x, time: v }))} />

      <Modal visible={!!offerRequest} animationType="slide" transparent onRequestClose={() => setOfferRequest(null)}>
        <View style={s.shade}><View style={s.offerModal}>
          <Text style={s.modalTitle}>إرسال عرض خاص</Text>
          <Text style={s.formIntro}>الوجهة: {offerRequest?.destination} • {offerRequest?.passengers} ركاب</Text>
          <Field label="الأجرة لكل راكب"><TextInput value={offerFare} onChangeText={v => setOfferFare(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="حدد سعر هذه الرحلة" placeholderTextColor="#94a3b8" style={s.input} /></Field>
          <Field label="ملاحظات (اختياري)"><TextInput value={offerNotes} onChangeText={setOfferNotes} multiline placeholder="تفاصيل العرض" placeholderTextColor="#94a3b8" style={[s.input, s.multiline]} /></Field>
          <Btn label="إرسال العرض" loading={busy} onPress={sendOffer} />
          <Btn tone="ghost" label="رجوع" onPress={() => setOfferRequest(null)} />
        </View></View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  passengerLink: { paddingHorizontal: 12, paddingTop: 4, alignItems: 'flex-start' },
  notice: { backgroundColor: '#F0FDFA', borderColor: '#99F6E4', borderWidth: 1, padding: 11, borderRadius: 13, marginBottom: 10 },
  noticeText: { color: '#115E59', fontSize: 12, fontWeight: '700', textAlign: 'right', lineHeight: 18 },
  formIntro: { color: C.mute, textAlign: 'right', lineHeight: 20, fontSize: 12, fontWeight: '700' },
  notes: { color: C.mute, textAlign: 'right', fontSize: 12, marginTop: 6, lineHeight: 18 },
  flexPickup: { color: '#0F766E', textAlign: 'right', fontSize: 11, fontWeight: '800', marginTop: 8, marginBottom: 10 },
  sent: { color: '#065F46', textAlign: 'right', fontSize: 12, fontWeight: '800', marginVertical: 8 },
  registerTitle: { color: C.txt, fontSize: 17, fontWeight: '900', textAlign: 'right', marginBottom: 10 },
  registerText: { color: C.mute, fontSize: 13, lineHeight: 21, textAlign: 'right', marginBottom: 14 },
  actions: { flexDirection: 'row-reverse', gap: 8, marginTop: 8 },
  form: { padding: 16, paddingBottom: 42, gap: 13 },
  field: { gap: 6 },
  label: { color: C.txt, textAlign: 'right', fontSize: 13, fontWeight: '900' },
  input: { backgroundColor: '#fff', borderWidth: 1.3, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: C.txt, textAlign: 'right', fontSize: 14 },
  multiline: { minHeight: 78, textAlignVertical: 'top' },
  picker: { minHeight: 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.3, borderColor: C.line, backgroundColor: '#fff', flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  pickerText: { flex: 1, color: C.txt, textAlign: 'right', fontSize: 13, fontWeight: '800' },
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
  shade: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(15,23,42,.45)', padding: 16 },
  offerModal: { backgroundColor: '#fff', borderRadius: 20, padding: 16, gap: 12 },
  modalTitle: { textAlign: 'center', color: C.txt, fontSize: 16, fontWeight: '900' },
});
