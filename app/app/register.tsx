import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { parsePhone, phoneToAuthEmail, passwordOk, passwordHasNonLatin, toLatinDigits, COUNTRY_NAME, COUNTRY_FLAG } from '../utils/phone';
import { useToast } from '../components/Toast';
import { Header, Btn, ui, C } from '../components/DriverUI';

const ORANGE = '#FF6B00';

// رسائل أخطاء إنشاء الحساب
function signupError(e: any): string {
  const m = String(e?.message || e || '');
  if (/already registered|already exists|users_email_key/i.test(m)) return 'هذا الرقم مسجّل مسبقاً';
  if (/BAD_PHONE/i.test(m)) return 'رقم الهاتف غير صحيح';
  if (/Database error saving new user/i.test(m)) return 'تعذر إنشاء ملف الحساب؛ قد يكون الرقم مسجلاً مسبقاً. جرّب تسجيل الدخول أو استخدم رقماً آخر';
  if (/TERMS_REQUIRED/.test(m)) return 'يجب الموافقة على الشروط وسياسة الخصوصية';
  if (/password/i.test(m)) return 'كلمة المرور غير مقبولة، اختر كلمة أطول';
  if (/rate limit|too many/i.test(m)) return 'محاولات كثيرة، حاول بعد قليل';
  if (/network|fetch/i.test(m)) return 'تحقق من الاتصال بالإنترنت';
  return 'تعذر إنشاء الحساب، حاول مرة أخرى';
}

