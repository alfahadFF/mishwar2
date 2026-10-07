import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { parsePhone, phoneToAuthEmail, COUNTRY_NAME, COUNTRY_FLAG } from '../utils/phone';
import { useToast } from '../components/Toast';
import { Header, Btn, ui, C } from '../components/DriverUI';

const ORANGE = '#FF6B00';

function loginError(e: any): string {
  const m = String(e?.message || e || '');
  if (/invalid login credentials|invalid_credentials/i.test(m)) return 'رقم الهاتف أو كلمة المرور غير صحيحة';
  if (/rate limit|too many/i.test(m)) return 'محاولات كثيرة، حاول بعد قليل';
  if (/network|fetch/i.test(m)) return 'تحقق من الاتصال بالإنترنت';
  return 'تعذر تسجيل الدخول، حاول مرة أخرى';
}

export default function LoginScreen() {
  const router = useRouter();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parsePhone(phone), [phone]);
  const phoneErr = phone.trim() && !parsed ? 'رقم الهاتف غير صحيح' : '';

  const submit = async () => {
    if (!parsed) return toast.show(phone.trim() ? 'رقم الهاتف غير صحيح' : 'أدخل رقم الهاتف', 'err');
    if (!pass) return toast.show('أدخل كلمة المرور', 'err');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: phoneToAuthEmail(parsed.phone), password: pass });
    setBusy(false);
    if (error) return toast.show(loginError(error), 'err');
    toast.show('تم تسجيل الدخول ✓');
    // العودة إلى الشاشة التي كان فيها (مثلاً بعد محاولة طلب كضيف)
    setTimeout(() => { if (router.canGoBack()) router.back(); else router.replace('/' as any); }, 500);
  };

  return (
    <View style={ui.page}>
      <Header title="تسجيل الدخول" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <View style={s.logoBox}>
            <Image source={require('../assets/icon.png')} style={s.logo} />
          </View>

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
            style={[s.input, s.ltr, !!phoneErr && s.inputErr]}
          />
          {parsed ? <Text style={s.okT}>{COUNTRY_FLAG[parsed.country]} {COUNTRY_NAME[parsed.country]}</Text>
            : phoneErr ? <Text style={s.errT}>{phoneErr}</Text> : null}

          <Text style={s.label}>🔒 كلمة المرور</Text>
          <View style={[s.input, s.passRow]}>
            <TextInput
              value={pass}
              onChangeText={setPass}
              placeholder="كلمة المرور"
              placeholderTextColor="#94a3b8"
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              autoComplete="password"
              onSubmitEditing={submit}
              style={[s.passInput, s.ltr]}
            />
            <Pressable onPress={() => setShow(v => !v)} hitSlop={10} style={s.eye}>
              <Text style={{ fontSize: 18 }}>{show ? '🙈' : '👁'}</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 18 }}>
            <Btn label="تسجيل الدخول" onPress={submit} loading={busy} />
          </View>

          <Pressable onPress={() => router.replace('/register' as any)} style={s.switch} hitSlop={8}>
            <Text style={s.switchT}>ليس لديك حساب؟ <Text style={s.link}>إنشاء حساب</Text></Text>
          </Pressable>
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
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.txt },
  inputErr: { borderColor: '#fca5a5' },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  passRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingRight: 6 },
  passInput: { flex: 1, fontSize: 16, color: C.txt, paddingVertical: 12 },
  eye: { padding: 8 },
  errT: { fontSize: 12, color: C.err, fontWeight: '700', textAlign: 'right', marginTop: 5 },
  okT: { fontSize: 12, color: C.ok, fontWeight: '800', textAlign: 'right', marginTop: 5 },
  switch: { marginTop: 20, alignItems: 'center' },
  switchT: { fontSize: 13, color: C.mute },
  link: { color: ORANGE, fontWeight: '800' },
});
