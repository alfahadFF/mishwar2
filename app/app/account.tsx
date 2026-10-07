import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../utils/supabase';
import { phoneToAuthEmail, passwordOk, passwordHasNonLatin } from '../utils/phone';
import { errMsg } from '../utils/errors';
import { SUPPORT_PHONE, callSupport, whatsAppSupport } from '../utils/support';
import { useToast } from '../components/Toast';
import { Header, Btn, Sheet, ui, C } from '../components/DriverUI';

type Acc = { phone: string | null; wallet_id: string | null; full_name: string | null; type: string; country: string | null; work?: boolean; verified?: boolean };

function PassInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <View style={[s.input, s.passRow]}>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#94a3b8"
        secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} style={[s.passInput, s.ltr]} />
      <Pressable onPress={() => setShow(v => !v)} hitSlop={10} style={{ padding: 8 }}>
        <Text style={{ fontSize: 18 }}>{show ? '🙈' : '👁'}</Text>
      </Pressable>
    </View>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const toast = useToast();
  const [acc, setAcc] = useState<Acc | null>(null);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [sheet, setSheet] = useState<'pass' | 'delete' | 'logout' | null>(null);
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [delP, setDelP] = useState('');
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState<{ on: boolean; unread: number }>({ on: false, unread: 0 });

  const load = useCallback(async () => {
    supabase.rpc('my_admin_flags').then(async ({ data }) => {
      if (!(data as any)?.is_admin) return setAdmin({ on: false, unread: 0 });
      const h = await supabase.rpc('admin_home');
      setAdmin({ on: true, unread: Number((h.data as any)?.unread || 0) });
    });
    const { data, error } = await supabase.rpc('my_account');
    if (error || !data) { if (!error) router.replace('/' as any); return; }
    setAcc(data as Acc);
    setName((data as Acc).full_name || '');
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const close = () => { setSheet(null); setOldP(''); setNewP(''); setDelP(''); };

  // التحقق من كلمة المرور الحالية بإعادة تسجيل الدخول
  const checkPass = async (p: string) => {
    if (!acc?.phone) return false;
    const { error } = await supabase.auth.signInWithPassword({ email: phoneToAuthEmail(acc.phone), password: p });
    return !error;
  };

  const saveName = async () => {
    setSavingName(true);
    const { data, error } = await supabase.rpc('set_my_name', { p_name: name });
    setSavingName(false);
    if (error) return toast.show(errMsg(error), 'err');
    setAcc(a => (a ? { ...a, full_name: (data as any)?.full_name ?? null } : a));
    toast.show('تم حفظ الاسم ✓');
  };

  const copyId = async () => {
    if (!acc?.wallet_id) return;
    await Clipboard.setStringAsync(acc.wallet_id);
    toast.show('تم نسخ المعرّف ✓');
  };

  const startTravelRegistration = async () => {
    const { error } = await supabase.rpc('set_work_intent', { p_role: 'travel' });
    if (error) return toast.show(errMsg(error), 'err');
    router.push('/work-register?role=travel' as any);
  };

  const changePass = async () => {
    if (!oldP) return toast.show('أدخل كلمة المرور الحالية', 'err');
    if (passwordHasNonLatin(newP)) return toast.show('كلمة المرور بالأحرف الإنجليزية فقط', 'err');
    if (!passwordOk(newP)) return toast.show('كلمة المرور الجديدة 8 أحرف على الأقل', 'err');
    if (newP === oldP) return toast.show('كلمة المرور الجديدة مطابقة للحالية', 'err');
    setBusy(true);
    if (!(await checkPass(oldP))) { setBusy(false); return toast.show('كلمة المرور الحالية غير صحيحة', 'err'); }
    const { error } = await supabase.auth.updateUser({ password: newP });
    setBusy(false);
    if (error) return toast.show(/different|same/i.test(error.message) ? 'كلمة المرور الجديدة مطابقة للحالية' : 'تعذر تغيير كلمة المرور، حاول مرة أخرى', 'err');
    close();
    toast.show('تم تغيير كلمة المرور ✓');
  };

  const logout = async () => {
    setBusy(true);
    await supabase.auth.signOut({ scope: 'local' });
    setBusy(false);
    close();
    router.replace('/' as any);
  };

  const deleteAcc = async () => {
    if (!delP) return toast.show('أدخل كلمة المرور للتأكيد', 'err');
    setBusy(true);
    if (!(await checkPass(delP))) { setBusy(false); return toast.show('كلمة المرور غير صحيحة', 'err'); }
    const { error } = await supabase.rpc('delete_my_account');
    if (error) { setBusy(false); return toast.show(errMsg(error, 'تعذر حذف الحساب، حاول مرة أخرى'), 'err'); }
    await supabase.auth.signOut({ scope: 'local' });
    setBusy(false);
    close();
    router.replace('/' as any);
  };

  const nameChanged = (name.trim() || null) !== (acc?.full_name || null);

  return (
    <View style={ui.page}>
      <Header title="حسابي" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          {/* البيانات الثابتة */}
          <View style={ui.card}>
            <Text style={s.k}>📱 رقم الهاتف</Text>
            <Text style={[s.v, s.ltr]}>{acc?.phone || '—'}</Text>
            <View style={s.sep} />
            <Text style={s.k}>🆔 المعرّف</Text>
            <View style={s.idRow}>
              <Text style={[s.v, s.ltr, { flex: 1 }]}>{acc?.wallet_id || '—'}</Text>
              <Pressable onPress={copyId} style={s.copy} hitSlop={6}><Text style={s.copyT}>📋 نسخ</Text></Pressable>
            </View>
            <Text style={s.hint}>يُستخدم للتحويل إليك، وهو أيضاً رمز الدعوة الخاص بك.</Text>
          </View>

          {/* الاسم */}
          <View style={ui.card}>
            <Text style={s.k}>👤 الاسم (اختياري)</Text>
            <TextInput value={name} onChangeText={setName} placeholder="اكتب اسمك" placeholderTextColor="#94a3b8"
              maxLength={40} style={[s.input, { textAlign: 'right' }]} />
            <Text style={s.hint}>إذا لم تكتب اسماً يظهر المعرّف مكانه.</Text>
            {nameChanged && <View style={{ marginTop: 10 }}><Btn label="حفظ الاسم" onPress={saveName} loading={savingName} /></View>}
          </View>

          {/* العمل */}
          {acc?.type === 'personal' ? (
            <View style={s.workRow}>
              <Pressable style={s.workBtn} onPress={() => router.push('/work-register?role=driver' as any)}>
                <Text style={{ fontSize: 24 }}>🚕</Text><Text style={s.workT}>كن سائقاً</Text>
              </Pressable>
              <Pressable style={s.workBtn} onPress={() => router.push('/work-register?role=carrier' as any)}>
                <Text style={{ fontSize: 24 }}>🚚</Text><Text style={s.workT}>كن ناقلاً</Text>
              </Pressable>
              <Pressable style={[s.workBtn, { borderColor: '#99F6E4', backgroundColor: '#F0FDFA' }]} onPress={startTravelRegistration}>
                <Text style={{ fontSize: 24 }}>🧭</Text><Text style={s.workT}>سائق سفريات</Text>
              </Pressable>
            </View>
          ) : (acc?.type === 'driver' || acc?.type === 'transporter') ? (
            <>
            <Pressable style={[ui.card, s.rentCard, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}
              onPress={() => router.push(`/work-register?role=${acc.type === 'driver' ? 'driver' : 'carrier'}` as any)}>
              <Text style={{ fontSize: 26 }}>{acc.type === 'driver' ? '🚕' : '🚚'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rentT}>بيانات العمل: {acc.type === 'driver' ? 'سائق' : 'ناقل'}</Text>
                <Text style={s.hint}>{acc.verified ? 'تم التحقق ✓' : 'بانتظار التحقق'} • المركبة والرخصة والخدمات</Text>
              </View>
              <Text style={{ color: C.mute }}>←</Text>
            </Pressable>
            {acc.type === 'driver' && <Pressable style={[ui.card, { borderColor: '#99F6E4', backgroundColor: '#F0FDFA' }]} onPress={startTravelRegistration}>
              <Text style={{ fontSize: 26 }}>🧭</Text>
              <View style={{ flex: 1 }}><Text style={s.rentT}>التسجيل كسائق سفريات</Text><Text style={s.hint}>أضف خدمة السفريات إلى بيانات المركبة الحالية.</Text></View>
              <Text style={{ color: C.mute }}>←</Text>
            </Pressable>}
            </>
          ) : acc?.type === 'business' ? (
            <Pressable style={[ui.card, s.rentCard, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]} onPress={() => router.push('/office-register' as any)}>
              <Text style={{ fontSize: 26 }}>🏢</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rentT}>بيانات المكتب</Text>
                <Text style={s.hint}>{acc.verified ? 'تم التحقق ✓' : 'بانتظار التحقق'} • الاسم والموقع والسجل التجاري</Text>
              </View>
              <Text style={{ color: C.mute }}>←</Text>
            </Pressable>
          ) : null}

          {/* الإدارة: تظهر لحساب الأدمن فقط */}
          {admin.on && (
            <Pressable style={[ui.card, s.rentCard, { borderColor: '#fde68a', backgroundColor: '#fffbeb' }]} onPress={() => router.push('/admin' as any)}>
              <Text style={{ fontSize: 26 }}>⚙️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rentT}>الإدارة</Text>
                <Text style={s.hint}>التحقق، الإلغاءات، المستخدمون، المحفظة، الإعدادات</Text>
              </View>
              {admin.unread > 0 && <View style={{ backgroundColor: '#dc2626', borderRadius: 12, minWidth: 24, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{admin.unread}</Text></View>}
              <Text style={{ color: C.mute }}>←</Text>
            </Pressable>
          )}

          {/* التأجير */}
          <Pressable style={[ui.card, s.rentCard]} onPress={() => router.push('/rental-provider' as any)}>
            <Text style={{ fontSize: 26 }}>🔑</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.rentT}>هل تمتلك مركبة وترغب بتأجيرها بدون سائق؟</Text>
              <Text style={s.hint}>أضف سيارتك واستقبل طلبات الإيجار ضمن 50 كم.</Text>
            </View>
            <Text style={{ color: C.mute }}>←</Text>
          </Pressable>

          {/* الدعم */}
          <View style={ui.card}>
            <Text style={s.k}>🎧 الدعم</Text>
            <Text style={[s.v, s.ltr]}>{SUPPORT_PHONE}</Text>
            <View style={s.btns}>
              <View style={{ flex: 1 }}><Btn label="📞 اتصال" tone="ok" onPress={callSupport} /></View>
              <View style={{ flex: 1 }}><Btn label="💬 واتساب" onPress={whatsAppSupport} /></View>
            </View>
          </View>

          {/* الإعدادات */}
          <View style={ui.card}>
            <Pressable style={s.row} onPress={() => setSheet('pass')}><Text style={s.rowT}>🔒 تغيير كلمة المرور</Text><Text style={{ color: C.mute }}>←</Text></Pressable>
            <View style={s.sep} />
            <Pressable style={s.row} onPress={() => setSheet('logout')}><Text style={s.rowT}>🚪 تسجيل الخروج</Text><Text style={{ color: C.mute }}>←</Text></Pressable>
            <View style={s.sep} />
            <Pressable style={s.row} onPress={() => setSheet('delete')}><Text style={[s.rowT, { color: C.err }]}>🗑 حذف الحساب</Text><Text style={{ color: C.mute }}>←</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={sheet === 'pass'} onClose={close} title="تغيير كلمة المرور">
        <PassInput value={oldP} onChange={setOldP} placeholder="كلمة المرور الحالية" />
        <View style={{ height: 10 }} />
        <PassInput value={newP} onChange={setNewP} placeholder="كلمة المرور الجديدة" />
        <Text style={s.hint}>8 أحرف على الأقل، بالأحرف الإنجليزية فقط.</Text>
        <View style={{ marginTop: 14 }}><Btn label="حفظ" onPress={changePass} loading={busy} /></View>
      </Sheet>

      <Sheet visible={sheet === 'logout'} onClose={close} title="تسجيل الخروج">
        <Text style={s.body}>هل تريد تسجيل الخروج من هذا الجهاز؟</Text>
        <View style={s.btns}>
          <View style={{ flex: 1 }}><Btn label="إلغاء" tone="ghost" onPress={close} /></View>
          <View style={{ flex: 1 }}><Btn label="تسجيل الخروج" tone="err" onPress={logout} loading={busy} /></View>
        </View>
      </Sheet>

      <Sheet visible={sheet === 'delete'} onClose={close} title="حذف الحساب">
        <Text style={s.body}>سيُحذف رقمك واسمك وبيانات الطوارئ، ولن تتمكن من الدخول إلى هذا الحساب مرة أخرى. يمكنك لاحقاً إنشاء حساب جديد بالرقم نفسه، ويبدأ من الصفر.</Text>
        <Text style={s.hint}>لا يمكن الحذف إذا كان في محفظتك رصيد، أو لديك طلب لم ينتهِ، أو سيارتك مؤجّرة حالياً.</Text>
        <View style={{ height: 10 }} />
        <PassInput value={delP} onChange={setDelP} placeholder="كلمة المرور للتأكيد" />
        <View style={s.btns}>
          <View style={{ flex: 1 }}><Btn label="إلغاء" tone="ghost" onPress={close} /></View>
          <View style={{ flex: 1 }}><Btn label="حذف نهائي" tone="err" onPress={deleteAcc} loading={busy} /></View>
        </View>
      </Sheet>

      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 14, paddingBottom: 60 },
  k: { fontSize: 12, fontWeight: '800', color: C.mute, textAlign: 'right' },
  v: { fontSize: 17, fontWeight: '800', color: C.txt, marginTop: 4 },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  sep: { height: 1, backgroundColor: C.line, marginVertical: 10 },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  copyT: { fontSize: 13, fontWeight: '800', color: C.txt },
  hint: { fontSize: 11, color: C.mute, textAlign: 'right', marginTop: 6, lineHeight: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: C.txt, marginTop: 8 },
  passRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingRight: 6, marginTop: 0 },
  passInput: { flex: 1, fontSize: 16, color: C.txt, paddingVertical: 11 },
  rentCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderColor: '#c7d2fe', backgroundColor: '#eef2ff' },
  workRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 10 },
  workBtn: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: '#fff7ed', borderWidth: 1.5, borderColor: '#fed7aa', borderRadius: 16, paddingVertical: 14 },
  workT: { fontSize: 14, fontWeight: '900', color: '#9a3412' },
  rentT: { fontSize: 14, fontWeight: '800', color: C.txt, textAlign: 'right' },
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowT: { fontSize: 15, fontWeight: '700', color: C.txt },
  body: { fontSize: 14, color: C.txt, textAlign: 'right', lineHeight: 22 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
