import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, StyleSheet, RefreshControl, Modal, SafeAreaView, TextInput } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../utils/supabase';
import WorkStatusBanner from '../WorkStatusBanner';
import { errMsg } from '../../utils/errors';
import { getMyLocation } from '../../utils/location';
import { money, COMMISSION } from '../../utils/wallet';
import { useToast } from '../Toast';
import { Header, Pill, Tabs, Empty, Row, Btn, CallBtn, ui, C } from '../DriverUI';
import PointPicker from '../PointPicker';
import MyRatingCard from '../MyRatingCard';
import NewOrdersToggle from '../NewOrdersToggle';
import { UNIT, UNITS, Unit, unitCount, CONDITIONS, PHOTO_SLOTS, TRANS, FUEL, specsLine, priceLine, fmtDT, uploadRentalPhoto } from '../../utils/rental';

type Form = { id: string | null; photos: Record<string, string>; brand_model: string; year: string; seats: number; transmission: string;
  color: string; fuel: string; ac: boolean; ll: number[] | null; conditions: string[]; pricing_mode: 'fixed' | 'offers'; units: Unit[]; prices: Record<string, string> };
const EMPTY: Form = { id: null, photos: {}, brand_model: '', year: '', seats: 5, transmission: 'auto', color: '', fuel: '', ac: true, ll: null,
  conditions: ['license', 'id'], pricing_mode: 'fixed', units: ['day'], prices: {} };
const COLORS = ['أبيض', 'أسود', 'فضي', 'رمادي', 'أحمر', 'أزرق', 'أخضر', 'بيج', 'بني'];
const SEATS = [2, 4, 5, 7, 8];
const ST: Record<string, [string, 'ok' | 'warn' | 'brand' | 'mute']> = { active: ['معروضة', 'ok'], paused: ['موقوفة مؤقتاً', 'warn'], rented: ['مؤجّرة', 'brand'] };

