import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, makeTempClient } from '../utils/supabase';
import { parsePhone, phoneToAuthEmail, passwordOk, passwordHasNonLatin, COUNTRY_FLAG, COUNTRY_NAME } from '../utils/phone';
import { DRIVER_KINDS, FUELS, kindHasTaxi, kindHasWedding, kindHasAirport, uploadWorkPhoto, workHome } from '../utils/work';
import { VCLASS, VGROUPS } from '../utils/vehicles';
import { errMsg } from '../utils/errors';
import { useToast } from '../components/Toast';
import { Header, Btn, ui, C } from '../components/DriverUI';

const ORANGE = '#FF6B00';
type Role = 'driver' | 'travel' | 'carrier';
type F = {
  full_name: string; phone: string; pass: string; agree: boolean;
  kind: string; category: string; engine_cc: string; seats: number; cargo_class: string;
  model: string; year: string; color: string; plate: string; owner: string; fuel: string;
  license_no: string; license_place: string; ey: number; em: number; ed: number;
  events: boolean; wedding: boolean; airport: boolean; contracts: boolean; rental: boolean;
  driver_photo: string; vehicle_photo: string; license_photo: string;
};
const NOW_Y = new Date().getFullYear();
const EMPTY: F = {
  full_name: '', phone: '', pass: '', agree: false, kind: '', category: '', engine_cc: '', seats: 4, cargo_class: '',
  model: '', year: '', color: '', plate: '', owner: '', fuel: '', license_no: '', license_place: '',
  ey: 0, em: 0, ed: 0, events: false, wedding: false, airport: false, contracts: false, rental: false,
  driver_photo: '', vehicle_photo: '', license_photo: '',
};

