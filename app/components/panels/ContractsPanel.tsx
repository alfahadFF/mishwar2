import MyRatingCard from '../MyRatingCard';
import NewOrdersToggle from '../NewOrdersToggle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, RefreshControl, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../utils/supabase';
import WorkStatusBanner from '../WorkStatusBanner';
import { orderDistances, OrderDist, fmtKm } from '../../utils/route';
import { getMyLocation } from '../../utils/location';
import { useWallet, money, COMMISSION } from '../../utils/wallet';
import { errMsg } from '../../utils/errors';
import { DriverProfile } from '../../utils/events';
import { CT_CATS, unitOf, durText, ctVehName, daysText, ctCanServe } from '../../utils/contracts';
import { useToast } from '../Toast';
import WalletSheet from '../WalletSheet';
import ContractMap, { ctTripLLs } from '../ContractMap';
import { vehicleLine } from '../EventMap';
import type { PanelProps } from './types';
import { Header, Pill, Tabs, Empty, Row, Btn, CallBtn, Sheet, ui, C } from '../DriverUI';

const POLL_MS = 20000;
const REASON: Record<string, string> = { filled: 'اكتمل العدد', customer: 'اختار الزبون عرضاً آخر', cancelled: 'ألغى الزبون الطلب' };
const catName = (o: any) => CT_CATS[o?.contract_category] || '📄 عقد';
const dateOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : '—');
const timeOnly = (v?: string | null) => (v ? String(v).slice(0, 5) : null);
const period = (o: any) => `${durText(o?.contract_unit, o?.unit_count)} • ${dateOnly(o?.start_date)} ← ${dateOnly(o?.end_date)}`;

