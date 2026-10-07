import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, StyleSheet, RefreshControl, Linking, Modal, SafeAreaView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { getMyLocation } from '../utils/location';
import { roadKmFrom } from '../utils/route';
import { useToast } from '../components/Toast';
import { Header, Pill, Tabs, Empty, Row, Btn, CallBtn, Sheet, ui, C } from '../components/DriverUI';
import PointPicker from '../components/PointPicker';
import Stars from '../components/Stars';
import { attachRatings, sortByLevel } from '../utils/rating';
import RentalPeriod, { Period, newPeriod, periodStart, periodTotal } from '../components/RentalPeriod';
import { UNIT, UNITS, Unit, unitCount, condLabel, specsLine, priceLine, fmtDT, TRANS, FUEL } from '../utils/rental';

const kmText = (x: any) => (x.road != null ? `≈ ${x.road.toFixed(1)} كم` : x.km != null ? `≈ ${Number(x.km).toFixed(1)} كم` : '');
const STATUS: Record<string, [string, 'warn' | 'ok' | 'err' | 'mute']> = {
  pending: ['بانتظار رد المؤجّر', 'warn'], accepted: ['مقبول ✓', 'ok'], rejected: ['مرفوض', 'err'], cancelled: ['ملغي', 'mute'],
};

// مسافة الطريق من موقعي إلى المواقع التقريبية للسيارات
async function withRoad(ll: number[], rows: any[]) {
  const d = await roadKmFrom(ll, rows.map(r => r.approx));
  return rows.map((r, i) => ({ ...r, road: d[i] }));
}

function CarCard({ x, onPress, children }: { x: any; onPress?: () => void; children?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[ui.card, { padding: 0, overflow: 'hidden' }]}>
      {!!(x.photos?.front || x.photos?.back || x.photos?.side) && <Image source={{ uri: x.photos.front || x.photos.back || x.photos.side }} style={s.photo} resizeMode="cover" />}
      <View style={{ padding: 12 }}>
        <View style={ui.cardTop}>
          <Text style={ui.h} numberOfLines={1}>{x.brand_model}</Text>
          {!!kmText(x) && <Pill text={kmText(x)} tone="brand" />}
        </View>
        <Text style={ui.sub}>{specsLine(x)}</Text>
        <View style={ui.chips}>
          <Pill text={priceLine(x)} tone="ok" />
          {x.pricing_mode === 'offers' && <Pill text="يقبل عروض أسعار" tone="warn" />}
          <Stars r={x.rating} />
        </View>
        {children}
      </View>
    </Pressable>
  );
}

