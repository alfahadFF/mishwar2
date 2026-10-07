import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { useToast } from '../components/Toast';

// إعدادات زر الطوارئ: رقمين للأهل (أولوية أولى) + رقم ثانوي للطوارئ
export default function SosSettings() {
  const router = useRouter();
  const toast = useToast();
  const [f1, setF1] = useState({ name: '', phone: '' });
  const [f2, setF2] = useState({ name: '', phone: '' });
  const [em, setEm] = useState('112');
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await supabase.rpc('my_sos_settings');
      const d: any = data || {};
      const fam = d.family || [];
      setF1(fam[0] || { name: '', phone: '' }); setF2(fam[1] || { name: '', phone: '' });
      setEm(d.emergency_phone || '112');
    })();
  }, []));
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('save_sos_settings', { p_family: [f1, f2], p_emergency: em });
    setBusy(false);
    if (error) { toast.show(errMsg(error), 'err'); return; }
    toast.show('تم حفظ إعدادات الطوارئ', 'ok');
  };
  const Field = ({ label, v, set, ph, kb }: any) => (
    <View style={{ gap: 4 }}>
      <Text style={s.lbl}>{label}</Text>
      <TextInput value={v} onChangeText={set} placeholder={ph} keyboardType={kb} style={s.in} textAlign="right" />
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()}><Text style={{ fontSize: 18 }}>→</Text></Pressable>
        <Text style={s.h1}>🆘 إعدادات الطوارئ</Text>
        <View style={{ width: 18 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        <View style={s.card}>
          <Text style={s.h2}>👨‍👩‍👦 أرقام الأهل — الأولوية الأولى</Text>
          <Text style={s.note}>يصلهم رابط موقعك المباشر وبيانات الرحلة عند الضغط على زر الطوارئ</Text>
          {Field({label: "الاسم (1)", v: f1.name, set: (t: string) => setF1({ ...f1, name: t }), ph: "مثلاً: أبي",})}
          {Field({label: "الرقم (1)", v: f1.phone, set: (t: string) => setF1({ ...f1, phone: t }), ph: "09xxxxxxxx", kb: "phone-pad",})}
          {Field({label: "الاسم (2)", v: f2.name, set: (t: string) => setF2({ ...f2, name: t }), ph: "مثلاً: أخي",})}
          {Field({label: "الرقم (2)", v: f2.phone, set: (t: string) => setF2({ ...f2, phone: t }), ph: "09xxxxxxxx", kb: "phone-pad",})}
        </View>
        <View style={s.card}>
          <Text style={s.h2}>🚨 رقم الطوارئ — ثانوي</Text>
          <Text style={s.note}>يُتصل به عند اختيار «الأهل + الطوارئ»</Text>
          {Field({label: "الرقم", v: em, set: setEm, ph: "112", kb: "phone-pad",})}
        </View>
        <Pressable onPress={save} disabled={busy} style={[s.btn, busy && { opacity: 0.6 }]}><Text style={s.btnT}>{busy ? 'جاري...' : 'حفظ'}</Text></Pressable>
      </ScrollView>
      {toast.node}
    </View>
  );
}
const s = StyleSheet.create({
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingTop: 44, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  h1: { fontSize: 16, fontWeight: '900' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, gap: 8 },
  h2: { fontSize: 14, fontWeight: '900', textAlign: 'right' },
  note: { fontSize: 11, color: '#64748b', textAlign: 'right' },
  lbl: { fontSize: 12, fontWeight: '800', textAlign: 'right' },
  in: { height: 44, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, backgroundColor: '#fff', fontSize: 14 },
  btn: { height: 48, borderRadius: 14, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  btnT: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