export default function ContractsPanel({ mode = 'all', embedded = false }: PanelProps) {
  const router = useRouter();
  const toast = useToast();
  const { wallet, refresh: refreshWallet, isFree } = useWallet();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
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
  const [offerFor, setOfferFor] = useState<{ o: any; item: any } | null>(null);
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const locateMe = useCallback(async () => {
    setLocationLoading(true); setMe(null);
    try {
      const { ll, real } = await getMyLocation();
      if (!real || !ll) { setMe(null); return; }
      setMe(ll);
    } catch { setMe(null); }
    finally { setLocationLoading(false); }
  }, []);

  useEffect(() => {
    if (mode !== 'bookings') void locateMe();
    supabase.rpc('my_driver_profile').then(({ data }) => setProfile((data || {}) as DriverProfile));
  }, [locateMe, mode]);

  const loadFeed = useCallback(async () => {
    if (!me || mode === 'bookings') return;
    const { data, error } = await supabase.rpc('driver_contracts_feed', { p_lat: me[0], p_lng: me[1], p_radius_km: 10 });
    if (error) { setFeed(f => f || []); return; }
    const list = (data || []) as any[];
    if (known.current) {
      const nw = list.filter(o => !known.current!.has(o.id));
      if (nw.length) {
        setFresh(prev => new Set([...prev, ...nw.map(o => o.id)]));
        setPopup(nw[0]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }
    known.current = new Set(list.map(o => o.id));
    setFeed(list);
    setDetail((d: any) => (d ? list.find(o => o.id === d.id) || null : d));
  }, [me]);
  const loadOffers = useCallback(async () => { const { data } = await supabase.rpc('driver_my_contract_offers'); setOffers((data || []) as any[]); }, []);
  const loadJobs = useCallback(async () => { const { data } = await supabase.rpc('driver_contract_jobs'); setJobs((data || []) as any[]); }, []);
  // المحفظة أولاً: تخصم الأشهر المستحقة قبل عرض الطلبات
  const loadAll = useCallback(async () => { await refreshWallet(); await Promise.all([loadFeed(), loadOffers(), loadJobs()]); }, [loadFeed, loadOffers, loadJobs, refreshWallet]);

  useEffect(() => {
    if (!me) return;
    loadAll();
    if (mode === 'bookings') return;
    const t = setInterval(loadFeed, POLL_MS);
    return () => clearInterval(t);
  }, [me]);

  // مسافة الطريق: محاولة واحدة لكل طلب
  useEffect(() => {
    (feed || []).forEach(o => {
      if (tried.current.has(o.id)) return;
      tried.current.add(o.id);
      orderDistances(me, ctTripLLs(o)).then(d => setDist(x => ({ ...x, [o.id]: d })));
    });
  }, [feed]);

  const onRefresh = async () => { setRefreshing(true); await loadAll(); setRefreshing(false); };
  const openDetail = (o: any) => { setFresh(p => { const n = new Set(p); n.delete(o.id); return n; }); setPopup(null); setDetail(o); };
  const vType = profile?.event_vehicle_type;
  const myItems = (o: any) => ((o?.items || []) as any[]).filter(it => Number(it.left) > 0 && ctCanServe(it.type, vType));

  const priceNum = Number(price);
  const U = unitOf(offerFor?.o?.contract_unit);
  const total = priceNum * Number(offerFor?.o?.unit_count || 1);
  const feeLine = () => {
    if (!(priceNum > 0)) return '';
    if (isFree) return 'بدون عمولة خلال الفترة المجانية';
    return offerFor?.o?.contract_unit === 'month'
      ? `العمولة 12% شهرياً: ${money(priceNum * COMMISSION)} — الشهر الأول عند القبول، ثم كل شهر`
      : `العمولة 12% على كامل العقد: ${money(total * COMMISSION)} — مرة واحدة عند القبول`;
  };

  const sendOffer = async () => {
    if (!offerFor) return;
    setBusy(true);
    const { error } = await supabase.rpc('driver_send_contract_offer', { p_order: offerFor.o.id, p_item: offerFor.item.type, p_price: priceNum, p_message: msg.trim() || null });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setOfferFor(null); setDetail(null);
    toast.show('تم إرسال العرض');
    loadFeed(); loadOffers();
  };
  const withdraw = async (offerId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('driver_withdraw_contract_offer', { p_offer: offerId });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setDetail(null); toast.show('تم سحب العرض', 'info');
    loadFeed(); loadOffers();
  };

  const noVehicle = profile && !vType;
  const pendingOffers = (offers || []).filter(f => f.status === 'pending').length;
  const activeJobs = (jobs || []).filter(j => j.active).length;

  // في «حجوزاتي» تظهر المواعيد القادمة فقط
  const shownJobs: any[] = mode === 'bookings' ? (jobs || []).filter(j => j.active) : (jobs || []);

  return (
    <View style={ui.page}>
      {!embedded && <>
      <Header title="سائق العقود" onBack={() => router.back()} right={<>
        <Pill text={wallet ? `💳 ${money(wallet.balance)}` : '💳 —'} tone={(Number(wallet?.balance) < 0) ? 'err' : 'mute'} onPress={() => setWalletOpen(true)} />
        {isFree && <Pill text={`مجاني · ${wallet?.free_days_left} يوم`} tone="ok" onPress={() => setWalletOpen(true)} />}
      </>} />
      <WorkStatusBanner negative={false} />
      </>}

      {mode !== 'bookings' && (
      <View style={{ paddingHorizontal: 12, paddingTop: 10, flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' }}>
        <Pill text={vType ? vehicleLine(profile) : 'المركبة: —'} tone="brand" />
        <Pill text="النطاق 10 كم" />
      </View>
      )}

      {mode !== 'bookings' && <Tabs value={tab} onChange={setTab} tabs={[
        { k: 'feed', label: 'الطلبات', n: feed?.length },
        { k: 'offers', label: 'عروضي', n: pendingOffers },
        { k: 'jobs', label: 'عقودي', n: activeJobs },
      ].filter(x => mode === 'all' || x.k !== 'jobs')} />}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {mode !== 'bookings' && <>
        <MyRatingCard />
        <NewOrdersToggle ping />
        {(Number(wallet?.balance) < 0) && (
          <View style={[ui.banner, { backgroundColor: C.errBg, borderColor: '#fecaca' }]}>
            <Text style={{ fontWeight: '900', color: C.err, textAlign: 'right' }}>رصيدك سالب ({money(wallet.balance)})</Text>
            <Text style={[ui.note, { color: C.err }]}>توقف ظهور الطلبات الجديدة حتى شحن الرصيد. عقودك القائمة مستمرة.</Text>
          </View>
        )}
        </>}

        {tab === 'feed' && (!me ? (locationLoading ? <Empty icon="📡" title="جارٍ تحديد موقعك لعرض الطلبات القريبة" /> : <View style={{gap:8}}><Empty icon="📍" title="تعذر تحديد موقعك" sub="اسمح بإذن الموقع ثم أعد المحاولة؛ لن نعرض طلبات مدينة أخرى." /><Btn small label="تحديد موقعي وإعادة المحاولة" onPress={locateMe} /></View>) : noVehicle ? (
          <Empty icon="🚌" title="بيانات مركبتك قيد الاعتماد" sub="تظهر طلبات العقود بعد اعتماد نوع المركبة من الإدارة" />
        ) : !feed ? <Empty icon="⏳" title="جاري تحميل الطلبات" /> : feed.length === 0 ? (
          <Empty icon="📭" title="لا توجد طلبات حالياً" sub="تظهر هنا طلبات العقود ضمن 10 كم من أول نقطة انطلاق" />
        ) : feed.map(o => {
          const d = dist[o.id];
          return (
            <Pressable key={o.id} onPress={() => openDetail(o)} style={[ui.card, fresh.has(o.id) && ui.cardNew]}>
              <View style={ui.cardTop}>
                <Text style={ui.h}>{catName(o)} • {unitOf(o.contract_unit).label}</Text>
                {fresh.has(o.id) ? <Pill text="جديد" tone="brand" /> : o.my_offer ? <Pill text={`عرضك ${money(o.my_offer.price)}`} tone="warn" /> : null}
              </View>
              <Text style={ui.sub} numberOfLines={1}>📍 {o.pickup_points?.[0]?.label || '—'}  ←  🏁 {o.destinations?.[0]?.label || '—'}</Text>
              <Text style={ui.sub}>📅 {period(o)}</Text>
              <Text style={ui.sub} numberOfLines={1}>🗓️ {daysText(o.days)}{timeOnly(o.departure_time) ? ` • ${timeOnly(o.departure_time)}` : ''} • {o.num_people} شخص</Text>
              <View style={ui.chips}>
                {(o.items || []).filter((it: any) => Number(it.left) > 0).map((it: any) => (
                  <Pill key={it.type} text={`${ctVehName(it.type)} × ${it.left}`} tone={ctCanServe(it.type, vType) ? 'ok' : 'mute'} />
                ))}
              </View>
              <View style={ui.metrics}>
                <View style={ui.metric}><Text style={ui.metricV}>{d ? fmtKm(d.toMe) : '…'}</Text><Text style={ui.metricK}>يبعد عنك</Text></View>
                <View style={ui.metric}><Text style={ui.metricV}>{d ? fmtKm(d.tripKm) : '…'}</Text><Text style={ui.metricK}>مسافة الذهاب</Text></View>
              </View>
            </Pressable>
          );
        }))}

        {tab === 'offers' && (!offers ? <Empty icon="⏳" title="جاري التحميل" /> : offers.length === 0 ? (
          <Empty icon="💬" title="لا توجد عروض" sub="العروض التي ترسلها تظهر هنا" />
        ) : offers.map(f => (
          <View key={f.id} style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{catName(f)} • {unitOf(f.unit).label}</Text>
              <Pill text={f.status === 'pending' ? 'بانتظار الزبون' : REASON[f.reason] || 'لم يُختر'} tone={f.status === 'pending' ? 'warn' : 'mute'} />
            </View>
            <Text style={ui.sub} numberOfLines={1}>📍 {f.pickup_points?.[0]?.label || '—'} • يبدأ {dateOnly(f.start_date)}</Text>
            <Row k="المركبة" v={ctVehName(f.item_type)} />
            <Row k={`سعرك ${unitOf(f.unit).per}`} v={money(f.price)} strong />
            <Row k={`الإجمالي (${durText(f.unit, f.unit_count)})`} v={money(f.total)} />
            {f.status === 'pending' && <View style={ui.btns}><Btn label="سحب العرض" tone="err" small onPress={() => withdraw(f.id)} loading={busy} /></View>}
          </View>
        )))}

        {tab === 'jobs' && (!jobs ? <Empty icon="⏳" title="جاري التحميل" /> : shownJobs.length === 0 ? (
          <Empty icon="📄" title="لا توجد عقود بعد" sub="العروض المقبولة تظهر هنا مع بيانات الزبون" />
        ) : shownJobs.map(j => (
          <View key={j.offer_id} style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{catName(j)} • {unitOf(j.contract_unit).label}</Text>
              <Pill text={j.ended_at ? 'أنهاه الزبون' : j.active ? 'ساري' : 'منتهٍ'} tone={j.active ? 'ok' : 'mute'} />
            </View>
            <Text style={ui.sub} numberOfLines={1}>📍 {j.pickup_points?.[0]?.label || '—'}  ←  🏁 {j.destinations?.[0]?.label || '—'}</Text>
            <Row k="المدة" v={period(j)} />
            <Row k="الأيام" v={`${daysText(j.days)}${timeOnly(j.departure_time) ? ` • ${timeOnly(j.departure_time)}` : ''}`} />
            <Row k="المركبة" v={ctVehName(j.item_type)} />
            <Row k="الزبون" v={j.customer_name} strong />
            <Row k={`السعر ${unitOf(j.contract_unit).per}`} v={money(j.price)} strong />
            <Row k="الإجمالي" v={money(j.total)} />
            <Row k="العمولة المدفوعة" v={Number(j.commission_total) === 0 ? 'مجانية' : money(j.commission_total)} />
            {j.contract_unit === 'month' && <Row k="الأشهر المحتسبة" v={`${j.months_charged} من ${j.unit_count}`} />}
            {j.next_due && <Row k="الخصم القادم" v={`${dateOnly(j.next_due)} • ${money(Number(j.price) * COMMISSION)}`} />}
            {j.active && <View style={ui.btns}><CallBtn phone={j.customer_phone} /></View>}
          </View>
        )))}
      </ScrollView>

      {toast.node}

      <Sheet visible={!!popup} onClose={() => setPopup(null)} title="طلب عقد جديد">
        {popup && <>
          <Text style={[ui.h, { textAlign: 'center' }]}>{catName(popup)} • {unitOf(popup.contract_unit).label}</Text>
          <Row k="الانطلاق" v={popup.pickup_points?.[0]?.label} />
          <Row k="المدة" v={period(popup)} />
          <Row k="يبعد عنك" v={dist[popup.id] ? fmtKm(dist[popup.id].toMe) : '…'} />
          <Row k="المركبات المطلوبة" v={(popup.items || []).filter((i: any) => i.left > 0).map((i: any) => `${ctVehName(i.type)} × ${i.left}`).join('، ')} />
          <View style={ui.btns}>
            <Btn label="عرض التفاصيل" onPress={() => openDetail(popup)} />
            <Btn label="لاحقاً" tone="ghost" onPress={() => setPopup(null)} />
          </View>
        </>}
      </Sheet>

      <Sheet visible={!!detail && !offerFor} onClose={() => setDetail(null)} title={detail ? `${catName(detail)} • ${unitOf(detail.contract_unit).label}` : ''}>
        {detail && <ScrollView>
          <ContractMap o={detail} />
          <Row k="نوع العقد" v={`${unitOf(detail.contract_unit).label} • ${durText(detail.contract_unit, detail.unit_count)}`} strong />
          <Row k="البداية" v={dateOnly(detail.start_date)} />
          <Row k="النهاية" v={dateOnly(detail.end_date)} />
          <Row k="أيام الدوام" v={daysText(detail.days)} />
          {timeOnly(detail.departure_time) && <Row k="ساعة الانطلاق" v={timeOnly(detail.departure_time)} />}
          {timeOnly(detail.return_time) && <Row k="ساعة العودة" v={timeOnly(detail.return_time)} />}
          {detail.shift_type && <Row k="الورديات" v={{ morning: 'صباحية', evening: 'مسائية', night: 'ليلية', two_shifts: 'ورديتين', three_shifts: '3 ورديات', custom: 'مخصص' }[detail.shift_type as string] || '—'} />}
          {(detail.pickup_points || []).map((p: any, i: number) => <Row key={'p' + i} k={`انطلاق ${i + 1}`} v={p.label} />)}
          {(detail.destinations || []).map((p: any, i: number) => <Row key={'d' + i} k={`وجهة ${i + 1}`} v={p.label + (timeOnly(p.return_time) ? ` • عودة ${timeOnly(p.return_time)}` : '')} />)}
          {(detail.drop_points || []).map((p: any, i: number) => <Row key={'r' + i} k={`تنزيل ${i + 1}`} v={p.label} />)}
          <Row k="عدد الأشخاص" v={detail.num_people} strong />
          {detail.need_supervisor && <Row k="مشرف/ة" v="مطلوب" />}
          {!!detail.notes && <Row k="ملاحظات" v={detail.notes} />}

          <Text style={ui.label}>المركبات المتبقية</Text>
          {(detail.items || []).map((it: any) => {
            const mine = ctCanServe(it.type, vType);
            const left = Number(it.left);
            return (
              <View key={it.type} style={[ui.card, { padding: 10, marginBottom: 6, opacity: left > 0 ? 1 : 0.5 }]}>
                <View style={ui.cardTop}>
                  <Text style={[ui.h, { fontSize: 14 }]}>{ctVehName(it.type)}</Text>
                  <Pill text={left > 0 ? `متبقٍ ${left} من ${it.count}` : 'مكتمل'} tone={left > 0 && mine ? 'ok' : 'mute'} />
                </View>
                {left > 0 && mine && !detail.my_offer && <View style={ui.btns}><Btn small label="تقديم عرض لمركبتي" onPress={() => { setOfferFor({ o: detail, item: it }); setPrice(''); setMsg(''); }} /></View>}
              </View>
            );
          })}
          {detail.my_offer ? (
            <View style={[ui.banner, { backgroundColor: C.warnBg, borderColor: '#fde68a', marginTop: 6 }]}>
              <Text style={{ fontWeight: '900', color: C.warn, textAlign: 'right' }}>عرضك: {money(detail.my_offer.price)} {unitOf(detail.contract_unit).per} • {ctVehName(detail.my_offer.item_type)}</Text>
              <View style={ui.btns}><Btn small label="سحب العرض" tone="err" onPress={() => withdraw(detail.my_offer.id)} loading={busy} /></View>
            </View>
          ) : myItems(detail).length === 0 ? (
            <Text style={ui.note}>لا توجد مركبة متبقية تناسب مركبتك في هذا الطلب.</Text>
          ) : null}
          <Text style={ui.note}>هوية الزبون ورقم هاتفه تظهر بعد قبول عرضك.</Text>
        </ScrollView>}
        {toast.node}
      </Sheet>

      <Sheet visible={!!offerFor} onClose={() => setOfferFor(null)} title="عرض سعر لمركبتك">
        {offerFor && <>
          <View style={[ui.card, { flexDirection: 'row-reverse', gap: 10, alignItems: 'center' }]}>
            {profile?.vehicle_photo_url ? <Image source={{ uri: profile.vehicle_photo_url }} style={{ width: 64, height: 48, borderRadius: 8 }} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={[ui.h, { fontSize: 14 }]}>{vehicleLine(profile)}</Text>
              <Text style={ui.sub}>{profile?.vehicle_seats ? `${profile.vehicle_seats} مقعد • ` : ''}للبند: {ctVehName(offerFor.item.type)}</Text>
            </View>
          </View>
          <Row k="العقد" v={`${U.label} • ${durText(offerFor.o.contract_unit, offerFor.o.unit_count)}`} />
          <Text style={ui.label}>السعر {U.per}</Text>
          <TextInput value={price} onChangeText={t => setPrice(t.replace(/[^0-9.]/g, ''))} keyboardType="numeric" placeholder={`السعر ${U.per}`} style={ui.input} />
          {priceNum > 0 && <Row k={`الإجمالي (${durText(offerFor.o.contract_unit, offerFor.o.unit_count)})`} v={money(total)} strong />}
          <Text style={ui.label}>رسالة للزبون (اختياري)</Text>
          <TextInput value={msg} onChangeText={setMsg} placeholder="مثال: باص مكيّف والتزام بالمواعيد" style={ui.input} maxLength={200} />
          {!!feeLine() && <Text style={ui.note}>{feeLine()}</Text>}
          <View style={ui.btns}>
            <Btn label="إرسال العرض" onPress={sendOffer} disabled={!(priceNum > 0)} loading={busy} />
            <Btn label="إلغاء" tone="ghost" onPress={() => setOfferFor(null)} />
          </View>
        </>}
        {toast.node}
      </Sheet>

      <WalletSheet visible={walletOpen} wallet={wallet} onClose={() => setWalletOpen(false)} />
    </View>
  );
}
