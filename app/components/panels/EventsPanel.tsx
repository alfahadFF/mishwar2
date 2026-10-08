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
import { EV_TYPES, evName, eventKind, canServe, weddingDetails, fmtDateTime, isBusVan, DriverProfile } from '../../utils/events';
import { useToast } from '../Toast';
import WalletSheet from '../WalletSheet';
import { EventMap, parseFinal, vehicleLine, dests, tripLLs } from '../EventMap';
import type { PanelProps } from './types';
import { Header, Pill, Tabs, Empty, Row, Btn, CallBtn, Sheet, ui, C } from '../DriverUI';

const POLL_MS = 20000;
const REASON: Record<string, string> = { filled: 'اكتمل العدد', customer: 'اختار الزبون عرضاً آخر', cancelled: 'ألغى الزبون الطلب' };

export default function EventsPanel({ mode = 'all', embedded = false }: PanelProps) {
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
    const { data, error } = await supabase.rpc('driver_events_feed', { p_lat: me[0], p_lng: me[1], p_radius_km: 10 });
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
  const loadOffers = useCallback(async () => { const { data } = await supabase.rpc('driver_my_event_offers'); setOffers((data || []) as any[]); }, []);
  const loadJobs = useCallback(async () => { const { data } = await supabase.rpc('driver_event_jobs'); setJobs((data || []) as any[]); }, []);
  const loadAll = useCallback(async () => { await Promise.all([loadFeed(), loadOffers(), loadJobs(), refreshWallet()]); }, [loadFeed, loadOffers, loadJobs, refreshWallet]);

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
      orderDistances(me, tripLLs(o)).then(d => setDist(x => ({ ...x, [o.id]: d })));
    });
  }, [feed]);

  const onRefresh = async () => { setRefreshing(true); await loadAll(); setRefreshing(false); };
  const openDetail = (o: any) => { setFresh(p => { const n = new Set(p); n.delete(o.id); return n; }); setPopup(null); setDetail(o); };
  const myItems = (o: any) => ((o?.items || []) as any[]).filter(it => Number(it.left) > 0 && canServe(it.type, profile));

  const priceNum = Number(price);
  const sendOffer = async () => {
    if (!offerFor) return;
    setBusy(true);
    const { error } = await supabase.rpc('driver_send_event_offer', { p_order: offerFor.o.id, p_item: offerFor.item.type, p_price: priceNum, p_message: msg.trim() || null });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setOfferFor(null); setDetail(null);
    toast.show('تم إرسال العرض');
    loadFeed(); loadOffers();
  };
  const withdraw = async (offerId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('driver_withdraw_event_offer', { p_offer: offerId });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    setDetail(null); toast.show('تم سحب العرض', 'info');
    loadFeed(); loadOffers();
  };
  const complete = async (offerId: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('driver_complete_event', { p_offer: offerId });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم تنفيذ المناسبة'); loadJobs();
  };

  const services = profile ? [profile.svc_events && isBusVan(profile.event_vehicle_type) ? 'مناسبات' : null, profile.svc_wedding ? 'زفاف' : null].filter(Boolean) : [];
  const noService = profile && services.length === 0;
  const pendingOffers = (offers || []).filter(f => f.status === 'pending').length;
  const activeJobs = (jobs || []).filter(j => !j.completed_at).length;

  // في «حجوزاتي» تظهر المواعيد القادمة فقط
  const shownJobs: any[] = mode === 'bookings' ? (jobs || []).filter(j => !j.completed_at) : (jobs || []);

  return (
    <View style={ui.page}>
      {!embedded && <>
      <Header title="سائق المناسبات" onBack={() => router.back()} right={<>
        <Pill text={wallet ? `💳 ${money(wallet.balance)}` : '💳 —'} tone={(Number(wallet?.balance) < 0) ? 'err' : 'mute'} onPress={() => setWalletOpen(true)} />
        {isFree && <Pill text={`مجاني · ${wallet?.free_days_left} يوم`} tone="ok" onPress={() => setWalletOpen(true)} />}
      </>} />
      <WorkStatusBanner negative={false} />
      </>}

      {mode !== 'bookings' && (
      <View style={{ paddingHorizontal: 12, paddingTop: 10, flexDirection: 'row-reverse', gap: 6, flexWrap: 'wrap' }}>
        <Pill text={profile?.event_vehicle_type ? vehicleLine(profile) : 'المركبة: —'} tone="brand" />
        {services.map(s => <Pill key={s as string} text={s as string} tone="ok" />)}
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

        {tab === 'feed' && (!me ? (locationLoading ? <Empty icon="📡" title="جارٍ تحديد موقعك لعرض الطلبات القريبة" /> : <View style={{gap:8}}><Empty icon="📍" title="تعذر تحديد موقعك" sub="اسمح بإذن الموقع ثم أعد المحاولة؛ لن نعرض طلبات مدينة أخرى." /><Btn small label="تحديد موقعي وإعادة المحاولة" onPress={locateMe} /></View>) : noService ? (
          <Empty icon="🎉" title="خدمة المناسبات غير مفعّلة في حسابك" sub="تظهر الطلبات بعد تفعيل خدمة المناسبات أو الزفاف واعتماد بيانات المركبة" />
        ) : !feed ? <Empty icon="⏳" title="جاري تحميل الطلبات" /> : feed.length === 0 ? (
          <Empty icon="📭" title="لا توجد طلبات حالياً" sub="تظهر هنا طلبات المناسبات ضمن 10 كم من نقطة التجمع" />
        ) : feed.map(o => {
          const d = dist[o.id];
          return (
            <Pressable key={o.id} onPress={() => openDetail(o)} style={[ui.card, fresh.has(o.id) && ui.cardNew]}>
              <View style={ui.cardTop}>
                <Text style={ui.h}>{eventKind(o)}</Text>
                {fresh.has(o.id) ? <Pill text="جديد" tone="brand" /> : o.my_offer ? <Pill text={`عرضك ${money(o.my_offer.price)}`} tone="warn" /> : null}
              </View>
              <Text style={ui.sub} numberOfLines={1}>📍 {o.gathering_point || '—'}</Text>
              <Text style={ui.sub}>🕒 {fmtDateTime(o.gathering_time)} • {o.duration_hours || '—'} ساعة • {o.num_people || '—'} شخص</Text>
              <View style={ui.chips}>
                {(o.items || []).filter((it: any) => Number(it.left) > 0).map((it: any) => (
                  <Pill key={it.type} text={`${evName(it.type)} × ${it.left}`} tone={canServe(it.type, profile) ? 'ok' : 'mute'} />
                ))}
              </View>
              <View style={ui.metrics}>
                <View style={ui.metric}><Text style={ui.metricV}>{d ? fmtKm(d.toMe) : '…'}</Text><Text style={ui.metricK}>يبعد عنك</Text></View>
                <View style={ui.metric}><Text style={ui.metricV}>{d ? fmtKm(d.tripKm) : '…'}</Text><Text style={ui.metricK}>مسافة المسار</Text></View>
                <View style={ui.metric}><Text style={ui.metricV}>{dests(o).length}</Text><Text style={ui.metricK}>الوجهات</Text></View>
              </View>
            </Pressable>
          );
        }))}

        {tab === 'offers' && (!offers ? <Empty icon="⏳" title="جاري التحميل" /> : offers.length === 0 ? (
          <Empty icon="💬" title="لا توجد عروض" sub="العروض التي ترسلها تظهر هنا" />
        ) : offers.map(f => (
          <View key={f.id} style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{eventKind(f)}</Text>
              <Pill text={f.status === 'pending' ? 'بانتظار الزبون' : REASON[f.reason] || 'لم يُختر'} tone={f.status === 'pending' ? 'warn' : 'mute'} />
            </View>
            <Text style={ui.sub} numberOfLines={1}>📍 {f.gathering_point || '—'} • {fmtDateTime(f.gathering_time)}</Text>
            <Row k="المركبة" v={evName(f.item_type)} />
            <Row k="سعرك" v={money(f.price)} strong />
            {f.status === 'pending' && <View style={ui.btns}><Btn label="سحب العرض" tone="err" small onPress={() => withdraw(f.id)} loading={busy} /></View>}
          </View>
        )))}

        {tab === 'jobs' && (!jobs ? <Empty icon="⏳" title="جاري التحميل" /> : shownJobs.length === 0 ? (
          <Empty icon="🎊" title="لا توجد أعمال بعد" sub="العروض المقبولة تظهر هنا مع بيانات الزبون" />
        ) : shownJobs.map(j => (
          <View key={j.offer_id} style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{eventKind(j)}</Text>
              <Pill text={j.completed_at ? 'مكتمل' : 'مؤكد'} tone={j.completed_at ? 'mute' : 'ok'} />
            </View>
            <Text style={ui.sub} numberOfLines={1}>📍 {j.gathering_point || '—'}</Text>
            <Row k="الموعد" v={fmtDateTime(j.gathering_time)} />
            <Row k="المدة" v={`${j.duration_hours || '—'} ساعة`} />
            <Row k="المركبة" v={evName(j.item_type)} />
            <Row k="الزبون" v={j.customer_name} strong />
            <Row k="السعر" v={money(j.price)} strong />
            <Row k="العمولة" v={Number(j.commission) === 0 ? 'مجانية' : money(j.commission)} />
            {!j.completed_at && <View style={ui.btns}>
              <CallBtn phone={j.customer_phone} />
              <Btn label="تم التنفيذ" tone="ghost" onPress={() => complete(j.offer_id)} loading={busy} />
            </View>}
          </View>
        )))}
      </ScrollView>

      {toast.node}

      <Sheet visible={!!popup} onClose={() => setPopup(null)} title="طلب مناسبة جديد">
        {popup && <>
          <Text style={[ui.h, { textAlign: 'center' }]}>{eventKind(popup)}</Text>
          <Row k="نقطة التجمع" v={popup.gathering_point} />
          <Row k="الموعد" v={fmtDateTime(popup.gathering_time)} />
          <Row k="يبعد عنك" v={dist[popup.id] ? fmtKm(dist[popup.id].toMe) : '…'} />
          <Row k="المركبات المطلوبة" v={(popup.items || []).filter((i: any) => i.left > 0).map((i: any) => `${EV_TYPES[i.type]?.name || i.type} × ${i.left}`).join('، ')} />
          <View style={ui.btns}>
            <Btn label="عرض التفاصيل" onPress={() => openDetail(popup)} />
            <Btn label="لاحقاً" tone="ghost" onPress={() => setPopup(null)} />
          </View>
        </>}
      </Sheet>

      <Sheet visible={!!detail && !offerFor} onClose={() => setDetail(null)} title={detail ? eventKind(detail) : ''}>
        {detail && <ScrollView>
          <EventMap o={detail} />
          <Row k="نقطة التجمع" v={detail.gathering_point} />
          <Row k="موعد التجمع" v={fmtDateTime(detail.gathering_time)} />
          {detail.departure_time && <Row k="موعد الانطلاق" v={fmtDateTime(detail.departure_time)} />}
          {dests(detail).map((d, i) => <Row key={i} k={`الوجهة ${i + 1}`} v={d.label} />)}
          <Row k="المدة" v={`${detail.duration_hours || '—'} ساعة${detail.wait === false ? '' : ' • مع انتظار'}`} />
          {detail.return_time && <Row k="موعد العودة" v={fmtDateTime(detail.return_time)} />}
          {parseFinal(detail.final_point)?.label && <Row k="الوصول الأخير" v={parseFinal(detail.final_point)!.label} />}
          <Row k="عدد الأشخاص" v={detail.num_people} strong />
          {!!detail.notes && <Row k="ملاحظات" v={detail.notes} />}

          <Text style={ui.label}>المركبات المتبقية</Text>
          {(detail.items || []).map((it: any) => {
            const mine = canServe(it.type, profile);
            const left = Number(it.left);
            return (
              <View key={it.type} style={[ui.card, { padding: 10, marginBottom: 6, opacity: left > 0 ? 1 : 0.5 }]}>
                <View style={ui.cardTop}>
                  <Text style={[ui.h, { fontSize: 14 }]}>{evName(it.type)}</Text>
                  <Pill text={left > 0 ? `متبقٍ ${left} من ${it.count}` : 'مكتمل'} tone={left > 0 ? (mine ? 'ok' : 'mute') : 'mute'} />
                </View>
                {it.type === 'wedding_car' && !!weddingDetails(it) && <Text style={ui.sub}>{weddingDetails(it)}</Text>}
                {left > 0 && mine && !detail.my_offer && <View style={ui.btns}><Btn small label="تقديم عرض لمركبتي" onPress={() => { setOfferFor({ o: detail, item: it }); setPrice(''); setMsg(''); }} /></View>}
              </View>
            );
          })}
          {detail.my_offer ? (
            <View style={[ui.banner, { backgroundColor: C.warnBg, borderColor: '#fde68a', marginTop: 6 }]}>
              <Text style={{ fontWeight: '900', color: C.warn, textAlign: 'right' }}>عرضك: {money(detail.my_offer.price)} • {evName(detail.my_offer.item_type)}</Text>
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
              <Text style={ui.sub}>{profile?.vehicle_seats ? `${profile.vehicle_seats} مقعد • ` : ''}للبند: {evName(offerFor.item.type)}</Text>
            </View>
          </View>
          <Text style={ui.note}>تفاصيل مركبتك تظهر للزبون مع العرض.</Text>
          <Text style={ui.label}>السعر</Text>
          <TextInput value={price} onChangeText={t => setPrice(t.replace(/[^0-9.]/g, ''))} keyboardType="numeric" placeholder="السعر" style={ui.input} />
          <Text style={ui.label}>رسالة للزبون (اختياري)</Text>
          <TextInput value={msg} onChangeText={setMsg} placeholder="مثال: باص مكيّف مع سائق خبرة" style={ui.input} maxLength={200} />
          {priceNum > 0 && <Text style={ui.note}>{isFree ? 'بدون عمولة (الفترة المجانية)' : `العمولة 12%: ${money(priceNum * COMMISSION)}`} — تُخصم عند قبول الزبون</Text>}
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

