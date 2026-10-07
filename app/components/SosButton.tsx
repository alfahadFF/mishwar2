import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Linking, Share, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { getFreshLocation, getMyLocation } from '../utils/location';
import { trackLink, waPhone } from '../utils/share';
import { startSosTracking, stopSosTracking } from '../utils/sosTask';

// زر الطوارئ 🆘 — للتطبيق كله ولكل المستخدمين، غير مرتبط بنوع الخدمة
export default function SosButton() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [logged, setLogged] = useState(false);
  const [step, setStep] = useState<null | 'confirm' | 'panel' | 'end'>(null);
  const [sos, setSos] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [noBg, setNoBg] = useState(false);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };

  const restore = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setLogged(!!session);
    if (!session) { setSos(null); return; }
    const { data } = await supabase.rpc('my_sos_active');
    setSos(data || null);
    if (data) startSosTracking().then(ok => setNoBg(!ok));
  }, []);
  useEffect(() => {
    restore();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { restore(); });
    return () => sub.subscription.unsubscribe();
  }, [restore]);

  const start = async (mode: 'family' | 'all') => {
    if (busy) return; setBusy(true);
    const ll = (await getFreshLocation()) || (await getMyLocation().then(r => (r.real ? r.ll : null)));
    const { data, error } = await supabase.rpc('sos_start', { p_mode: mode, p_lat: ll?.[0] ?? null, p_lng: ll?.[1] ?? null });
    setBusy(false);
    if (error) { flash(errMsg(error)); return; }
    setSos(data); setStep('panel');
    const ok = await startSosTracking(); setNoBg(!ok);
    if (mode === 'all' && !(data as any)?.family?.length) callEmergency(data);
  };
  const end = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('sos_end');
    setBusy(false);
    if (error) { flash(errMsg(error)); return; }
    await stopSosTracking();
    setSos(null); setStep(null);
  };

  const text = (s: any) => `🆘 حالة طارئة — ${s?.name || 'أنا'} يحتاج مساعدة.\nالموقع المباشر وبيانات الرحلة:\n${trackLink(s.token)}`;
  const sendWa = (phone: string) => {
    const t = encodeURIComponent(text(sos));
    Linking.openURL(`whatsapp://send?phone=${waPhone(phone)}&text=${t}`).catch(() => Linking.openURL(`https://wa.me/${waPhone(phone)}?text=${t}`));
  };
  const sendSms = (phone: string) => {
    const sep = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${phone}${sep}body=${encodeURIComponent(text(sos))}`).catch(() => {});
  };
  const shareAny = () => { Share.share({ message: text(sos) }).catch(() => {}); };
  const callEmergency = (s: any = sos) => { Linking.openURL('tel:' + (s?.emergency_phone || '112')).catch(() => {}); };
  const addEmergency = async () => {
    const { data } = await supabase.rpc('sos_start', { p_mode: 'all', p_lat: null, p_lng: null });
    if (data) setSos(data);
    callEmergency(data || sos);
  };

  if (!logged) return null;
  const active = !!sos;
  const family: any[] = sos?.family || [];
  return (
    <>
      <Pressable onPress={() => setStep(active ? 'panel' : 'confirm')} hitSlop={8}
        style={[s.fab, { top: insets.top + 6 }, active && s.fabOn]}>
        <Text style={[s.fabT, active && { color: '#fff' }]}>{active ? '🆘 نشطة' : '🆘'}</Text>
      </Pressable>

      <Modal visible={!!step} transparent animationType="fade" onRequestClose={() => setStep(null)}>
        <View style={s.overlay}>
          <View style={s.box}>
            {step === 'confirm' && (<>
              <Text style={s.title}>🆘 هل أنت في خطر؟</Text>
              <Text style={s.sub}>يُرسل موقعك المباشر وبيانات الرحلة لأهلك، ويصل تنبيه للإدارة</Text>
              <Pressable onPress={() => start('family')} disabled={busy} style={[s.btn, { backgroundColor: '#dc2626' }]}><Text style={s.btnW}>{busy ? 'جاري...' : '👨‍👩‍👦 الأهل فقط'}</Text></Pressable>
              <Pressable onPress={() => start('all')} disabled={busy} style={[s.btn, { backgroundColor: '#7f1d1d' }]}><Text style={s.btnW}>🚨 الأهل + الطوارئ</Text></Pressable>
              <Pressable onPress={() => setStep(null)} style={[s.btn, s.ghost]}><Text style={s.btnD}>إلغاء</Text></Pressable>
              <Pressable onPress={() => { setStep(null); router.push('/sos-settings' as any); }}><Text style={s.link}>⚙️ إعدادات الطوارئ</Text></Pressable>
            </>)}

            {step === 'panel' && active && (
              <ScrollView contentContainerStyle={{ gap: 8 }}>
                <Text style={[s.title, { color: '#dc2626' }]}>🆘 حالة الطوارئ مفعّلة</Text>
                <Text style={s.sub}>اضغط «إرسال» لكل رقم — الرابط يعرض موقعك المباشر وبيانات الرحلة</Text>
                {noBg && <Text style={s.warn}>⚠️ لم يُسمح بالموقع «دائماً» — يُرسل موقعك فقط والتطبيق مفتوح</Text>}
                {family.map((f, i) => (
                  <View key={i} style={s.row}>
                    <View style={{ flex: 1 }}><Text style={s.rowT}>{f.name || 'رقم الأهل ' + (i + 1)}</Text><Text style={s.rowS}>{f.phone}</Text></View>
                    <Pressable onPress={() => sendWa(f.phone)} style={[s.mini, { backgroundColor: '#16a34a' }]}><Text style={s.btnW}>واتساب</Text></Pressable>
                    <Pressable onPress={() => sendSms(f.phone)} style={[s.mini, { backgroundColor: '#0f172a' }]}><Text style={s.btnW}>رسالة</Text></Pressable>
                  </View>
                ))}
                {!family.length && (
                  <Pressable onPress={() => { setStep(null); router.push('/sos-settings' as any); }} style={s.row}>
                    <Text style={[s.rowT, { flex: 1 }]}>لم تضف أرقام الأهل بعد — اضغط للإضافة</Text>
                  </Pressable>
                )}
                <Pressable onPress={shareAny} style={[s.btn, s.ghost]}><Text style={s.btnD}>📤 إرسال لأي شخص آخر</Text></Pressable>
                {sos.mode === 'all'
                  ? <Pressable onPress={() => callEmergency()} style={[s.btn, { backgroundColor: '#7f1d1d' }]}><Text style={s.btnW}>📞 اتصال بالطوارئ {sos.emergency_phone}</Text></Pressable>
                  : <Pressable onPress={addEmergency} style={[s.btn, s.ghost]}><Text style={s.btnD}>🚨 إضافة الطوارئ ({sos.emergency_phone})</Text></Pressable>}
                <Pressable onPress={() => setStep('end')} style={[s.btn, { backgroundColor: '#059669' }]}><Text style={s.btnW}>✅ أنا بخير — إنهاء الطوارئ</Text></Pressable>
                <Pressable onPress={() => setStep(null)}><Text style={s.link}>إخفاء (تبقى الحالة مفعّلة)</Text></Pressable>
              </ScrollView>
            )}

            {step === 'end' && (<>
              <Text style={s.title}>هل أنت بخير فعلاً؟</Text>
              <Text style={s.sub}>سيتوقف إرسال موقعك ويظهر للأهل «انتهت حالة الطوارئ»</Text>
              <Pressable onPress={end} disabled={busy} style={[s.btn, { backgroundColor: '#059669' }]}><Text style={s.btnW}>{busy ? 'جاري...' : 'نعم، إنهاء الطوارئ'}</Text></Pressable>
              <Pressable onPress={() => setStep('panel')} style={[s.btn, s.ghost]}><Text style={s.btnD}>رجوع</Text></Pressable>
            </>)}
            {!!msg && <Text style={[s.warn, { marginTop: 8 }]}>{msg}</Text>}
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fab: { position: 'absolute', left: 8, zIndex: 999, elevation: 12, minWidth: 38, height: 30, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  fabOn: { backgroundColor: '#dc2626' },
  fabT: { fontSize: 13, fontWeight: '900', color: '#dc2626' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,.6)', justifyContent: 'center', padding: 18 },
  box: { backgroundColor: '#fff', borderRadius: 18, padding: 16, maxHeight: '85%', gap: 8 },
  title: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  sub: { fontSize: 12, color: '#64748b', textAlign: 'center' },
  warn: { fontSize: 11, color: '#92400e', backgroundColor: '#fffbeb', borderRadius: 10, padding: 8, textAlign: 'center' },
  btn: { height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: '#f1f5f9' },
  btnW: { color: '#fff', fontWeight: '900', fontSize: 13 },
  btnD: { color: '#0f172a', fontWeight: '900', fontSize: 13 },
  link: { color: '#4F46E5', fontWeight: '800', fontSize: 12, textAlign: 'center', marginTop: 6 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 8 },
  rowT: { fontWeight: '900', fontSize: 13, textAlign: 'right' },
  rowS: { fontSize: 11, color: '#64748b', textAlign: 'right' },
  mini: { paddingHorizontal: 10, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
