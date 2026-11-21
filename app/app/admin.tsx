import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../utils/supabase';
import { ADMIN_TEST_USER_ID } from '../utils/admin';
import { Header, Empty, ui, C } from '../components/DriverUI';
import AdminNotifs from '../components/admin/AdminNotifs';
import AdminVerify from '../components/admin/AdminVerify';
import AdminCancels from '../components/admin/AdminCancels';
import AdminUsers from '../components/admin/AdminUsers';
import AdminSettings from '../components/admin/AdminSettings';
import AdminTestMode from '../components/admin/AdminTestMode';

// ⚙️ الإدارة: تظهر لحساب الأدمن فقط
const SECTIONS = [
  { k: 'notifs', icon: '🔔', t: 'إشعارات الإدارة', n: 'unread' },
  { k: 'verify', icon: '🪪', t: 'التحقق من حسابات العمل', n: 'verify' },
  { k: 'cancels', icon: '🚫', t: 'إلغاءات السائقين', n: 'taxi_suspended' },
  { k: 'users', icon: '👤', t: 'البحث عن مستخدم', n: 'suspended' },
  { k: 'wallet', icon: '💳', t: 'المحفظة وبطاقات الشحن' },
  { k: 'settings', icon: '🛠️', t: 'الإعدادات' },
  { k: 'test', icon: '🧪', t: 'تبديل نوع حسابي للاختبار' },
] as const;

export default function AdminScreen() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [home, setHome] = useState<any>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [testAllowed, setTestAllowed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const [adminResult, userResult] = await Promise.all([
      supabase.rpc('admin_home'),
      supabase.auth.getUser(),
    ]);
    setAllowed(!adminResult.error);
    setHome(adminResult.data || null);
    setTestAllowed(!userResult.error && userResult.data.user?.id === ADMIN_TEST_USER_ID);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visibleSections = testAllowed ? SECTIONS : SECTIONS.filter(x => x.k !== 'test');
  const sec = visibleSections.find(x => x.k === tab);
  const open = (k: string) => {
    if (k === 'test' && !testAllowed) return;
    if (k === 'wallet') router.push('/admin-wallet' as any);
    else router.setParams({ tab: k } as any);
  };
  const back = () => (sec ? router.setParams({ tab: '' } as any) : router.back());

  if (allowed === false) return (
    <View style={ui.page}><Header title="الإدارة" onBack={() => router.back()} /><Empty icon="🔒" title="هذه الصفحة للإدارة فقط" /></View>
  );
  if (tab === 'test' && testAllowed !== true) return (
    <View style={ui.page}>
      <Header title="أدوات اختبار الحساب" onBack={() => router.setParams({ tab: '' } as any)} />
      <Empty icon={testAllowed === null ? '⏳' : '🔒'} title={testAllowed === null ? 'جارٍ التحقق من صلاحية الاختبار' : 'هذه الأداة مخصصة لحساب الاختبار المحدد فقط'} />
    </View>
  );
  return (
    <View style={ui.page}>
      <Header title={sec ? sec.t : '⚙️ الإدارة'} onBack={back} />
      {!sec ? (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }}>
          {visibleSections.map(x => {
            const n = 'n' in x ? Number(home?.[x.n] || 0) : 0;
            return (
              <Pressable key={x.k} onPress={() => open(x.k)} style={[ui.card, s.row]}>
                <Text style={{ fontSize: 24 }}>{x.icon}</Text>
                <Text style={s.t}>{x.t}</Text>
                {n > 0 && <View style={s.badge}><Text style={s.badgeT}>{n}</Text></View>}
                <Text style={{ color: C.mute }}>←</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : tab === 'notifs' ? <AdminNotifs onOpen={open} onSeen={load} />
        : tab === 'verify' ? <AdminVerify onChange={load} />
        : tab === 'cancels' ? <AdminCancels onChange={load} />
        : tab === 'users' ? <AdminUsers onChange={load} />
        : tab === 'test' ? <AdminTestMode />
        : <AdminSettings />}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  t: { flex: 1, fontSize: 15, fontWeight: '800', color: C.txt, textAlign: 'right' },
  badge: { backgroundColor: '#dc2626', borderRadius: 12, minWidth: 24, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' },
  badgeT: { color: '#fff', fontWeight: '900', fontSize: 12 },
});