// all: الشاشة الكاملة، cars: «مركباتي»، requests: الطلبات، bookings: السيارات المؤجرة حالياً
export type RentalMode = 'all' | 'cars' | 'requests' | 'bookings';
export default function RentalPanel({ mode = 'all', embedded = false }: { mode?: RentalMode; embedded?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState(mode === 'requests' ? 'req' : 'cars');
  const [cars, setCars] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [gens, setGens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [pick, setPick] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    await supabase.rpc('settle_all_my_dues');
    const [a, b, c] = await Promise.all([supabase.rpc('my_rental_listings'), supabase.rpc('rental_provider_requests'), supabase.rpc('rental_provider_generals')]);
    setLoading(false);
    const e = a.error || b.error || c.error; if (e) return toast.show(errMsg(e), 'err');
    setCars(a.data || []); setReqs(b.data || []); setGens(c.data || []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (key: string, fn: string, args: any, ok: string) => {
    setBusy(key);
    const { error } = await supabase.rpc(fn, args);
    setBusy(null);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show(ok); load();
  };

  // ---------- النموذج ----------
  const set = (x: Partial<Form>) => setForm(f => (f ? { ...f, ...x } : f));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  // موقع المركبة الجديدة: موقع المكتب إن وُجد، وإلا الموقع الحالي
  const newCar = async () => {
    const { data } = await supabase.rpc('my_work_profile');
    const d: any = data || {};
    if (d.type === 'business' && d.lat != null && d.lng != null) return setForm({ ...EMPTY, ll: [d.lat, d.lng] });
    const { ll } = await getMyLocation(); setForm({ ...EMPTY, ll });
  };
  const editCar = (x: any) => setForm({ id: x.id, photos: { ...x.photos }, brand_model: x.brand_model, year: String(x.year || ''), seats: x.seats || 5,
    transmission: x.transmission, color: x.color || '', fuel: x.fuel || '', ac: !!x.ac, ll: [x.lat, x.lng], conditions: x.conditions || [],
    pricing_mode: x.pricing_mode, units: x.units || [], prices: Object.fromEntries(Object.entries(x.prices || {}).map(([k, v]) => [k, String(v)])) });
  const pickPhoto = async (slot: string, camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.show('اسمح بالوصول للصور', 'err');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.5 };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets?.[0]) setForm(f => (f ? { ...f, photos: { ...f.photos, [slot]: r.assets[0].uri } } : f));
  };
  const save = async () => {
    if (!form) return;
    if (!PHOTO_SLOTS.some(p => form.photos[p.k])) return toast.show('أضف صورة واحدة للسيارة على الأقل', 'err');
    const yr = Number(form.year);
    if (!form.brand_model.trim() || !(yr >= 1980 && yr <= new Date().getFullYear() + 1)) return toast.show('اكتب الماركة والموديل وسنة صحيحة', 'err');
    if (!form.ll) return toast.show('حدد موقع السيارة على الخريطة', 'err');
    if (!form.units.length) return toast.show('اختر مدة إيجار واحدة على الأقل', 'err');
    if (form.pricing_mode === 'fixed' && form.units.some(u => !(Number(form.prices[u]) > 0))) return toast.show('اكتب السعر لكل مدة', 'err');
    setSaving(true);
    try {
      const photos: Record<string, string> = {};
      for (const p of PHOTO_SLOTS) {
        const v = form.photos[p.k];
        if (!v) continue;
        photos[p.k] = /^https?:/.test(v) ? v : await uploadRentalPhoto(v, p.k);
      }
      const prices: Record<string, number> = {};
      form.units.forEach(u => { if (Number(form.prices[u]) > 0) prices[u] = Number(form.prices[u]); });
      const { error } = await supabase.rpc('save_rental_listing', { p_id: form.id, p: {
        photos, brand_model: form.brand_model.trim(), year: yr, seats: form.seats, transmission: form.transmission, color: form.color,
        fuel: form.fuel, ac: form.ac, lat: form.ll[0], lng: form.ll[1], conditions: form.conditions, pricing_mode: form.pricing_mode, units: form.units, prices } });
      if (error) throw error;
      toast.show(form.id ? 'تم حفظ التعديل ✓' : 'تم نشر السيارة ✓');
      setForm(null); load();
    } catch (e) { toast.show(errMsg(e), 'err'); } finally { setSaving(false); }
  };

  const chip = (on: boolean, label: string, onPress: () => void, key?: string) => (
    <Pressable key={key || label} onPress={onPress} style={[s.chip, on && s.on]}><Text style={[s.chipT, on && s.onT]}>{label}</Text></Pressable>
  );

  const shownCars = mode === 'bookings' ? cars.filter(x => x.status === 'rented') : cars;

  return (
    <View style={ui.page}>
      {!embedded && <>
        <Header title="مركباتي" onBack={() => router.back()} right={mode === 'all' || mode === 'cars' ? <Btn small label="+ سيارة" onPress={newCar} /> : undefined} />
        <WorkStatusBanner />
      </>}
      {(mode === 'all' || mode === 'requests') && <Tabs tabs={[{ k: 'cars', label: 'سياراتي', n: cars.length }, { k: 'req', label: 'الطلبات', n: reqs.length }, { k: 'gen', label: 'طلبات عامة', n: gens.length }].filter(x => mode === 'all' || x.k !== 'cars')} value={tab} onChange={setTab} />}
      <ScrollView contentContainerStyle={{ padding: 12 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {mode === 'requests' && <><MyRatingCard /><NewOrdersToggle /></>}
        {tab === 'cars' && <>
          {mode !== 'bookings' && <><MyRatingCard /><NewOrdersToggle /></>}
          {!shownCars.length && !loading && (mode === 'bookings'
            ? <Empty icon="📅" title="لا توجد حجوزات قادمة" sub="السيارات المؤجرة حالياً تظهر هنا" />
            : <Empty icon="🚗" title="لا توجد سيارات بعد" sub="اضغط «+ سيارة» وانشر أول سيارة للإيجار" />)}
          {shownCars.map(x => (
            <View key={x.id} style={[ui.card, { padding: 0, overflow: 'hidden' }]}>
              {!!(x.photos?.front || x.photos?.back || x.photos?.side) && <Image source={{ uri: x.photos.front || x.photos.back || x.photos.side }} style={s.photo} />}
              <View style={{ padding: 12 }}>
                <View style={ui.cardTop}>
                  <Text style={ui.h} numberOfLines={1}>{x.brand_model}</Text>
                  <Pill text={ST[x.status]?.[0] || x.status} tone={ST[x.status]?.[1] || 'mute'} />
                </View>
                <Text style={ui.sub}>{specsLine(x)}</Text>
                <View style={ui.chips}>
                  <Pill text={priceLine(x)} tone="ok" />
                  {x.pricing_mode === 'offers' && <Pill text="يقبل عروض" tone="warn" />}
                  {x.pending > 0 && <Pill text={`${x.pending} طلب بانتظارك`} tone="brand" onPress={() => (mode === 'all' ? setTab('req') : router.push('/work?tab=rental' as any))} />}
                </View>
                {x.status === 'rented' && !!x.booking && (
                  <View style={s.booking}>
                    <Row k="المستأجر" v={x.booking.customer_name || '—'} />
                    <Row k="المدة" v={unitCount(x.booking.unit, x.booking.unit_count)} />
                    <Row k="من" v={fmtDT(x.booking.start_at)} />
                    <Row k="إلى" v={fmtDT(x.booking.end_at)} />
                    <Row k="المجموع" v={`$${money(x.booking.total)}`} strong />
                    {x.booking.unit === 'month' && <Row k="أشهر العمولة" v={`${x.booking.months_charged} من ${x.booking.unit_count}`} />}
                    <CallBtn phone={x.booking.customer_phone} />
                  </View>
                )}
                <View style={s.actions}>
                  {x.status === 'rented' && <Btn label="✅ تم الاستلام — إعادة نشر" tone="ok" loading={busy === x.id} onPress={() => run(x.id, 'rental_listing_action', { p_id: x.id, p_action: 'republish' }, 'عادت السيارة إلى العرض ✓')} />}
                  {x.status === 'active' && <Btn small tone="ghost" label="⏸ إيقاف مؤقت" loading={busy === x.id} onPress={() => run(x.id, 'rental_listing_action', { p_id: x.id, p_action: 'pause' }, 'تم الإيقاف')} />}
                  {x.status === 'paused' && <Btn small label="▶️ تفعيل" loading={busy === x.id} onPress={() => run(x.id, 'rental_listing_action', { p_id: x.id, p_action: 'activate' }, 'السيارة معروضة ✓')} />}
                  {x.status !== 'rented' && <Btn small tone="ghost" label="✏️ تعديل" onPress={() => editCar(x)} />}
                  {x.status !== 'rented' && <Btn small tone="err" label="🗑 حذف" onPress={() => run(x.id, 'rental_listing_action', { p_id: x.id, p_action: 'delete' }, 'تم الحذف')} />}
                </View>
              </View>
            </View>
          ))}
        </>}

        {tab === 'req' && <>
          {!reqs.length && !loading && <Empty icon="📥" title="لا توجد طلبات جديدة" />}
          {reqs.map(r => {
            const fee = Math.round((r.unit === 'month' ? r.unit_price : r.total) * COMMISSION * 100) / 100;
            return (
              <View key={r.id} style={[ui.card, ui.cardNew]}>
                <View style={ui.cardTop}><Text style={ui.h}>{r.brand_model} {r.year}</Text><Pill text={`$${money(r.total)}`} tone="ok" /></View>
                <Row k="المدة" v={unitCount(r.unit, r.unit_count)} />
                <Row k="من" v={fmtDT(r.start_at)} />
                <Row k="إلى" v={fmtDT(r.end_at)} />
                <Row k={`السعر لل${UNIT[r.unit as Unit].n}`} v={r.listed_price && Number(r.listed_price) !== Number(r.unit_price) ? `$${money(r.unit_price)} (سعرك $${money(r.listed_price)})` : `$${money(r.unit_price)}`} />
                <Text style={ui.sub}>العمولة عند القبول: ${money(fee)}{r.unit === 'month' ? ' عن الشهر الأول، وبعدها كل شهر' : ''} • تظهر بيانات الزبون بعد القبول</Text>
                <View style={s.actions}>
                  <Btn label="قبول" tone="ok" loading={busy === r.id + 'a'} onPress={() => run(r.id + 'a', 'rental_provider_respond', { p_request: r.id, p_action: 'accept' }, 'تم القبول ✓ — أُخفيت السيارة من العرض')} />
                  <Btn label="رفض" tone="err" loading={busy === r.id + 'r'} onPress={() => run(r.id + 'r', 'rental_provider_respond', { p_request: r.id, p_action: 'reject' }, 'تم الرفض')} />
                </View>
              </View>
            );
          })}
        </>}

        {tab === 'gen' && <>
          {!gens.length && !loading && <Empty icon="📣" title="لا توجد طلبات عامة تناسب سياراتك" sub="تظهر هنا طلبات الزبائن ضمن 50 كم من سياراتك" />}
          {gens.map(g => (
            <View key={g.id} style={ui.card}>
              <View style={ui.cardTop}><Text style={ui.h}>زبون يطلب سيارة • {unitCount(g.unit, g.unit_count)}</Text><Pill text={`$${money(g.total)}`} tone="ok" /></View>
              <Text style={ui.sub}>يبدأ {fmtDT(g.start_at)} • ${money(g.unit_price)}{UNIT[g.unit as Unit].per}</Text>
              <Text style={ui.label}>وافق باختيار إحدى سياراتك:</Text>
              {(g.listings || []).map((l: any) => (
                <View key={l.id} style={{ marginTop: 6 }}>
                  <Btn tone="ghost" label={`${l.brand_model} ${l.year} • ≈ ${l.km} كم`} loading={busy === g.id + l.id} onPress={() => run(g.id + l.id, 'rental_respond_general', { p_general: g.id, p_listing: l.id }, 'وصلت موافقتك للزبون ✓')} />
                </View>
              ))}
            </View>
          ))}
        </>}
      </ScrollView>

      {/* إضافة / تعديل سيارة */}
      <Modal visible={!!form} animationType="slide" onRequestClose={() => setForm(null)}>
        <SafeAreaView style={ui.page}>
          <Header title={form?.id ? 'تعديل السيارة' : 'سيارة جديدة للإيجار'} onBack={() => setForm(null)} />
          {!!form && (
            <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={ui.label}>الصور (صورة واحدة على الأقل، وحتى 3)</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {PHOTO_SLOTS.map(p => (
                  <View key={p.k} style={{ flex: 1 }}>
                    <Pressable onPress={() => pickPhoto(p.k, false)} style={s.slot}>
                      {form.photos[p.k] ? <Image source={{ uri: form.photos[p.k] }} style={StyleSheet.absoluteFill} /> : <Text style={{ fontSize: 26 }}>🖼️</Text>}
                    </Pressable>
                    <Text style={s.slotL}>{p.l}</Text>
                    <Pressable onPress={() => pickPhoto(p.k, true)}><Text style={s.cam}>📷 كاميرا</Text></Pressable>
                  </View>
                ))}
              </View>
              <Text style={ui.label}>الماركة والموديل</Text>
              <TextInput value={form.brand_model} onChangeText={t => set({ brand_model: t })} placeholder="مثال: كيا ريو" style={ui.input} maxLength={60} />
              <Text style={ui.label}>سنة الصنع</Text>
              <TextInput value={form.year} onChangeText={t => set({ year: t.replace(/\D/g, '').slice(0, 4) })} keyboardType="number-pad" placeholder="2020" style={ui.input} />
              <Text style={ui.label}>ناقل الحركة</Text>
              <View style={ui.chips}>{Object.entries(TRANS).map(([k, l]) => chip(form.transmission === k, l, () => set({ transmission: k }), k))}</View>
              <Text style={ui.label}>عدد المقاعد</Text>
              <View style={ui.chips}>{SEATS.map(n => chip(form.seats === n, String(n), () => set({ seats: n }), 's' + n))}</View>
              <Text style={ui.label}>اللون (اختياري)</Text>
              <View style={ui.chips}>{COLORS.map(c => chip(form.color === c, c, () => set({ color: form.color === c ? '' : c })))}</View>
              <Text style={ui.label}>الوقود (اختياري)</Text>
              <View style={ui.chips}>{Object.entries(FUEL).map(([k, l]) => chip(form.fuel === k, l, () => set({ fuel: form.fuel === k ? '' : k }), k))}</View>
              <View style={ui.chips}>{chip(form.ac, form.ac ? '❄️ مكيّف ✓' : '❄️ بدون مكيّف', () => set({ ac: !form.ac }))}</View>
              <Text style={ui.label}>موقع السيارة</Text>
              <Btn tone="ghost" label={form.ll ? '📍 محدد — اضغط للتغيير' : '📍 حدد على الخريطة'} onPress={() => setPick(true)} />
              <Text style={ui.sub}>يرى الزبون المسافة التقريبية فقط، ويظهر الموقع الدقيق بعد القبول.</Text>
              <Text style={ui.label}>الشروط</Text>
              <View style={ui.chips}>{CONDITIONS.map(c => chip(form.conditions.includes(c.k), c.l, () => set({ conditions: toggle(form.conditions, c.k) }), c.k))}</View>
              <Text style={ui.label}>طريقة التسعير</Text>
              <View style={ui.chips}>
                {chip(form.pricing_mode === 'fixed', '💲 سعر ثابت', () => set({ pricing_mode: 'fixed' }))}
                {chip(form.pricing_mode === 'offers', '🤝 يستقبل عروض', () => set({ pricing_mode: 'offers' }))}
              </View>
              <Text style={ui.sub}>{form.pricing_mode === 'fixed' ? 'يطلب الزبون بسعرك فقط.' : 'السعر اختياري كاقتراح، ويمكن للزبون تقديم سعره.'}</Text>
              <Text style={ui.label}>مدد الإيجار{form.pricing_mode === 'fixed' ? ' والسعر ($)' : ' والسعر المقترح ($)'}</Text>
              {UNITS.map(u => (
                <View key={u} style={s.unitRow}>
                  {chip(form.units.includes(u), `بال${UNIT[u].n}`, () => set({ units: toggle(form.units, u) }), u)}
                  {form.units.includes(u) && (
                    <TextInput value={form.prices[u] || ''} onChangeText={t => set({ prices: { ...form.prices, [u]: t.replace(/[^\d.]/g, '') } })}
                      keyboardType="decimal-pad" placeholder={form.pricing_mode === 'fixed' ? `السعر${UNIT[u].per}` : 'اختياري'} style={[ui.input, { flex: 1 }]} />
                  )}
                </View>
              ))}
              <View style={{ height: 14 }} />
              <Btn label={form.id ? 'حفظ التعديل' : 'نشر السيارة'} loading={saving} onPress={save} />
            </ScrollView>
          )}
          <PointPicker visible={pick} title="موقع السيارة" initial={form?.ll} onClose={() => setPick(false)} onConfirm={p => { set({ ll: p }); setPick(false); }} />
        </SafeAreaView>
        {toast.node}
      </Modal>
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  photo: { width: '100%', height: 150, backgroundColor: '#e2e8f0' },
  booking: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: '#eef2ff', gap: 6 },
  actions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff' },
  chipT: { fontWeight: '700', color: C.txt, fontSize: 13 },
  on: { backgroundColor: C.brand, borderColor: C.brand },
  onT: { color: '#fff' },
  slot: { height: 90, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#fff' },
  slotL: { textAlign: 'center', fontWeight: '800', fontSize: 12, marginTop: 4 },
  cam: { textAlign: 'center', color: C.brand, fontSize: 12, marginTop: 2 },
  unitRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 8 },
});