// ---- عناصر ثابتة خارج الشاشة حتى لا يفقد الحقل التركيز ----
function Label({ t, opt }: { t: string; opt?: boolean }) {
  return <Text style={s.label}>{t}{opt ? <Text style={s.opt}>  (اختياري)</Text> : null}</Text>;
}
function Input(p: { value: string; onChange: (v: string) => void; ph?: string; ltr?: boolean; num?: boolean; max?: number }) {
  return <TextInput value={p.value} onChangeText={p.onChange} placeholder={p.ph} placeholderTextColor="#94a3b8"
    keyboardType={p.num ? 'number-pad' : 'default'} maxLength={p.max || 60}
    style={[s.input, p.ltr ? s.ltr : { textAlign: 'right' }]} />;
}
function Chips<T extends string | number>({ items, value, onPick }: { items: { k: T; name: string }[]; value: T; onPick: (k: T) => void }) {
  return (
    <View style={s.chips}>
      {items.map(i => (
        <Pressable key={String(i.k)} onPress={() => onPick(i.k)} style={[s.chip, value === i.k && s.chipOn]}>
          <Text style={[s.chipT, value === i.k && s.chipTOn]}>{i.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function YesNo({ t, value, onChange }: { t: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.yn}>
      <Text style={s.ynT}>{t}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={() => onChange(false)} style={[s.ynB, !value && s.ynNo]}><Text style={[s.ynBT, !value && { color: '#fff' }]}>لا</Text></Pressable>
        <Pressable onPress={() => onChange(true)} style={[s.ynB, value && s.ynYes]}><Text style={[s.ynBT, value && { color: '#fff' }]}>نعم</Text></Pressable>
      </View>
    </View>
  );
}
function Row<T extends number>({ items, value, onPick }: { items: T[]; value: T; onPick: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
      {items.map(v => (
        <Pressable key={v} onPress={() => onPick(v)} style={[s.dChip, value === v && s.chipOn]}>
          <Text style={[s.chipT, value === v && s.chipTOn]}>{v}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
function PhotoSlot({ t, uri, onPick }: { t: string; uri: string; onPick: (camera: boolean) => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable onPress={() => onPick(false)} style={s.slot}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : <Text style={{ fontSize: 24 }}>🖼️</Text>}
      </Pressable>
      <Text style={s.slotT}>{t}</Text>
      <Pressable onPress={() => onPick(true)} hitSlop={6}><Text style={s.cam}>📷 كاميرا</Text></Pressable>
    </View>
  );
}

export default function WorkRegisterScreen() {
  const router = useRouter();
  const toast = useToast();
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role: Role = roleParam === 'carrier' ? 'carrier' : roleParam === 'travel' ? 'travel' : 'driver';
  const [f, setF] = useState<F>(EMPTY);
  const [myPhone, setMyPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const [maxCc, setMaxCc] = useState(1399);
  const [ordMax, setOrdMax] = useState(2000);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof F>(k: K, v: F[K]) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => {
    supabase.rpc('my_work_profile').then(({ data }) => {
      const d: any = data || {};
      setMyPhone(d.phone || '');
      if (d.economy_max_cc) setMaxCc(Number(d.economy_max_cc));
      if (d.ordinary_max_cc) setOrdMax(Number(d.ordinary_max_cc));
      const sameProfile = role === 'carrier' ? d.type === 'transporter' : d.type === 'driver';
      const isSame = sameProfile && (role !== 'travel' || !!d.travel);
      setEditing(isSame);
      const exp = sameProfile && d.license_expiry ? String(d.license_expiry).split('-').map(Number) : [0, 0, 0];
      setF(x => ({
        ...x, full_name: d.full_name || '', phone: d.phone || '',
        ...(sameProfile ? {
          kind: d.kind || '', category: d.category || '', engine_cc: d.engine_cc ? String(d.engine_cc) : '', seats: d.kind === 'car' ? d.seats || 4 : 4,
          cargo_class: d.cargo_class || '', model: d.model || '', year: d.year ? String(d.year) : '', color: d.color || '',
          plate: d.plate || '', owner: d.owner || '', fuel: d.fuel || '', license_no: d.license_no || '', license_place: d.license_place || '',
          ey: exp[0] || 0, em: exp[1] || 0, ed: exp[2] || 0,
          events: !!d.events, wedding: !!d.wedding, airport: !!d.airport, contracts: !!d.contracts, rental: !!d.rental,
          driver_photo: d.driver_photo || '', vehicle_photo: d.vehicle_photo || '', license_photo: d.license_photo ? 'saved' : '',
        } : {}),
      }));
    });
  }, [role]);

  const parsed = useMemo(() => parsePhone(f.phone), [f.phone]);
  const otherPhone = !!parsed && !!myPhone && parsed.phone !== myPhone;

  const pick = async (slot: 'driver_photo' | 'vehicle_photo' | 'license_photo', camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.show('اسمح بالوصول إلى الصور', 'err');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: slot === 'driver_photo' ? [1, 1] : [4, 3], quality: 0.5 };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets?.[0]) set(slot, r.assets[0].uri);
  };

  const days = useMemo(() => {
    const n = f.ey && f.em ? new Date(f.ey, f.em, 0).getDate() : 31;
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [f.ey, f.em]);

  const check = (): string | null => {
    if (!f.full_name.trim()) return 'اكتب الاسم الكامل';
    if (!parsed) return 'رقم الهاتف غير صحيح';
    if (otherPhone) {
      if (passwordHasNonLatin(f.pass)) return 'كلمة المرور بالأحرف الإنجليزية فقط';
      if (!passwordOk(f.pass)) return 'كلمة المرور 8 أحرف على الأقل';
      if (!f.agree) return 'يجب الموافقة على الشروط وسياسة الخصوصية';
    }
    if (role !== 'carrier' && !f.kind) return 'اختر نوع المركبة';
    if (role === 'carrier' && !f.cargo_class) return 'اختر حجم المركبة';
    if (!f.model.trim()) return 'اكتب الماركة والموديل';
    const y = Number(f.year);
    if (!(y >= 1960 && y <= NOW_Y + 1)) return 'سنة الصنع غير صحيحة';
    if (!f.color.trim()) return 'اكتب لون المركبة';
    if (!f.plate.trim()) return 'اكتب رقم اللوحة';
    if (!f.owner.trim()) return 'اكتب اسم مالك المركبة';
    if (!f.fuel) return 'اختر نوع الوقود';
    if (role !== 'carrier' && f.kind === 'car' && f.fuel !== 'electric' && !(Number(f.engine_cc) >= 500 && Number(f.engine_cc) <= 8000))
      return 'اكتب سعة المحرك كما في أوراق المركبة';
    if (!f.license_no.trim()) return 'اكتب رقم الرخصة';
    if (!f.license_place.trim()) return 'اكتب مكان صدور الرخصة';
    if (!f.ey || !f.em || !f.ed) return 'اختر تاريخ انتهاء الرخصة';
    return null;
  };

  const submit = async () => {
    const bad = check();
    if (bad) return toast.show(bad, 'err');
    setBusy(true);
    let client: SupabaseClient = supabase;
    try {
      // رقم آخر: إنشاء حساب عمل جديد دون الخروج من الحساب الحالي
      if (otherPhone) {
        client = makeTempClient();
        const { data, error } = await client.auth.signUp({ email: phoneToAuthEmail(parsed!.phone), password: f.pass, options: { data: { terms: true } } });
        if (error) throw error;
        if (!data.session) throw new Error('NO_SESSION');
        await client.rpc('set_work_intent', { p_role: role });
      }
      const photo = async (k: 'driver_photo' | 'vehicle_photo' | 'license_photo', slot: 'driver' | 'vehicle' | 'license') => {
        const v = f[k];
        if (!v || v === 'saved' || /^https?:/.test(v)) return '';
        return uploadWorkPhoto(client, v, slot);
      };
      const [dp, vp, lp] = [await photo('driver_photo', 'driver'), await photo('vehicle_photo', 'vehicle'), await photo('license_photo', 'license')];
      const pad = (n: number) => String(n).padStart(2, '0');
      const profilePayload = {
        role: role === 'travel' ? 'driver' : role,
        full_name: f.full_name.trim(), kind: f.kind, engine_cc: f.kind === 'car' && f.fuel !== 'electric' ? Number(f.engine_cc) : null, seats: f.seats, cargo_class: f.cargo_class,
        model: f.model.trim(), year: Number(f.year), color: f.color.trim(), plate: f.plate.trim(), owner: f.owner.trim(), fuel: f.fuel,
        license_no: f.license_no.trim(), license_place: f.license_place.trim(), license_expiry: `${f.ey}-${pad(f.em)}-${pad(f.ed)}`,
        events: role === 'driver' && f.events, wedding: role === 'driver' && f.wedding, airport: role === 'driver' && f.airport, contracts: role === 'driver' && f.contracts,
        driver_photo: dp, vehicle_photo: vp, license_photo: lp,
      };
      const { error } = await client.rpc(role === 'travel' ? 'save_travel_driver_profile' : 'save_work_profile', { p: profilePayload });
      if (error) throw error;
      if (role === 'driver') await client.rpc('set_rental_service', { p_on: f.rental });
      if (otherPhone) {
        await client.auth.signOut({ scope: 'local' });
        setBusy(false);
        toast.show('تم إنشاء حساب العمل، سجّل الدخول به برقم العمل', 'ok');
        setTimeout(() => router.replace('/account' as any), 2200);
        return;
      }
      setBusy(false);
      toast.show(editing ? 'تم حفظ البيانات ✓' : 'تم تفعيل حساب العمل ✓');
      // «تؤجر المركبة بدون سائق؟ نعم» عند التسجيل الأول: تُفتح «مركباتي» لإضافة المركبة
      const next = role === 'travel' ? '/travel-provider' : editing ? '/account' : role === 'driver' && f.rental ? '/rental-provider?only=cars' : workHome(role, f.kind, f.events, f.contracts);
      setTimeout(() => router.replace(next as any), 800);
    } catch (e: any) {
      setBusy(false);
      const m = String(e?.message || '');
      if (/already registered|already exists/i.test(m)) return toast.show('رقم العمل مسجّل مسبقاً بحساب آخر', 'err');
      toast.show(errMsg(e, 'تعذر حفظ البيانات، حاول مرة أخرى'), 'err');
    }
  };

  const title = role === 'travel' ? (editing ? 'بيانات سائق السفريات' : 'التسجيل كسائق سفريات') : editing ? 'بيانات العمل' : role === 'driver' ? 'التسجيل كسائق' : 'التسجيل كناقل';
  return (
    <View style={ui.page}>
      <Header title={title} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          {!editing && <View style={s.note}><Text style={s.noteT}>تبدأ باستقبال الطلبات فور الحفظ، ويجب استكمال التحقق من بياناتك خلال 30 يوماً.</Text></View>}

          <Text style={s.sec}>👤 البيانات الشخصية</Text>
          <Label t="الاسم الكامل" />
          <Input value={f.full_name} onChange={v => set('full_name', v)} ph="الاسم الثلاثي" />
          <Label t="رقم الهاتف" />
          <TextInput value={f.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" maxLength={20} editable={!editing}
            style={[s.input, s.ltr, editing && { backgroundColor: '#f1f5f9' }]} />
          {parsed ? <Text style={s.okT}>{COUNTRY_FLAG[parsed.country]} {COUNTRY_NAME[parsed.country]}</Text> : f.phone ? <Text style={s.errT}>رقم الهاتف غير صحيح</Text> : null}
          {otherPhone && (
            <View style={s.other}>
              <Text style={s.otherT}>رقم مختلف عن رقم حسابك: سيُنشأ حساب عمل جديد بهذا الرقم، ويبقى حسابك الحالي كما هو.</Text>
              <Label t="كلمة مرور حساب العمل" />
              <TextInput value={f.pass} onChangeText={v => set('pass', v)} secureTextEntry autoCapitalize="none" autoCorrect={false}
                placeholder="8 أحرف إنجليزية على الأقل" placeholderTextColor="#94a3b8" style={[s.input, s.ltr]} />
              <Pressable onPress={() => set('agree', !f.agree)} style={s.agree}>
                <View style={[s.box, f.agree && s.boxOn]}>{f.agree && <Text style={s.tick}>✓</Text>}</View>
                <Text style={s.agreeT}>أوافق على <Text style={s.link} onPress={() => router.push('/terms' as any)}>الشروط وسياسة الخصوصية</Text></Text>
              </Pressable>
            </View>
          )}

          <Text style={s.sec}>{role === 'carrier' ? '🚚 المركبة' : role === 'travel' ? '🧭 مركبة السفريات' : '🚗 المركبة'}</Text>
          {role !== 'carrier' ? (
            <>
              <Label t="نوع المركبة" />
              <Chips items={DRIVER_KINDS.map(k => ({ k: k.k as string, name: `${k.icon} ${k.name}` }))} value={f.kind}
                onPick={k => setF(x => ({ ...x, kind: k, wedding: kindHasWedding(k) && x.wedding, airport: kindHasAirport(k) && x.airport }))} />
              {f.kind === 'car' && (
                <>
                  <Label t="عدد المقاعد" />
                  <Chips items={[4, 5, 6, 7].map(n => ({ k: n, name: String(n) }))} value={f.seats} onPick={n => set('seats', n)} />
                </>
              )}
            </>
          ) : (
            <>
              <Label t="حجم المركبة" />
              {VGROUPS.map(g => (
                <View key={g.g} style={{ marginBottom: 4 }}>
                  <Text style={s.grp}>{g.icon} {g.name}</Text>
                  <Chips items={VCLASS.filter(v => v.g === g.g).map(v => ({ k: v.k as string, name: v.short }))} value={f.cargo_class} onPick={k => set('cargo_class', k)} />
                </View>
              ))}
            </>
          )}
          <Label t="الماركة والموديل" />
          <Input value={f.model} onChange={v => set('model', v)} ph="مثال: كيا ريو" />
          <View style={s.two}>
            <View style={{ flex: 1 }}><Label t="سنة الصنع" /><Input value={f.year} onChange={v => set('year', v.replace(/\D/g, ''))} ph={String(NOW_Y - 5)} num ltr max={4} /></View>
            <View style={{ flex: 1 }}><Label t="اللون" /><Input value={f.color} onChange={v => set('color', v)} ph="أبيض" max={20} /></View>
          </View>
          <Label t="رقم اللوحة" />
          <Input value={f.plate} onChange={v => set('plate', v)} ph="كما هو مكتوب على اللوحة" max={30} />
          <Label t="اسم مالك المركبة" />
          <Input value={f.owner} onChange={v => set('owner', v)} ph="كما في أوراق المركبة" />
          <Label t="نوع الوقود" />
          <Chips items={FUELS.map(x => ({ k: x.k as string, name: x.name }))} value={f.fuel} onPick={k => set('fuel', k)} />
          <Text style={s.hint}>لا يظهر للزبائن.</Text>
          {role !== 'carrier' && f.kind === 'car' && (
            <>
              {f.fuel !== 'electric' && <>
                <Label t="سعة المحرك (CC)" />
                <Input value={f.engine_cc} onChange={v => set('engine_cc', v.replace(/\D/g, ''))} ph="مثال: 1300" num ltr max={4} />
                <Text style={s.hint}>كما هي مكتوبة في أوراق المركبة.</Text>
              </>}
              {!!f.fuel && (f.fuel === 'electric' || Number(f.engine_cc) >= 500) && (
                <View style={s.catBox}>
                  <Text style={s.catT}>فئة سيارتك: {CAT_LABEL[catOf(f.fuel, Number(f.engine_cc), maxCc, ordMax)]}</Text>
                  <Text style={s.hint}>تُحدَّد تلقائياً حسب الاستهلاك: الكهرباء والهايبرد والمحرك حتى {maxCc} CC اقتصادية، ومن {maxCc + 1} حتى {ordMax} CC عادية، وأكثر من {ordMax} CC فاخرة.</Text>
                </View>
              )}
            </>
          )}

          <Text style={s.sec}>🪪 الرخصة</Text>
          <View style={s.two}>
            <View style={{ flex: 1 }}><Label t="رقم الرخصة" /><Input value={f.license_no} onChange={v => set('license_no', v)} ltr max={30} /></View>
            <View style={{ flex: 1 }}><Label t="مكان الصدور" /><Input value={f.license_place} onChange={v => set('license_place', v)} max={30} /></View>
          </View>
          <Label t="تاريخ انتهاء الرخصة" />
          <Text style={s.grp}>السنة</Text>
          <Row items={Array.from({ length: 16 }, (_, i) => NOW_Y - 5 + i)} value={f.ey} onPick={v => set('ey', v)} />
          <Text style={s.grp}>الشهر</Text>
          <Row items={Array.from({ length: 12 }, (_, i) => i + 1)} value={f.em} onPick={v => setF(x => ({ ...x, em: v, ed: Math.min(x.ed, new Date(x.ey || NOW_Y, v, 0).getDate()) }))} />
          <Text style={s.grp}>اليوم</Text>
          <Row items={days} value={f.ed} onPick={v => set('ed', v)} />
          {!!(f.ey && f.em && f.ed) && <Text style={s.okT}>{f.ey}/{f.em}/{f.ed}</Text>}

          {role === 'driver' && !!f.kind && (
            <>
              <Text style={s.sec}>➕ خدمات إضافية</Text>
              <YesNo t="تعمل كسائق مناسبات؟" value={f.events} onChange={v => set('events', v)} />
              {kindHasWedding(f.kind) && <YesNo t="سيارات الزفاف؟" value={f.wedding} onChange={v => set('wedding', v)} />}
              {kindHasAirport(f.kind) && <YesNo t="خدمات تكسي المطار؟" value={f.airport} onChange={v => set('airport', v)} />}
              <YesNo t="تعمل بالعقود (مدارس، شركات، عمال)؟" value={f.contracts} onChange={v => set('contracts', v)} />
              <YesNo t="تؤجر مركبة بدون سائق؟" value={f.rental} onChange={v => set('rental', v)} />
              {f.rental && <Text style={s.hint}>بعد الحفظ تُفتح «مركباتي» لتضيف المركبة التي تؤجرها (قد تكون هذه المركبة أو غيرها).</Text>}
              {!kindHasTaxi(f.kind) && <Text style={s.hint}>هذا النوع لا يستقبل طلبات التكسي العادية.</Text>}
            </>
          )}

          <Text style={s.sec}>🖼️ الصور</Text>
          <Text style={s.hint}>كل الصور اختيارية. صورتك وصورة المركبة يراهما الزبون بعد قبول الطلب فقط، وصورة الرخصة للتحقق ولا تظهر لأحد.</Text>
          <View style={s.photos}>
            <PhotoSlot t="صورة شخصية" uri={f.driver_photo} onPick={c => pick('driver_photo', c)} />
            <PhotoSlot t="صورة المركبة" uri={f.vehicle_photo} onPick={c => pick('vehicle_photo', c)} />
            <PhotoSlot t={f.license_photo === 'saved' ? 'الرخصة (مرفوعة ✓)' : 'صورة الرخصة'} uri={f.license_photo === 'saved' ? '' : f.license_photo} onPick={c => pick('license_photo', c)} />
          </View>

          <View style={{ marginTop: 22 }}>
            <Btn label={editing ? 'حفظ البيانات' : otherPhone ? 'إنشاء حساب العمل' : 'حفظ وبدء العمل'} onPress={submit} loading={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {toast.node}
    </View>
  );
}

// الفئة المتوقعة للعرض فقط؛ الخادم هو من يحددها فعلياً
const catOf = (fuel: string, cc: number, max: number, ord: number) => (fuel === 'electric' || !cc || cc <= max ? 'economy' : cc <= ord ? 'ordinary' : 'luxury');
const CAT_LABEL: Record<string, string> = { economy: '⚡ اقتصادية', ordinary: '🚗 قياسية', luxury: '✨ فاخرة' };

const s = StyleSheet.create({
  catBox: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 10, marginTop: 10 },
  catT: { fontSize: 14, fontWeight: '900', color: '#3730a3', textAlign: 'right' },
  wrap: { padding: 16, paddingBottom: 70 },
  note: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 6 },
  noteT: { fontSize: 12, color: '#92400e', textAlign: 'right', lineHeight: 18, fontWeight: '700' },
  sec: { fontSize: 15, fontWeight: '900', color: C.txt, textAlign: 'right', marginTop: 22, marginBottom: 2 },
  label: { fontSize: 13, fontWeight: '800', color: C.txt, textAlign: 'right', marginTop: 12, marginBottom: 6 },
  opt: { fontSize: 11, fontWeight: '600', color: C.mute },
  grp: { fontSize: 12, fontWeight: '700', color: C.mute, textAlign: 'right', marginTop: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.txt },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  hint: { fontSize: 11, color: C.mute, textAlign: 'right', marginTop: 6, lineHeight: 16 },
  errT: { fontSize: 12, color: C.err, fontWeight: '700', textAlign: 'right', marginTop: 5 },
  okT: { fontSize: 12, color: C.ok, fontWeight: '800', textAlign: 'right', marginTop: 5 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  dChip: { borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', borderRadius: 10, minWidth: 44, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 7 },
  chipOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipT: { fontSize: 13, fontWeight: '700', color: C.txt },
  chipTOn: { color: '#fff' },
  two: { flexDirection: 'row-reverse', gap: 10 },
  yn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, marginTop: 8 },
  ynT: { flex: 1, fontSize: 13, fontWeight: '700', color: C.txt, textAlign: 'right' },
  ynB: { borderWidth: 1.5, borderColor: C.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  ynBT: { fontSize: 13, fontWeight: '800', color: C.txt },
  ynYes: { backgroundColor: '#059669', borderColor: '#059669' },
  ynNo: { backgroundColor: '#64748b', borderColor: '#64748b' },
  photos: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  slot: { width: '100%', aspectRatio: 1, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  slotT: { fontSize: 11, fontWeight: '700', color: C.txt, marginTop: 4, textAlign: 'center' },
  cam: { fontSize: 11, color: C.brand, fontWeight: '700', marginTop: 2 },
  other: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 10, marginTop: 10 },
  otherT: { fontSize: 12, color: '#3730a3', textAlign: 'right', lineHeight: 18, fontWeight: '700' },
  agree: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 12 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  boxOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  tick: { color: '#fff', fontWeight: '900', fontSize: 13 },
  agreeT: { flex: 1, fontSize: 12, color: C.txt, textAlign: 'right' },
  link: { color: ORANGE, fontWeight: '800', textDecorationLine: 'underline' },
});