export default function RentalScreen() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('browse');
  const [ll, setLl] = useState<number[] | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [cars, setCars] = useState<any[]>([]);
  const [mine, setMine] = useState<{ requests: any[]; generals: any[] }>({ requests: [], generals: [] });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<any>(null);
  const [period, setPeriod] = useState<Period>(newPeriod('day'));
  const [ownPrice, setOwnPrice] = useState(false);
  const [gen, setGen] = useState(false);
  const [gPeriod, setGPeriod] = useState<Period>(newPeriod('day'));
  const [gPoint, setGPoint] = useState<number[] | null>(null);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadCars = useCallback(async (at?: number[] | null, u?: Unit | null) => {
    const p = at || ll; if (!p) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('rental_search', { p_lat: p[0], p_lng: p[1], p_unit: u === undefined ? unit : u });
    setLoading(false);
    if (error) return toast.show(errMsg(error), 'err');
    const rows = (data || []) as any[];
    setCars(rows);
    if (rows.length) { const rated = await attachRatings('rental_listing', rows); setCars(rated); setCars(sortByLevel(await withRoad(p, rated), (r: any) => Math.floor(Number(r.road ?? 0) / 2))); }
  }, [ll, unit]);
  const loadMine = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_rentals');
    if (error) return toast.show(errMsg(error), 'err');
    const m = (data || { requests: [], generals: [] }) as any;
    setMine(m);
    for (const g of m.generals || []) if (g.offers?.length) {
      const flat = await attachRatings('rental_listing', g.offers.map((o: any) => ({ ...o.listing, offer_id: o.id })));
      g.offers = ll ? await withRoad(ll, flat) : flat;
    }
    setMine({ ...m });
  }, [ll]);

  useEffect(() => { (async () => { const { ll: p } = await getMyLocation(); setLl(p); setGPoint(p); loadCars(p); })(); }, []);
  useFocusEffect(useCallback(() => { loadMine(); }, [loadMine]));

  const openCar = (x: any) => {
    const u: Unit = (unit && x.units.includes(unit) ? unit : x.units[0]);
    setPeriod(newPeriod(u, x.prices?.[u])); setOwnPrice(false); setOpen(x);
  };
  const call = async (fn: string, args: any, ok: string, after?: () => void) => {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show(ok); after?.(); loadMine();
  };
  const sendRequest = () => {
    if (!open) return;
    const st = periodStart(period);
    if (st.getTime() < Date.now() - 10 * 60e3) return toast.show('اختر موعداً لاحقاً', 'err');
    if (!(Number(period.price) > 0)) return toast.show('اكتب السعر', 'err');
    call('rental_request_listing', { p_listing: open.id, p_unit: period.unit, p_count: period.count, p_start: st.toISOString(), p_price: Number(period.price) },
      'تم إرسال الطلب للمؤجّر ✓', () => { setOpen(null); setTab('mine'); });
  };
  const sendGeneral = () => {
    const st = periodStart(gPeriod);
    if (!gPoint) return toast.show('حدد موقعك على الخريطة', 'err');
    if (st.getTime() < Date.now() - 10 * 60e3) return toast.show('اختر موعداً لاحقاً', 'err');
    if (!(Number(gPeriod.price) > 0)) return toast.show('اكتب السعر', 'err');
    call('rental_post_general', { p_unit: gPeriod.unit, p_count: gPeriod.count, p_start: st.toISOString(), p_price: Number(gPeriod.price), p_lat: gPoint[0], p_lng: gPoint[1] },
      'وصل طلبك لكل المؤجّرين ضمن 50 كم ✓', () => { setGen(false); setTab('mine'); });
  };

  const fixed = open?.pricing_mode === 'fixed' || (open?.prices?.[period.unit] && !ownPrice);
  const nMine = mine.requests.filter(r => r.status === 'pending' || r.status === 'accepted').length + mine.generals.length;

  return (
    <View style={ui.page}>
      <Header title="تأجير سيارات" onBack={() => router.back()} right={<Btn small label="📣 طلب عام" onPress={() => setGen(true)} />} />
      <Tabs tabs={[{ k: 'browse', label: 'السيارات القريبة', n: cars.length }, { k: 'mine', label: 'طلباتي', n: nMine }]} value={tab} onChange={setTab} />
      {tab === 'browse' ? (
        <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => loadCars()} />}>
          <View style={[ui.chips, { marginTop: 0, marginBottom: 10 }]}>
            <Pill text="الكل" tone={unit === null ? 'brand' : 'mute'} onPress={() => { setUnit(null); loadCars(null, null); }} />
            {UNITS.map(u => <Pill key={u} text={`بال${UNIT[u].n}`} tone={unit === u ? 'brand' : 'mute'} onPress={() => { setUnit(u); loadCars(null, u); }} />)}
          </View>
          {!cars.length && !loading && <Empty icon="🚗" title="لا توجد سيارات متاحة ضمن 50 كم" sub="قدّم «طلب عام» ليصل لكل المؤجّرين القريبين" />}
          {cars.map(x => <CarCard key={x.id} x={x} onPress={() => openCar(x)} />)}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={false} onRefresh={loadMine} />}>
          {!mine.generals.length && !mine.requests.length && <Empty icon="🧾" title="لا توجد طلبات بعد" />}
          {mine.generals.map(g => (
            <View key={g.id} style={[ui.card, ui.cardNew]}>
              <View style={ui.cardTop}>
                <Text style={ui.h}>📣 طلب عام • {unitCount(g.unit, g.unit_count)}</Text>
                <Pill text={`$${g.total}`} tone="ok" />
              </View>
              <Text style={ui.sub}>يبدأ {fmtDT(g.start_at)} • ${g.unit_price}{UNIT[g.unit as Unit].per}</Text>
              <Text style={[ui.label, { marginTop: 8 }]}>الموافقات ({g.offers.length}) — اختر سيارة واحدة</Text>
              {!g.offers.length && <Text style={ui.sub}>بانتظار موافقات المؤجّرين…</Text>}
              {g.offers.map((o: any) => (
                <CarCard key={o.offer_id || o.id} x={o.listing || o}>
                  <View style={{ marginTop: 8 }}>
                    <Btn label="اختيار هذه السيارة" tone="ok" loading={busy} onPress={() => call('rental_choose_offer', { p_offer: o.offer_id || o.id }, 'تم الحجز ✓ — اطّلع على بيانات المؤجّر')} />
                  </View>
                </CarCard>
              ))}
              <Btn small tone="err" label="إلغاء الطلب العام" onPress={() => call('rental_cancel_general', { p_general: g.id }, 'تم الإلغاء')} />
            </View>
          ))}
          {mine.requests.map(r => (
            <View key={r.id} style={ui.card}>
              <View style={ui.cardTop}>
                <Text style={ui.h} numberOfLines={1}>{r.listing?.brand_model}</Text>
                <Pill text={STATUS[r.status]?.[0] || r.status} tone={STATUS[r.status]?.[1] || 'mute'} />
              </View>
              <Text style={ui.sub}>{unitCount(r.unit, r.unit_count)} • من {fmtDT(r.start_at)} إلى {fmtDT(r.end_at)}</Text>
              <Row k="المجموع" v={`$${r.total}`} strong />
              {r.status === 'rejected' && r.reason === 'rented' && <Text style={ui.sub}>تم تأجير السيارة لشخص آخر</Text>}
              {r.status === 'accepted' && (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <Row k="المؤجّر" v={r.provider_name || '—'} />
                  <CallBtn phone={r.provider_phone} />
                  {!!r.car_location && <Btn tone="ghost" label="📍 موقع السيارة" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${r.car_location[0]},${r.car_location[1]}`)} />}
                </View>
              )}
              {r.status === 'pending' && <Btn small tone="err" label="إلغاء الطلب" onPress={() => call('rental_cancel_request', { p_request: r.id }, 'تم الإلغاء')} />}
            </View>
          ))}
        </ScrollView>
      )}

      {/* تفاصيل السيارة + الطلب */}
      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        <SafeAreaView style={ui.page}>
          <Header title={open?.brand_model || ''} onBack={() => setOpen(null)} />
          {!!open && (
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {(['front', 'back', 'side'] as const).map(k => open.photos?.[k] ? <Image key={k} source={{ uri: open.photos[k] }} style={s.big} /> : null)}
              </ScrollView>
              <View style={ui.card}>
                <Row k="الموديل" v={`${open.brand_model} ${open.year}`} />
                <Row k="ناقل الحركة" v={TRANS[open.transmission]} />
                <Row k="المقاعد" v={String(open.seats)} />
                {!!open.color && <Row k="اللون" v={open.color} />}
                {!!open.fuel && <Row k="الوقود" v={FUEL[open.fuel]} />}
                <Row k="مكيّف" v={open.ac ? 'نعم' : 'لا'} />
                <Row k="المسافة" v={kmText(open) || '—'} />
              </View>
              {!!open.conditions?.length && (
                <View style={ui.card}>
                  <Text style={ui.h}>شروط المؤجّر</Text>
                  <View style={ui.chips}>{open.conditions.map((c: string) => <Pill key={c} text={condLabel(c)} />)}</View>
                </View>
              )}
              <View style={ui.card}>
                <Text style={ui.h}>{open.pricing_mode === 'fixed' ? 'سعر ثابت' : 'يقبل عروض أسعار'}</Text>
                <Text style={ui.sub}>{priceLine(open)}</Text>
                {open.pricing_mode === 'offers' && !!open.prices?.[period.unit] && (
                  <View style={ui.chips}>
                    <Pill text="بالسعر المقترح" tone={!ownPrice ? 'brand' : 'mute'} onPress={() => { setOwnPrice(false); setPeriod({ ...period, price: String(open.prices[period.unit]) }); }} />
                    <Pill text="أقدّم سعري" tone={ownPrice ? 'brand' : 'mute'} onPress={() => setOwnPrice(true)} />
                  </View>
                )}
                <RentalPeriod units={open.units} value={period} onChange={setPeriod} prices={open.prices} fixedPrice={!!fixed} />
              </View>
              <Text style={[ui.sub, { marginBottom: 8 }]}>تظهر بيانات المؤجّر ورقمه بعد موافقته على الطلب.</Text>
              <Btn label={`إرسال الطلب • $${periodTotal(period)}`} loading={busy} onPress={sendRequest} />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* الطلب العام */}
      <Sheet visible={gen} onClose={() => setGen(false)} title="📣 طلب عام لكل المؤجّرين">
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={ui.sub}>يصل الطلب إلى جميع المؤجّرين ضمن 50 كم، ومن يوافق يختار سيارة من سياراته، ثم تختار أنت واحدة منها.</Text>
          <RentalPeriod units={UNITS} value={gPeriod} onChange={setGPeriod} />
          <Text style={ui.label}>موقعك</Text>
          <Btn tone="ghost" label={gPoint ? '📍 محدد — اضغط للتغيير' : '📍 حدد على الخريطة'} onPress={() => setPick(true)} />
          <View style={{ height: 10 }} />
          <Btn label={`إرسال • $${periodTotal(gPeriod)}`} loading={busy} onPress={sendGeneral} />
        </ScrollView>
        <PointPicker visible={pick} title="موقعك" initial={gPoint} onClose={() => setPick(false)} onConfirm={p => { setGPoint(p); setPick(false); }} />
      </Sheet>
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  photo: { width: '100%', height: 170, backgroundColor: '#e2e8f0' },
  big: { width: 300, height: 210, borderRadius: 14, marginLeft: 8, backgroundColor: '#e2e8f0' },
});
