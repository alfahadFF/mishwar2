import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, makeTempClient } from '../utils/supabase';
import { parsePhone, phoneToAuthEmail, passwordOk, passwordHasNonLatin, COUNTRY_FLAG, COUNTRY_NAME } from '../utils/phone';
import { uploadWorkPhoto } from '../utils/work';
import { getMyLocation } from '../utils/location';
import { errMsg } from '../utils/errors';
import { useToast } from '../components/Toast';
import { Header, Btn, ui, C } from '../components/DriverUI';
import PointPicker from '../components/PointPicker';

const ORANGE = '#FF6B00';
type F = { office_name: string; manager: string; phone: string; pass: string; agree: boolean; city: string;
  ll: number[] | null; place: string; cr_number: string; cr_photo: string; travel: boolean };
const EMPTY: F = { office_name: '', manager: '', phone: '', pass: '', agree: false, city: '', ll: null, place: '', cr_number: '', cr_photo: '', travel: false };

// عناصر ثابتة خارج الشاشة حتى لا يفقد الحقل التركيز
function Label({ t, opt }: { t: string; opt?: boolean }) {
  return <Text style={s.label}>{t}{opt ? <Text style={s.opt}>  (اختياري)</Text> : null}</Text>;
}
function Input(p: { value: string; onChange: (v: string) => void; ph?: string; ltr?: boolean; max?: number }) {
  return <TextInput value={p.value} onChangeText={p.onChange} placeholder={p.ph} placeholderTextColor="#94a3b8" maxLength={p.max || 60}
    style={[s.input, p.ltr ? s.ltr : { textAlign: 'right' }]} />;
}

