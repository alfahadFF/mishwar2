import MyRatingCard from '../MyRatingCard';
import NewOrdersToggle from '../NewOrdersToggle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../utils/supabase';
import WorkStatusBanner from '../WorkStatusBanner';
import { vName } from '../../utils/vehicles';
import { orderDistances, OrderDist, fmtKm } from '../../utils/route';
import { getMyLocation } from '../../utils/location';
import { useWallet, money, COMMISSION } from '../../utils/wallet';
import { errMsg } from '../../utils/errors';
import { fmtDateTime } from '../../utils/events';
import { useToast } from '../Toast';
import WalletSheet from '../WalletSheet';
import TripRouteMap, { Segment, TripMarker } from '../TripRouteMap';
import type { PanelProps } from './types';
import { Header, Pill, Tabs, Empty, Row, Btn, CallBtn, Sheet, ui, C } from '../DriverUI';

const RADIUS = 10;
const POLL_MS = 20000;
type Pt = { lat: number; lng: number; label?: string; detail?: string };
const pts = (o: any): Pt[] => [...(o?.pickup_points || []), ...(o?.dropoff_points || [])].filter((p: any) => p && p.lat != null);
const lls = (o: any) => pts(o).map(p => [Number(p.lat), Number(p.lng)]);
const budgetText = (o: any) => (o.budget_type === 'fixed' && Number(o.budget_to) > 0 ? `${money(o.budget_from)} – ${money(o.budget_to)}` : 'بانتظار عرض سعرك');
const editedText = (f?: string[] | null) => {
  const x = f || [];
  const t = x.some(k => k.startsWith('sched') || k === 'timing_type' || k === 'is_urgent');
  const n = x.includes('notes');
  return t && n ? 'الموعد والملاحظات' : t ? 'الموعد' : 'الملاحظات';
};
const whenText = (o: any) => (o.timing_type === 'scheduled' ? `${o.scheduled_date || ''} ${String(o.scheduled_time || '').slice(0, 5)}`.trim() : 'فوري');

