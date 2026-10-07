import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';

type St = { work: boolean; verified?: boolean; verify_deadline?: string; license_expiry?: string; license_stop?: string; blocked?: string | null; negative?: boolean };
const d = (s?: string) => (s ? String(s).slice(0, 10) : '');

// تنبيه حالة حساب العمل في لوحات الطلبات: التحقق، الرخصة، الرصيد السالب
// (استدعاء my_work_status يرسل التذكيرات المستحقة أيضاً)
export default function WorkStatusBanner({ negative = true }: { negative?: boolean }) {
  const router = useRouter();
  const [st, setSt] = useState<St | null>(null);
  const [reject, setReject] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    supabase.rpc('my_work_status').then(({ data }) => setSt((data as St) || null));
    supabase.rpc('my_admin_flags').then(({ data }) => setReject((data as any)?.reject_reason || null));
  }, []));
  if (!st?.work) return null;

  let tone: 'err' | 'warn' = 'warn'; let msg = ''; let go: string | null = null;
  if (st.blocked === 'suspended') { tone = 'err'; msg = 'حسابك موقوف ولا يمكنك استقبال الطلبات. تواصل مع الدعم.'; }
  else if (st.blocked === 'verify') { tone = 'err'; msg = 'توقف استقبال الطلبات: انتهت مهلة التحقق من بياناتك (30 يوماً). تواصل مع الدعم لإكمال التحقق.'; }
  else if (st.blocked === 'license') { tone = 'err'; msg = 'توقف استقبال الطلبات: مضى أكثر من 3 أشهر على انتهاء الرخصة. حدّث بيانات الرخصة.'; go = '/work-register'; }
  else if (negative && st.negative) { tone = 'err'; msg = 'رصيدك سالب، اشحن الرصيد لمتابعة استقبال الطلبات.'; go = '/wallet'; }
  else if (st.license_expiry && new Date(st.license_expiry) < new Date()) { msg = `انتهت صلاحية الرخصة. حدّث بياناتها قبل ${d(st.license_stop)}، وبعدها يتوقف استقبال الطلبات.`; go = '/work-register'; }
  else if (!st.verified && reject) { tone = 'err'; msg = `لم يكتمل التحقق: ${reject}. عدّل بياناتك أو صورك قبل ${d(st.verify_deadline)}.`; go = '/work-register'; }
  else if (!st.verified) { msg = `حسابك بانتظار التحقق. يجب أن يكتمل قبل ${d(st.verify_deadline)}، وإلا يتوقف استقبال الطلبات.`; }
  else return null;

  return (
    <Pressable disabled={!go} onPress={() => go && router.push((go === '/work-register' ? ((st as any)?.type === 'business' ? '/office-register' : `/work-register?role=${roleOf()}`) : go) as any)}
      style={[s.box, tone === 'err' ? s.err : s.warn]}>
      <Text style={[s.t, { color: tone === 'err' ? '#991b1b' : '#92400e' }]}>{tone === 'err' ? '⛔ ' : '⏳ '}{msg}{go ? '  ←' : ''}</Text>
    </Pressable>
  );
  function roleOf() { return (st as any)?.type === 'transporter' ? 'carrier' : 'driver'; }
}

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 10, marginHorizontal: 12, marginTop: 8 },
  err: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  warn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  t: { fontSize: 12, fontWeight: '800', textAlign: 'right', lineHeight: 18 },
});