export default function OfficeRegisterScreen() {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<F>(EMPTY);
  const [myPhone, setMyPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof F>(k: K, v: F[K]) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => {
    supabase.rpc('my_work_profile').then(({ data }) => {
      const d: any = data || {};
      setMyPhone(d.phone || '');
      const isOffice = d.type === 'business';
      setEditing(isOffice);
      setF(x => ({
        ...x, phone: d.phone || '',
        ...(isOffice ? {
          office_name: d.office_name || '', manager: d.manager || '', city: d.city || '',
          ll: d.lat != null && d.lng != null ? [d.lat, d.lng] : null, cr_number: d.cr_number || '', cr_photo: d.cr_photo ? 'saved' : '', travel: !!d.travel,
        } : {}),
      }));
    });
  }, []);

  const parsed = useMemo(() => parsePhone(f.phone), [f.phone]);
  const otherPhone = !!parsed && !!myPhone && parsed.phone !== myPhone;

  const openMap = async () => {
    if (!f.ll) { const { ll, real } = await getMyLocation(); if (real && ll) set('ll', ll); }
    setPick(true);
  };

  const pickPhoto = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast.show('اسمح بالوصول إلى الصور', 'err');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, quality: 0.5 };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets?.[0]) set('cr_photo', r.assets[0].uri);
  };

  const check = (): string | null => {
    if (!f.office_name.trim()) return 'اكتب اسم المكتب';
    if (!f.manager.trim()) return 'اكتب اسم المسؤول';
    if (!parsed) return 'رقم الهاتف غير صحيح';
    if (otherPhone) {
      if (passwordHasNonLatin(f.pass)) return 'كلمة المرور بالأحرف الإنجليزية فقط';
      if (!passwordOk(f.pass)) return 'كلمة المرور 8 أحرف على الأقل';
      if (!f.agree) return 'يجب الموافقة على الشروط وسياسة الخصوصية';
    }
    if (!f.city.trim()) return 'اكتب المحافظة أو المدينة';
    if (!f.ll) return 'حدد موقع المكتب على الخريطة';
    if (!f.cr_number.trim()) return 'اكتب رقم السجل التجاري';
    return null;
  };

  const submit = async () => {
    const bad = check();
    if (bad) return toast.show(bad, 'err');
    setBusy(true);
    let client: SupabaseClient = supabase;
    try {
      // رقم آخر: إنشاء حساب مكتب جديد دون الخروج من الحساب الحالي
      if (otherPhone) {
        client = makeTempClient();
        const { data, error } = await client.auth.signUp({ email: phoneToAuthEmail(parsed!.phone), password: f.pass, options: { data: { terms: true } } });
        if (error) throw error;
        if (!data.session) throw new Error('NO_SESSION');
        await client.rpc('set_work_intent', { p_role: 'office' });
      }
      const cr = f.cr_photo && f.cr_photo !== 'saved' ? await uploadWorkPhoto(client, f.cr_photo, 'cr') : '';
      const { error } = await client.rpc('save_office_profile', {
        p: { office_name: f.office_name.trim(), manager: f.manager.trim(), city: f.city.trim(), lat: f.ll![0], lng: f.ll![1],
             cr_number: f.cr_number.trim(), cr_photo: cr },
      });
      if (error) throw error;
      const { error: travelError } = await client.rpc('set_travel_service', { p_on: f.travel });
      if (travelError) throw travelError;
      if (otherPhone) {
        await client.auth.signOut({ scope: 'local' });
        setBusy(false);
        toast.show('تم إنشاء حساب المكتب، سجّل الدخول به برقم المكتب', 'ok');
        setTimeout(() => router.replace('/account' as any), 2200);
        return;
      }
      setBusy(false);
      toast.show(editing ? 'تم حفظ البيانات ✓' : 'تم تفعيل حساب المكتب ✓');
      setTimeout(() => router.replace((f.travel ? '/travel-provider' : editing ? '/account' : '/rental-provider?only=cars') as any), 800);
    } catch (e: any) {
      setBusy(false);
      const m = String(e?.message || '');
      if (/already registered|already exists/i.test(m)) return toast.show('رقم المكتب مسجّل مسبقاً بحساب آخر', 'err');
      toast.show(errMsg(e, 'تعذر حفظ البيانات، حاول مرة أخرى'), 'err');
    }
  };

  return (
    <View style={ui.page}>
      <Header title={editing ? 'بيانات المكتب' : 'التسجيل كمكتب تأجير'} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          {!editing && <View style={s.note}><Text style={s.noteT}>بعد الحفظ تضيف مركباتك وتستقبل الطلبات فوراً، ويجب استكمال التحقق من بيانات المكتب خلال 30 يوماً.</Text></View>}

          <Label t="اسم المكتب" />
          <Input value={f.office_name} onChange={v => set('office_name', v)} ph="كما في السجل التجاري" />
          <Text style={s.hint}>يظهر للزبون بعد قبول الطلب فقط.</Text>
          <Label t="اسم المسؤول" />
          <Input value={f.manager} onChange={v => set('manager', v)} ph="الاسم الكامل" />

          <Label t="رقم الهاتف" />
          <TextInput value={f.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" maxLength={20} editable={!editing}
            style={[s.input, s.ltr, editing && { backgroundColor: '#f1f5f9' }]} />
          {parsed ? <Text style={s.okT}>{COUNTRY_FLAG[parsed.country]} {COUNTRY_NAME[parsed.country]}</Text> : f.phone ? <Text style={s.errT}>رقم الهاتف غير صحيح</Text> : null}
          {otherPhone && (
            <View style={s.other}>
              <Text style={s.otherT}>رقم مختلف عن رقم حسابك: سيُنشأ حساب مكتب جديد بهذا الرقم، ويبقى حسابك الحالي كما هو.</Text>
              <Label t="كلمة مرور حساب المكتب" />
              <TextInput value={f.pass} onChangeText={v => set('pass', v)} secureTextEntry autoCapitalize="none" autoCorrect={false}
                placeholder="8 أحرف إنجليزية على الأقل" placeholderTextColor="#94a3b8" style={[s.input, s.ltr]} />
              <Pressable onPress={() => set('agree', !f.agree)} style={s.agree}>
                <View style={[s.box, f.agree && s.boxOn]}>{f.agree && <Text style={s.tick}>✓</Text>}</View>
                <Text style={s.agreeT}>أوافق على <Text style={s.link} onPress={() => router.push('/terms' as any)}>الشروط وسياسة الخصوصية</Text></Text>
              </Pressable>
            </View>
          )}

          <Label t="المحافظة أو المدينة" />
          <Input value={f.city} onChange={v => set('city', v)} ph="مثال: دمشق" max={40} />

          <Label t="موقع المكتب" />
          <Pressable onPress={openMap} style={[s.input, s.mapBtn]}>
            <Text style={{ fontSize: 18 }}>📍</Text>
            <Text style={[s.mapT, !f.ll && { color: '#94a3b8' }]} numberOfLines={1}>
              {f.ll ? (f.place || 'تم تحديد الموقع ✓') : 'حدد الموقع على الخريطة'}
            </Text>
          </Pressable>
          <Text style={s.hint}>يُستخدم موقعاً افتراضياً لمركباتك الجديدة.</Text>

          <Text style={s.sec}>خدمات المكتب</Text>
          <Pressable onPress={() => set('travel', !f.travel)} style={s.travelBox}>
            <View style={[s.check, f.travel && s.checkOn]}>{f.travel && <Text style={s.checkT}>✓</Text>}</View>
            <View style={{ flex: 1 }}>
              <Text style={s.travelTitle}>تقديم خدمة السفريات</Text>
              <Text style={s.hint}>يمكن للمكتب نشر أكثر من رحلة وتحديد أجرة كل راكب.</Text>
            </View>
          </Pressable>

          <Label t="رقم السجل التجاري" />
          <Input value={f.cr_number} onChange={v => set('cr_number', v)} ltr max={40} />
          <Label t="صورة السجل التجاري" opt />
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => pickPhoto(false)} style={s.slot}>
              {f.cr_photo && f.cr_photo !== 'saved' ? <Image source={{ uri: f.cr_photo }} style={StyleSheet.absoluteFill} />
                : <Text style={{ fontSize: f.cr_photo === 'saved' ? 13 : 24 }}>{f.cr_photo === 'saved' ? 'مرفوعة ✓' : '🖼️'}</Text>}
            </Pressable>
            <Pressable onPress={() => pickPhoto(true)} hitSlop={6}><Text style={s.cam}>📷 كاميرا</Text></Pressable>
          </View>
          <Text style={s.hint}>للتحقق فقط، ولا تظهر لأحد.</Text>

          <View style={{ marginTop: 22 }}>
            <Btn label={editing ? 'حفظ البيانات' : otherPhone ? 'إنشاء حساب المكتب' : 'حفظ ومتابعة إلى مركباتي'} onPress={submit} loading={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <PointPicker visible={pick} title="موقع المكتب" initial={f.ll} onClose={() => setPick(false)}
        onConfirm={(ll, label) => { setF(x => ({ ...x, ll, place: label })); setPick(false); }} />
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 70 },
  sec: { fontSize: 15, fontWeight: '900', color: C.txt, textAlign: 'right', marginTop: 20, marginBottom: 4 },
  travelBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 12, padding: 12, marginTop: 8 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  checkT: { color: '#fff', fontWeight: '900' },
  travelTitle: { color: C.txt, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  note: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 6 },
  noteT: { fontSize: 12, color: '#92400e', textAlign: 'right', lineHeight: 18, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '800', color: C.txt, textAlign: 'right', marginTop: 14, marginBottom: 6 },
  opt: { fontSize: 11, fontWeight: '600', color: C.mute },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.txt },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  hint: { fontSize: 11, color: C.mute, textAlign: 'right', marginTop: 6, lineHeight: 16 },
  errT: { fontSize: 12, color: C.err, fontWeight: '700', textAlign: 'right', marginTop: 5 },
  okT: { fontSize: 12, color: C.ok, fontWeight: '800', textAlign: 'right', marginTop: 5 },
  mapBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  mapT: { flex: 1, fontSize: 14, color: C.txt, textAlign: 'right', fontWeight: '700' },
  slot: { width: 110, height: 80, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cam: { fontSize: 12, color: C.brand, fontWeight: '700' },
  other: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 10, marginTop: 10 },
  otherT: { fontSize: 12, color: '#3730a3', textAlign: 'right', lineHeight: 18, fontWeight: '700' },
  agree: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 12 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  boxOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  tick: { color: '#fff', fontWeight: '900', fontSize: 13 },
  agreeT: { flex: 1, fontSize: 12, color: C.txt, textAlign: 'right' },
  link: { color: ORANGE, fontWeight: '800', textDecorationLine: 'underline' },
});