export default function CargoPanel({ mode = 'all', embedded = false }: PanelProps) {
  const router = useRouter();
  const toast = useToast();
  const { wallet, refresh: refreshWallet, isFree } = useWallet();
  const [profile, setProfile] = useState<any>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [tab, setTab] = useState(mode === 'bookings' ? 'jobs' : 'feed');
  const [feed, setFeed] = useState<any[] | null>(null);
  const [offers, setOffers] = useState<any[] | null>(null);
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [dist, setDist] = useState<Record<string, OrderDist>>({});
  const tried = useRef<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [popup, setPopup] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [offerFor, setOfferFor] = useState<any>(null);
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmAccept, setConfirmAccept] = useState<any>(null);
  const [revealed, setRevealed] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // الموقع وبيانات المركبة مرة واحدة
  useEffect(() => {
    getMyLocation().then(r => setMe(r.ll));
    supabase.rpc('my_driver_profile').then(({ data }) => setProfile(data || {}));
  }, []);

  const loadFeed = useCallback(async () => {
    if (!me || mode === 'bookings') return;
    const { data, error } = await supabase.rpc('carrier_cargo_feed', { p_lat: me[0], p_lng: me[1], p_radius_km: RADIUS });
    if (error) { setFeed(f => f || []); return; }
    const list = (data || []) as any[];
    const ids = new Set(list.map(o => o.id));
    if (known.current) {
      const nw = list.filter(o => !known.current!.has(o.id));
      if (nw.length) {
        setFresh(prev => new Set([...prev, ...nw.map(o => o.id)]));
        setPopup(nw[0]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }
    known.current = ids;
    setFeed(list);
  }, [me]);

  const loadOffers = useCallback(async () => {
    const { data } = await supabase.rpc('carrier_my_cargo_offers');
    setOffers((data || []) as any[]);
  }, []);
  const loadJobs = useCallback(async () => {
    const { data } = await supabase.rpc('carrier_my_cargo_jobs');
    setJobs((data || []) as any[]);
  }, []);
  const loadAll = useCallback(async () => { await Promise.all([loadFeed(), loadOffers(), loadJobs(), refreshWallet()]); }, [loadFeed, loadOffers, loadJobs, refreshWallet]);

  useEffect(() => {
    if (!me) return;
    loadAll();
    if (mode === 'bookings') return;
    const t = setInterval(loadFeed, POLL_MS);
    return () => clearInterval(t);
  }, [me]);

  // مسافة الطريق لكل طلب: محاولة واحدة فقط
  useEffect(() => {
    (feed || []).forEach(o => {
      if (tried.current.has(o.id)) return;
      tried.current.add(o.id);
      orderDistances(me, lls(o)).then(d => setDist(x => ({ ...x, [o.id]: d })));
    });
  }, [feed]);

  const onRefresh = async () => { setRefreshing(true); await loadAll(); setRefreshing(false); };
  const seen = (id: string) => setFresh(prev => { const n = new Set(prev); n.delete(id); return n; });
  const openDetail = (o: any) => { seen(o.id); setPopup(null); setDetail(o); };
  const feeText = (p: number) => (isFree ? 'بدون عمولة (الفترة المجانية)' : `العمولة 12%: ${money(p * COMMISSION)}`);

  const openOffer = (o: any) => {
    setOfferFor(o);
    setPrice(o.my_offer_price ? String(Number(o.my_offer_price)) : '');
    setMsg('');
  };
  const priceNum = Number(price);
  const fixed = offerFor?.budget_type === 'fixed' && Number(offerFor?.budget_to) > 0;
  const priceErr = !price ? '' : !(priceNum > 0) ? 'أدخل سعراً صحيحاً'
    : fixed && (priceNum < Number(offerFor.budget_from) || priceNum > Number(offerFor.budget_to)) ? `السعر ضمن ${money(offerFor.budget_from)} – ${money(offerFor.budget_to)}` : '';

  const sendOffer = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('carrier_send_cargo_offer', { p_order: offerFor.id, p_price: priceNum, p_message: msg.trim() || null });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setOfferFor(null); setDetail(null);
    toast.show(offerFor.my_offer_id ? 'تم تعديل العرض' : 'تم إرسال العرض');
    loadFeed(); loadOffers();
  };
  const withdraw = async (offerId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('carrier_withdraw_cargo_offer', { p_offer: offerId });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setDetail(null); toast.show('تم سحب العرض', 'info');
    loadFeed(); loadOffers();
  };
  const doAccept = async () => {
    const o = confirmAccept;
    setBusy(true);
    const { data, error } = await supabase.rpc('carrier_accept_cargo', { p_order: o.id });
    setBusy(false);
    if (error) { setConfirmAccept(null); loadFeed(); return toast.show(errMsg(error), 'err'); }
    setConfirmAccept(null); setDetail(null);
    setRevealed({ ...data, order: o });
    loadAll();
  };
  const complete = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('carrier_complete_cargo', { p_order: id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم تسليم الطلب'); loadJobs();
  };

  const noVehicle = profile && !profile.vehicle_class;
  const pendingOffers = (offers || []).filter(f => f.status === 'pending').length;
  const activeJobs = (jobs || []).filter(j => j.status === 'accepted').length;

  // في «حجوزاتي» تظهر المواعيد القادمة فقط
  const shownJobs: any[] = mode === 'bookings' ? (jobs || []).filter(j => j.status === 'accepted') : (jobs || []);

  return (
    <View style={ui.page}>
      {!embedded && <>
      <Header title="لوحة الناقل" onBack={() => router.back()} right={<>
        <Pill text={wallet ? `💳 ${money(wallet.balance)}` : '💳 —'} tone={(Number(wallet?.balance) < 0) ? 'err' : 'mute'} onPress={() => setWalletOpen(true)} />
        {isFree && <Pill text={`مجاني · ${wallet?.free_days_left} يوم`} tone="ok" onPress={() => setWalletOpen(true)} />}
      </>} />
      <WorkStatusBanner negative={false} />
      </>}

      {mode !== 'bookings' && (
      <View style={{ paddingHorizontal: 12, paddingTop: 10, flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' }}>
        <Pill text={profile?.vehicle_class ? vName(profile.vehicle_class) : 'المركبة: —'} tone="brand" />
        <Pill text={`النطاق ${RADIUS} كم`} />
      </View>
      )}

      {mode !== 'bookings' && <Tabs value={tab} onChange={setTab} tabs={[
        { k: 'feed', label: 'الطلبات', n: feed?.length },
        { k: 'offers', label: 'عروضي', n: pendingOffers },
        { k: 'jobs', label: 'أعمالي', n: activeJobs },
      ].filter(x => mode === 'all' || x.k !== 'jobs')} />}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {mode !== 'bookings' && <>
        <MyRatingCard />
        <NewOrdersToggle ping />
        {(Number(wallet?.balance) < 0) && (
          <View style={[ui.banner, { backgroundColor: C.errBg, borderColor: '#fecaca' }]}>
            <Text style={{ fontWeight: '900', color: C.err, textAlign: 'right' }}>رصيدك سالب ({money(wallet.balance)})</Text>
            <Text style={[ui.note, { color: C.err }]}>توقف ظهور الطلبات الجديدة حتى شحن الرصيد</Text>
          </View>
        )}
        </>}

        {tab === 'feed' && (noVehicle ? (
          <Empty icon="🚚" title="بيانات مركبتك قيد الاعتماد" sub="تظهر الطلبات بعد اعتماد فئة المركبة من الإدارة" />
        ) : !feed ? <Empty icon="⏳" title="جاري تحميل الطلبات" /> : feed.length === 0 ? (
          <Empty icon="📭" title="لا توجد طلبات حالياً" sub={`تظهر هنا طلبات النقل ضمن ${RADIUS} كم التي تناسب مركبتك`} />
        ) : feed.map(o => {
          const d = dist[o.id];
          const first = o.pickup_points?.[0], last = (o.dropoff_points || []).slice(-1)[0];
          return (
            <Pressable key={o.id} onPress={() => openDetail(o)} style={[ui.card, fresh.has(o.id) && ui.cardNew]}>
              <View style={ui.cardTop}>
                <Text style={ui.h}>{o.cargo_type || 'طلب نقل'}</Text>
                {fresh.has(o.id) ? <Pill text="جديد" tone="brand" /> : o.my_offer_status === 'pending' ? <Pill text={`عرضك ${money(o.my_offer_price)}`} tone="warn" /> : null}
              </View>
              <Text style={ui.sub} numberOfLines={1}>📍 {first?.label || '—'}</Text>
              <Text style={ui.sub} numberOfLines={1}>🏁 {last?.label || '—'}</Text>
              <View style={ui.chips}>
                <Pill text={vName(o.vehicle_class)} tone="brand" />
                <Pill text={whenText(o)} tone={o.timing_type === 'scheduled' ? 'mute' : 'warn'} />
                {o.weight_kg ? <Pill text={`${o.weight_kg} كغ`} /> : null}
              </View>
              <View style={ui.metrics}>
                <View style={ui.metric}><Text style={ui.metricV}>{d ? fmtKm(d.toMe) : '…'}</Text><Text style={ui.metricK}>يبعد عنك</Text></View>
                <View style={ui.metric}><Text style={ui.metricV}>{d ? fmtKm(d.tripKm) : '…'}</Text><Text style={ui.metricK}>مسافة الطلب</Text></View>
                <View style={[ui.metric, { flex: 1.4 }]}><Text style={[ui.metricV, { fontSize: 13 }]} numberOfLines={1}>{budgetText(o)}</Text><Text style={ui.metricK}>الميزانية</Text></View>
              </View>
            </Pressable>
          );
        }))}

        {tab === 'offers' && (!offers ? <Empty icon="⏳" title="جاري التحميل" /> : offers.length === 0 ? (
          <Empty icon="💬" title="لا توجد عروض" sub="العروض التي ترسلها للزبائن تظهر هنا" />
        ) : offers.map(f => (
          <View key={f.id} style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{f.cargo_type || 'طلب نقل'}</Text>
              <Pill text={f.status === 'pending' ? 'بانتظار الزبون' : 'لم يُختر'} tone={f.status === 'pending' ? 'warn' : 'mute'} />
            </View>
            <Text style={ui.sub} numberOfLines={1}>📍 {f.pickup_points?.[0]?.label || '—'}  ←  🏁 {(f.dropoff_points || []).slice(-1)[0]?.label || '—'}</Text>
            <Row k="سعرك" v={money(f.price)} strong />
            <Row k="التاريخ" v={fmtDateTime(f.created_at)} />
            {f.status === 'pending' && <View style={ui.btns}><Btn label="سحب العرض" tone="err" small onPress={() => withdraw(f.id)} loading={busy} /></View>}
          </View>
        )))}

        {tab === 'jobs' && (!jobs ? <Empty icon="⏳" title="جاري التحميل" /> : shownJobs.length === 0 ? (
          <Empty icon="📦" title="لا توجد أعمال بعد" sub="الطلبات المتفق عليها تظهر هنا مع بيانات الزبون" />
        ) : shownJobs.map(j => (
          <View key={j.id} style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{j.cargo_type || 'طلب نقل'}</Text>
              <Pill text={j.status === 'completed' ? 'مكتمل' : 'قيد التنفيذ'} tone={j.status === 'completed' ? 'mute' : 'ok'} />
            </View>
            <Text style={ui.sub} numberOfLines={1}>📍 {j.pickup_points?.[0]?.label || '—'}</Text>
            <Text style={ui.sub} numberOfLines={1}>🏁 {(j.dropoff_points || []).slice(-1)[0]?.label || '—'}</Text>
            <Row k="الزبون" v={j.customer_name} strong />
            <Row k="السعر المتفق عليه" v={money(j.agreed_price)} strong />
            <Row k="العمولة" v={Number(j.commission_amount) === 0 ? 'مجانية' : money(j.commission_amount)} />
            <Row k="الموعد" v={whenText(j)} />
            {!!j.notes && <Row k="ملاحظات" v={j.notes} />}
            {j.status === 'accepted' && !!j.edited_at && <View style={[ui.banner, { backgroundColor: C.warnBg, borderColor: '#fde68a', marginTop: 8, marginBottom: 0 }]}>
              <Text style={{ color: C.warn, fontWeight: '800', textAlign: 'right', fontSize: 12 }}>
                عدّل الزبون {editedText(j.edited_fields)} • {fmtDateTime(j.edited_at)}
              </Text>
            </View>}
            {j.status === 'accepted' && <View style={ui.btns}>
              <CallBtn phone={j.customer_phone} />
              <Btn label="تم التسليم" tone="ghost" onPress={() => complete(j.id)} loading={busy} />
            </View>}
          </View>
        )))}
      </ScrollView>

      {toast.node}

      {/* طلب جديد */}
      <Sheet visible={!!popup} onClose={() => setPopup(null)} title="طلب نقل جديد">
        {popup && <>
          <Text style={[ui.h, { textAlign: 'center' }]}>{popup.cargo_type || 'طلب نقل'}</Text>
          <Text style={[ui.sub, { textAlign: 'center' }]}>{vName(popup.vehicle_class)} • {whenText(popup)}</Text>
          <Row k="الانطلاق" v={popup.pickup_points?.[0]?.label} />
          <Row k="يبعد عنك" v={dist[popup.id] ? fmtKm(dist[popup.id].toMe) : '…'} />
          <Row k="الميزانية" v={budgetText(popup)} strong />
          <View style={ui.btns}>
            <Btn label="عرض التفاصيل" onPress={() => openDetail(popup)} />
            <Btn label="لاحقاً" tone="ghost" onPress={() => setPopup(null)} />
          </View>
        </>}
      </Sheet>

      {/* تفاصيل الطلب */}
      <Sheet visible={!!detail && !offerFor && !confirmAccept} onClose={() => setDetail(null)} title={detail?.cargo_type || 'طلب نقل'}>
        {detail && <ScrollView>
          <DetailMap o={detail} />
          <Row k="المركبة المطلوبة" v={vName(detail.vehicle_class)} />
          <Row k="الموعد" v={whenText(detail)} />
          {detail.weight_kg ? <Row k="الوزن" v={`${detail.weight_kg} كغ`} /> : null}
          {pts(detail).map((p, i) => <Row key={i} k={i < (detail.pickup_points || []).length ? `تحميل ${i + 1}` : `تنزيل ${i - (detail.pickup_points || []).length + 1}`} v={p.label + (p.detail ? ` • ${p.detail}` : '')} />)}
          {detail.need_workers && <Row k="عمّال" v={detail.workers_count || 'نعم'} />}
          {detail.need_equipment && <Row k="معدات" v={detail.equipment_detail || 'نعم'} />}
          {detail.lift_down && <Row k="تنزيل من طابق" v={`${detail.floor_from ?? '—'}${detail.elevator_from ? ' • مصعد' : ''}`} />}
          {detail.lift_up && <Row k="رفع إلى طابق" v={`${detail.floor_to ?? '—'}${detail.elevator_to ? ' • مصعد' : ''}`} />}
          {!!detail.floor_note && <Row k="ملاحظة" v={detail.floor_note} />}
          <Row k="الميزانية" v={budgetText(detail)} strong />
          <Text style={ui.note}>هوية الزبون ورقم هاتفه تظهر بعد الاتفاق.</Text>
          {detail.my_offer_status === 'pending' ? (
            <View style={ui.btns}>
              <Btn label={`تعديل عرضك (${money(detail.my_offer_price)})`} onPress={() => openOffer(detail)} />
              <Btn label="سحب" tone="err" onPress={() => withdraw(detail.my_offer_id)} loading={busy} />
            </View>
          ) : detail.budget_type === 'fixed' && Number(detail.budget_to) > 0 ? (
            <View style={ui.btns}>
              <Btn label={`قبول بـ ${money(detail.budget_to)}`} tone="ok" onPress={() => setConfirmAccept(detail)} />
              <Btn label="تقديم عرض" onPress={() => openOffer(detail)} />
            </View>
          ) : (
            <View style={ui.btns}><Btn label="تقديم عرض سعر" onPress={() => openOffer(detail)} /></View>
          )}
        </ScrollView>}
        {toast.node}
      </Sheet>

      {/* عرض السعر */}
      <Sheet visible={!!offerFor} onClose={() => setOfferFor(null)} title={offerFor?.my_offer_id ? 'تعديل العرض' : 'تقديم عرض سعر'}>
        {offerFor && <>
          {fixed && <Text style={[ui.note, { textAlign: 'center' }]}>ميزانية الزبون: {money(offerFor.budget_from)} – {money(offerFor.budget_to)}</Text>}
          <Text style={ui.label}>سعرك</Text>
          <TextInput value={price} onChangeText={t => setPrice(t.replace(/[^0-9.]/g, ''))} keyboardType="numeric" placeholder="السعر" style={[ui.input, !!priceErr && { borderColor: C.err }]} />
          {!!priceErr && <Text style={[ui.note, { color: C.err }]}>{priceErr}</Text>}
          <Text style={ui.label}>رسالة للزبون (اختياري)</Text>
          <TextInput value={msg} onChangeText={setMsg} placeholder="مثال: متاح خلال ساعة" style={ui.input} maxLength={200} />
          {priceNum > 0 && !priceErr && <Text style={ui.note}>{feeText(priceNum)} — تُخصم عند قبول الزبون</Text>}
          <View style={ui.btns}>
            <Btn label="إرسال" onPress={sendOffer} disabled={!price || !!priceErr} loading={busy} />
            <Btn label="إلغاء" tone="ghost" onPress={() => setOfferFor(null)} />
          </View>
        </>}
        {toast.node}
      </Sheet>

      {/* تأكيد القبول */}
      <Sheet visible={!!confirmAccept} onClose={() => setConfirmAccept(null)} title="تأكيد القبول">
        {confirmAccept && <>
          <Row k="الطلب" v={confirmAccept.cargo_type} />
          <Row k="السعر" v={money(confirmAccept.budget_to)} strong />
          <Row k="العمولة" v={isFree ? 'بدون عمولة (الفترة المجانية)' : money(Number(confirmAccept.budget_to) * COMMISSION)} />
          <Text style={ui.note}>عند التأكيد تُخصم العمولة من رصيدك وتظهر بيانات الزبون فوراً.</Text>
          <View style={ui.btns}>
            <Btn label="تأكيد" tone="ok" onPress={doAccept} loading={busy} />
            <Btn label="رجوع" tone="ghost" onPress={() => setConfirmAccept(null)} />
          </View>
        </>}
      </Sheet>

      {/* بيانات الزبون بعد القبول */}
      <Sheet visible={!!revealed} onClose={() => setRevealed(null)} title="تم الاتفاق">
        {revealed && <>
          <Row k="الزبون" v={revealed.customer_name} strong />
          <Row k="الهاتف" v={revealed.customer_phone} />
          <Row k="السعر" v={money(revealed.agreed_price)} />
          <Row k="العمولة" v={Number(revealed.commission) === 0 ? 'مجانية' : money(revealed.commission)} />
          <View style={ui.btns}><CallBtn phone={revealed.customer_phone} /></View>
          <View style={ui.btns}><Btn label="إلى أعمالي" tone="ghost" onPress={() => { setRevealed(null); if (mode === 'all') setTab('jobs'); else router.push('/bookings?tab=cargo' as any); }} /></View>
        </>}
      </Sheet>

      <WalletSheet visible={walletOpen} wallet={wallet} onClose={() => setWalletOpen(false)} />
    </View>
  );
}

function DetailMap({ o }: { o: any }) {
  const P = pts(o);
  const L = P.map(p => [Number(p.lat), Number(p.lng)]);
  const nPick = (o.pickup_points || []).length;
  if (L.length < 2) return null;
  const segments: Segment[] = [{ key: 'trip', name: 'مسار الطلب', icon: '🛣️', color: C.brand, pts: L }];
  const markers: TripMarker[] = P.map((p, i) => ({ ll: L[i], txt: i < nPick ? `تحميل ${i + 1}` : `تنزيل ${i - nPick + 1}`, color: i < nPick ? 'green' : 'red' }));
  return <View style={{ marginBottom: 8 }}><TripRouteMap segments={segments} markers={markers} /></View>;
}