export default function RegisterScreen() {
  const router = useRouter();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [invite, setInvite] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  // الخطوة الأولى: نوع الحساب
  const [acct, setAcct] = useState<null | 'personal' | 'work'>(null);
  const [role, setRole] = useState<null | 'driver' | 'travel' | 'carrier' | 'office'>(null);
  const ready = acct === 'personal' || (acct === 'work' && !!role);

  const parsed = useMemo(() => parsePhone(phone), [phone]);
  const phoneErr = phone.trim() && !parsed ? 'رقم الهاتف غير صحيح' : tried && !phone.trim() ? 'أدخل رقم الهاتف' : '';
  const passErr = passwordHasNonLatin(pass) ? 'استخدم أحرفاً وأرقاماً إنكليزية فقط بدون مسافات'
    : pass && pass.length < 8 ? `8 خانات على الأقل (${pass.length}/8)` : tried && !pass ? 'أدخل كلمة المرور' : '';

  const submit = async () => {
    setTried(true);
    if (!parsed) return toast.show(phone.trim() ? 'رقم الهاتف غير صحيح' : 'أدخل رقم الهاتف', 'err');
    if (!passwordOk(pass)) return toast.show(passErr || 'كلمة المرور غير صحيحة', 'err');
    if (!agree) return toast.show('يجب الموافقة على الشروط وسياسة الخصوصية', 'err');
    setBusy(true);
    try {
      const code = toLatinDigits(invite).replace(/\D/g, '');
      if (code) {
        const { data: ok, error } = await supabase.rpc('invite_code_valid', { p_code: code });
        if (error) throw error;
        if (!ok) { setBusy(false); return toast.show('رمز الدعوة غير صحيح', 'err'); }
      }
      const { data, error } = await supabase.auth.signUp({
        email: phoneToAuthEmail(parsed.phone),
        password: pass,
        options: { data: { terms: true, ...(code ? { invite: code } : {}) } },
      });
      if (error) throw error;
      if (!data.session) {
        setBusy(false);
        return toast.show('تم إنشاء الحساب، لكن الدخول التلقائي غير مفعّل حالياً', 'info');
      }
      toast.show('تم إنشاء الحساب بنجاح ✓');
      if (acct === 'work' && role) {
        // حساب عمل: حفظ النوع ثم فتح النموذج
        await supabase.rpc('set_work_intent', { p_role: role });
        setTimeout(() => router.replace((role === 'office' ? '/office-register' : `/work-register?role=${role}`) as any), 500);
      } else {
        // العودة إلى الشاشة التي كان فيها (مثلاً بعد محاولة طلب كضيف)
        setTimeout(() => { if (router.canGoBack()) router.back(); else router.replace('/' as any); }, 600);
      }
    } catch (e) {
      toast.show(signupError(e), 'err');
    }
    setBusy(false);
  };

  return (
    <View style={ui.page}>
      <Header title="إنشاء حساب" onBack={() => (ready ? (setAcct(null), setRole(null)) : router.back())} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <View style={s.logoBox}>
            <Image source={require('../assets/icon.png')} style={s.logo} />
          </View>

          {!ready && (
            <View>
              <Text style={s.stepT}>نوع الحساب</Text>
              <Pressable onPress={() => { setAcct('personal'); setRole(null); }} style={s.typeCard}>
                <Text style={s.typeIcon}>🧍</Text>
                <View style={{ flex: 1 }}><Text style={s.typeH}>حساب شخصي</Text><Text style={s.typeD}>لطلب الخدمات: تكسي، سفريات، نقل، مناسبات، عقود وتأجير</Text></View>
              </Pressable>
              <Pressable onPress={() => setAcct('work')} style={[s.typeCard, acct === 'work' && s.typeOn]}>
                <Text style={s.typeIcon}>💼</Text>
                <View style={{ flex: 1 }}><Text style={s.typeH}>حساب عمل</Text><Text style={s.typeD}>لاستقبال الطلبات وتقديم الخدمات</Text></View>
              </Pressable>
              {acct === 'work' && (
                <View style={s.subRow}>
                  <Pressable onPress={() => setRole('driver')} style={[s.subCard, role === 'driver' && s.typeOn]}><Text style={s.typeIcon}>🚕</Text><Text style={s.typeH}>سائق</Text></Pressable>
                  <Pressable onPress={() => setRole('travel')} style={[s.subCard, role === 'travel' && s.typeOn]}><Text style={s.typeIcon}>🧭</Text><Text style={s.typeH}>سائق سفريات</Text></Pressable>
                  <Pressable onPress={() => setRole('carrier')} style={[s.subCard, role === 'carrier' && s.typeOn]}><Text style={s.typeIcon}>🚚</Text><Text style={s.typeH}>ناقل</Text></Pressable>
                  <Pressable onPress={() => setRole('office')} style={[s.subCard, role === 'office' && s.typeOn]}><Text style={s.typeIcon}>🔑</Text><Text style={s.typeH}>مكتب تأجير</Text></Pressable>
                </View>
              )}
              <Pressable onPress={() => router.replace('/login' as any)} style={s.switch} hitSlop={8}>
                <Text style={s.switchT}>لديك حساب؟ <Text style={s.link}>تسجيل الدخول</Text></Text>
              </Pressable>
            </View>
          )}

          {ready && <>
          <View style={s.chosen}>
            <Text style={s.chosenT}>{acct === 'personal' ? '🧍 حساب شخصي' : role === 'travel' ? '🧭 حساب عمل: سائق سفريات' : role === 'driver' ? '🚕 حساب عمل: سائق' : role === 'carrier' ? '🚚 حساب عمل: ناقل' : '🔑 حساب عمل: مكتب تأجير'}</Text>
            <Pressable onPress={() => { setAcct(null); setRole(null); }} hitSlop={8}><Text style={s.link}>تغيير</Text></Pressable>
          </View>
          {acct === 'work' && <Text style={s.hint}>{role === 'office' ? 'بعد إنشاء الحساب تكمل بيانات المكتب.' : role === 'travel' ? 'بعد إنشاء الحساب تكمل بيانات المركبة والرخصة لخدمة السفريات.' : 'بعد إنشاء الحساب تكمل بيانات المركبة والرخصة.'}</Text>}

          <Text style={s.label}>📱 رقم الهاتف</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="مثال: 0912345678"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={20}
            style={[s.input, s.ltr, !!phoneErr && s.inputErr, !!parsed && s.inputOk]}
          />
          {parsed ? (
            <Text style={s.okT}>{COUNTRY_FLAG[parsed.country]} {COUNTRY_NAME[parsed.country]} • <Text style={s.ltrT}>{parsed.phone}</Text></Text>
          ) : phoneErr ? <Text style={s.errT}>{phoneErr}</Text> : (
            <Text style={s.hint}>مع المفتاح الدولي أو بدونه، ومع الصفر أو بدونه</Text>
          )}

          <Text style={s.label}>🔒 كلمة المرور</Text>
          <View style={[s.input, s.passRow, !!passErr && s.inputErr]}>
            <TextInput
              value={pass}
              onChangeText={setPass}
              placeholder="8 خانات على الأقل"
              placeholderTextColor="#94a3b8"
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="password-new"
              style={[s.passInput, s.ltr]}
            />
            <Pressable onPress={() => setShow(v => !v)} hitSlop={10} style={s.eye}>
              <Text style={{ fontSize: 18 }}>{show ? '🙈' : '👁'}</Text>
            </Pressable>
          </View>
          {passErr ? <Text style={s.errT}>{passErr}</Text> : <Text style={s.hint}>أحرف وأرقام إنكليزية</Text>}

          <Text style={s.label}>🎁 رمز الدعوة <Text style={s.opt}>(اختياري)</Text></Text>
          <TextInput
            value={invite}
            onChangeText={setInvite}
            placeholder="رقم حساب صديقك"
            placeholderTextColor="#94a3b8"
            keyboardType="number-pad"
            maxLength={12}
            style={[s.input, s.ltr]}
          />

          <View style={s.agreeRow}>
            <Pressable onPress={() => setAgree(v => !v)} hitSlop={8} style={[s.box, agree && s.boxOn]}>
              {agree && <Text style={s.tick}>✓</Text>}
            </Pressable>
            <Text style={s.agreeT}>
              <Text onPress={() => setAgree(v => !v)}>أوافق على </Text>
              <Text style={s.link} onPress={() => router.push('/terms' as any)}>الشروط وسياسة الخصوصية</Text>
            </Text>
          </View>

          <View style={{ marginTop: 18 }}>
            <Btn label={acct === 'work' ? 'إنشاء الحساب والمتابعة' : 'إنشاء حساب'} onPress={submit} loading={busy} />
          </View>
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 60 },
  logoBox: { alignItems: 'center', marginBottom: 18, marginTop: 6 },
  logo: { width: 96, height: 96, borderRadius: 24 },
  label: { fontSize: 13, fontWeight: '800', color: C.txt, textAlign: 'right', marginTop: 14, marginBottom: 6 },
  opt: { fontSize: 11, fontWeight: '600', color: C.mute },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.txt },
  inputErr: { borderColor: '#fca5a5' },
  inputOk: { borderColor: '#6ee7b7' },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  ltrT: { writingDirection: 'ltr' },
  passRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingRight: 6 },
  passInput: { flex: 1, fontSize: 16, color: C.txt, paddingVertical: 12 },
  eye: { padding: 8 },
  hint: { fontSize: 11, color: C.mute, textAlign: 'right', marginTop: 5 },
  errT: { fontSize: 12, color: C.err, fontWeight: '700', textAlign: 'right', marginTop: 5 },
  okT: { fontSize: 12, color: C.ok, fontWeight: '800', textAlign: 'right', marginTop: 5 },
  agreeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 20 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  boxOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  tick: { color: '#fff', fontWeight: '900', fontSize: 14 },
  agreeT: { flex: 1, fontSize: 13, color: C.txt, textAlign: 'right' },
  link: { color: ORANGE, fontWeight: '800', textDecorationLine: 'underline' },
  switch: { marginTop: 20, alignItems: 'center' },
  stepT: { fontSize: 16, fontWeight: '900', color: C.txt, textAlign: 'right', marginBottom: 10 },
  typeCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 2, borderColor: C.line, borderRadius: 16, padding: 14, marginBottom: 10 },
  typeOn: { borderColor: ORANGE, backgroundColor: '#fff7ed' },
  typeIcon: { fontSize: 28 },
  typeH: { fontSize: 15, fontWeight: '900', color: C.txt, textAlign: 'right' },
  typeD: { fontSize: 12, color: C.mute, textAlign: 'right', marginTop: 2 },
  subRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  subCard: { width: '48%', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderWidth: 2, borderColor: '#fed7aa', borderRadius: 16, paddingVertical: 14 },
  chosen: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff7ed', borderRadius: 12, padding: 10 },
  chosenT: { fontSize: 14, fontWeight: '800', color: C.txt },
  switchT: { fontSize: 13, color: C.mute },
});
