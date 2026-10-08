import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, RefreshControl, Pressable, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../utils/supabase';
import { orderDistances, OrderDist, fmtKm } from '../../utils/route';
import { getMyLocation } from '../../utils/location';
import { useWallet, money, COMMISSION } from '../../utils/wallet';
import { errMsg } from '../../utils/errors';
import { AP_KIND, paxLine, whenLine } from '../../utils/airport';
import { useToast } from '../Toast';
import MyRatingCard from '../MyRatingCard';
import NewOrdersToggle from '../NewOrdersToggle';
import type { PanelProps } from './types';
import { Pill, Empty, Row, Btn, CallBtn, Sheet, ui, C } from '../DriverUI';

// ✈️ تكسي المطار للسائق: requests = الطلبات ضمن 20 كم وإرسال العروض • bookings = المواعيد المتفق عليها
const POLL_MS = 20000;
const pts = (o: any) => (o.kind === 'arrival'
  ? [[o.airport_lat, o.airport_lng], [o.pickup_lat, o.pickup_lng]]
  : [[o.pickup_lat, o.pickup_lng], [o.airport_lat, o.airport_lng]]);
const route = (o: any) => (o.kind === 'arrival' ? `${o.airport_name} ← ${o.pickup_label || 'نقطة الزبون'}` : `${o.pickup_label || 'نقطة الزبون'} ← ${o.airport_name}`);
const nav = (ll: number[]) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${ll[0]},${ll[1]}`).catch(() => {});

export default function AirportPanel({ mode = 'requests' }: PanelProps) {
  const toast = useToast();
  const { wallet, refresh: refreshWallet, isFree } = useWallet();
  const [me, setMe] = useState<number[] | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [feed, setFeed] = useState<any[] | null>(null);
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [dist, setDist] = useState<Record<string, OrderDist>>({});
  const tried = useRef<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<any>(null);
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const bookings = mode === 'bookings';
  const locateMe = useCallback(async () => {
    setLocationLoading(true); setMe(null);
    try {
      const { ll, real } = await getMyLocation();
      if (!real || !ll) { setMe(null); return; }
      setMe(ll);
    } catch { setMe(null); }
    finally { setLocationLoading(false); }
  }, []);

  useEffect(() => { if (!bookings) void locateMe(); }, [bookings, locateMe]);
  const loadFeed = useCallback(async () => {
    if (!me) return;
    const { data, error } = await supabase.rpc('driver_airport_feed', { p_lat: me[0], p_lng: me[1] });
    if (error) { setFeed(f => f || []); return; }
    const list = (data || []) as any[];
    if (known.current) {
      const nw = list.filter(o => !known.current!.has(o.id));
      if (nw.length) { setFresh(p => new Set([...p, ...nw.map(o => o.id)])); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    }
    known.current = new Set(list.map(o => o.id));
    setFeed(list);
    setDetail((d: any) => (d ? list.find(o => o.id === d.id) || null : d));
  }, [me]);
  const loadJobs = useCallback(async () => { const { data } = await supabase.rpc('driver_airport_jobs'); setJobs((data || []) as any[]); }, []);

  useEffect(() => {
    if (bookings) { loadJobs(); return; }
    if (!me) return;
    loadFeed(); refreshWallet();
    const t = setInterval(loadFeed, POLL_MS);
    return () => clearInterval(t);
  }, [me]);

  // مسافة الطريق: محاولة واحدة لكل طلب
  useEffect(() => {
    if (!me || !feed) return;
    feed.filter(o => !tried.current.has(o.id)).forEach(o => {
      tried.current.add(o.id);
      orderDistances(me, pts(o)).then(d => setDist(p => ({ ...p, [o.id]: d })));
    });
  }, [feed, me]);

  const onRefresh = async () => { setRefreshing(true); await (bookings ? loadJobs() : Promise.all([loadFeed(), refreshWallet()])); setRefreshing(false); };
  const call = async (fn: string, args: any, ok: string) => {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast.show(errMsg(error), 'err'); return false; }
    toast.show(ok); return true;
  };
  const send = async () => {
    const p = Number(price.replace(',', '.'));
    if (!(p > 0)) return toast.show('اكتب السعر', 'err');
    if (await call('driver_send_airport_offer', { p_order: detail.id, p_price: p, p_message: msg.trim() || null }, 'تم إرسال عرضك ✓')) {
      setPrice(''); setMsg(''); setDetail(null); loadFeed();
    }
  };
  const priceNum = Number(price.replace(',', '.')) || 0;

  if (bookings) {
    const up = (jobs || []).filter(j => j.status === 'accepted').sort((a, b) => +new Date(a.trip_at) - +new Date(b.trip_at));
    return (
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {!jobs ? <Empty icon="⏳" title="جاري التحميل" /> : up.length === 0 ? (
          <Empty icon="✈️" title="لا توجد مواعيد مطار" sub="المواعيد التي يقبل الزبون عروضك فيها تظهر هنا" />
        ) : up.map(j => (
          <View key={j.id} style={ui.card}>
            <View style={ui.cardTop}><Text style={ui.h}>{AP_KIND[j.kind]} • {j.airport_name}</Text><Pill text={money(j.agreed_price)} tone="ok" /></View>
            {!!(j.edited_fields || []).length && <Pill text="عدّل الزبون الموعد أو الملاحظات" tone="warn" />}
            <Text style={ui.sub}>🕒 {whenLine(j)}</Text>
            <Text style={ui.sub}>🧭 {route(j)}</Text>
            <Text style={ui.sub}>{paxLine(j)}</Text>
            {!!j.notes && <Text style={[ui.sub, { color: C.txt }]}>📝 {j.notes}</Text>}
            <Row k="الزبون" v={j.customer_name} strong />
            <View style={ui.btns}>
              <CallBtn phone={j.customer_phone} />
              <Btn small label="📍 نقطة الزبون" tone="ghost" onPress={() => nav([j.pickup_lat, j.pickup_lng])} />
              <Btn small label="✈️ المطار" tone="ghost" onPress={() => nav([j.airport_lat, j.airport_lng])} />
            </View>
            <View style={ui.btns}>
              <Btn small label="تم التنفيذ" tone="ok" loading={busy} onPress={async () => { if (await call('driver_complete_airport', { p_order: j.id }, 'تم تسجيل التنفيذ ✓')) loadJobs(); }} />
            </View>
          </View>
        ))}
        {toast.node}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <MyRatingCard />
        <NewOrdersToggle ping />
        {(Number(wallet?.balance) < 0) && (
          <View style={[ui.banner, { backgroundColor: C.errBg, borderColor: '#fecaca' }]}>
            <Text style={{ fontWeight: '900', color: C.err, textAlign: 'right' }}>رصيدك سالب ({money(wallet!.balance)})</Text>
            <Text style={[ui.note, { color: C.err }]}>توقف ظهور الطلبات الجديدة حتى شحن الرصيد</Text>
          </View>
        )}
        {!me ? (locationLoading ? <Empty icon="📡" title="جارٍ تحديد موقعك لعرض الطلبات القريبة" /> : <View style={{gap:8}}><Empty icon="📍" title="تعذر تحديد موقعك" sub="اسمح بإذن الموقع ثم أعد المحاولة؛ لن نعرض طلبات مدينة أخرى." /><Btn small label="تحديد موقعي وإعادة المحاولة" onPress={locateMe} /></View>) : !feed ? <Empty icon="⏳" title="جاري تحميل الطلبات" /> : feed.length === 0 ? (
          <Empty icon="📭" title="لا توجد طلبات مطار حالياً" sub="تظهر هنا الطلبات ضمن 20 كم من موقعك" />
        ) : feed.map(o => {
          const d = dist[o.id];
          return (
            <Pressable key={o.id} onPress={() => { setDetail(o); setPrice(''); setMsg(''); }} style={[ui.card, fresh.has(o.id) && ui.cardNew]}>
              <View style={ui.cardTop}>
                <Text style={ui.h}>{AP_KIND[o.kind]} • {o.airport_name}</Text>
                {o.my_offer ? <Pill text={`عرضك ${money(o.my_offer.price)}`} tone="warn" /> : fresh.has(o.id) ? <Pill text="جديد" tone="brand" /> : null}
              </View>
              <Text style={ui.sub}>🕒 {whenLine(o)}</Text>
              <Text style={ui.sub} numberOfLines={1}>🧭 {route(o)}</Text>
              <Text style={ui.sub}>{paxLine(o)}</Text>
              <View style={ui.chips}>
                <Pill text={`إليك: ${fmtKm(d?.toMe)}`} tone="mute" />
                <Pill text={`المشوار: ${fmtKm(d?.tripKm)}`} tone="mute" />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title={detail ? `${AP_KIND[detail.kind]} • ${detail.airport_name}` : ''}>
        {detail && <ScrollView keyboardShouldPersistTaps="handled">
          <Row k="الموعد" v={whenLine(detail)} strong />
          <Row k="المسار" v={route(detail)} />
          <Row k="التفاصيل" v={paxLine(detail)} />
          {!!detail.notes && <Row k="ملاحظات" v={detail.notes} />}
          <Row k="مسافة المشوار" v={fmtKm(dist[detail.id]?.tripKm)} />
          {detail.my_offer ? <>
            <Text style={ui.note}>أرسلت عرضاً بسعر {money(detail.my_offer.price)} — بانتظار ردّ الزبون.</Text>
            <View style={ui.btns}>
              <Btn label="سحب العرض" tone="err" loading={busy} onPress={async () => { if (await call('driver_withdraw_airport_offer', { p_offer: detail.my_offer.id }, 'تم سحب العرض')) { setDetail(null); loadFeed(); } }} />
            </View>
          </> : <>
            <Text style={ui.label}>السعر الكلي</Text>
            <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#94a3b8"
              style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, textAlign: 'right', fontSize: 18, fontWeight: '800', color: C.txt }} />
            <Text style={ui.label}>رسالة للزبون <Text style={{ color: C.mute, fontWeight: '600' }}>(اختياري)</Text></Text>
            <TextInput value={msg} onChangeText={setMsg} maxLength={200} multiline placeholder="مثال: السعر يشمل الانتظار" placeholderTextColor="#94a3b8"
              style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, minHeight: 60, textAlign: 'right', textAlignVertical: 'top', color: C.txt }} />
            {priceNum > 0 && <Text style={ui.note}>{isFree ? 'بدون عمولة (الفترة المجانية)' : `العمولة 12%: ${money(priceNum * COMMISSION)}`} — تُخصم عند قبول الزبون</Text>}
            <View style={ui.btns}><Btn label="إرسال العرض" onPress={send} loading={busy} /></View>
          </>}
        </ScrollView>}
        {toast.node}
      </Sheet>
      {toast.node}
    </View>
  );
}
