import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../utils/supabase';
import { errMsg } from '../../utils/errors';
import { TYPE_NAME } from '../../utils/admin';
import { isTaxiDriver } from '../../utils/work';
import { Btn, C, ui } from '../DriverUI';

const TYPES = [
  { value: 'personal', label: 'حساب شخصي', route: '/' },
  { value: 'driver', label: 'سائق تكسي', route: '/driver' },
  { value: 'transporter', label: 'ناقل', route: '/work' },
  { value: 'business', label: 'مكتب تأجير', route: '/work' },
] as const;

export default function AdminTestMode() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<string | null>(null);
  const [workProfile, setWorkProfile] = useState<any>(null);
  const [travel, setTravel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [busyTravel, setBusyTravel] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountResult, workResult] = await Promise.all([
        supabase.rpc('my_account'),
        supabase.rpc('my_work_profile'),
      ]);
      if (accountResult.error) throw accountResult.error;
      setAccountType((accountResult.data as any)?.type || null);
      const profile = workResult.error ? null : workResult.data || null;
      setWorkProfile(profile);
      setTravel(!!(profile as any)?.travel);
    } catch (error) {
      setMessage(errMsg(error, 'تعذر تحميل نوع الحساب'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const changeType = async (nextType: string) => {
    if (nextType === accountType || busyType) return;
    setBusyType(nextType);
    setMessage('');
    try {
      const { error } = await supabase.rpc('admin_test_set_my_account_type', { p_type: nextType });
      if (error) throw error;
      setAccountType(nextType);
      setMessage(`تم تغيير نوع حسابك إلى «${TYPE_NAME[nextType] || nextType}» للاختبار.`);
      const route = nextType === 'driver'
        ? (isTaxiDriver({ ...workProfile, type: nextType }) ? '/driver' : '/work')
        : TYPES.find(x => x.value === nextType)?.route || '/';
      router.replace(route as any);
    } catch (error) {
      setMessage(errMsg(error, 'تعذر تغيير نوع الحساب'));
    } finally {
      setBusyType(null);
    }
  };

  const confirmType = (nextType: string, label: string) => {
    Alert.alert(
      'تغيير نوع الحساب للاختبار',
      `سيُغيّر هذا نوع حسابك الحالي فقط إلى «${label}». لن تُحذف بيانات العمل ولن يتغير نوع حساب أي مستخدم آخر.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تغيير', onPress: () => { void changeType(nextType); } },
      ],
    );
  };

  const setTravelService = async (enabled: boolean) => {
    if (busyTravel) return;
    setBusyTravel(true);
    setMessage('');
    try {
      const { error } = await supabase.rpc('set_travel_service', { p_on: enabled });
      if (error) throw error;
      setTravel(enabled);
      setMessage(enabled ? 'تم تفعيل خدمة السفريات.' : 'تم إيقاف خدمة السفريات؛ بقيت بياناتك محفوظة.');
      const route = enabled ? '/travel-provider' : isTaxiDriver(workProfile) ? '/driver' : '/work';
      router.replace(route as any);
    } catch (error) {
      setMessage(errMsg(error, 'تعذر تغيير خدمة السفريات'));
    } finally {
      setBusyTravel(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }}>
      <View style={ui.card}>
        <Text style={{ fontSize: 16, fontWeight: '900', color: C.txt, textAlign: 'right' }}>🧪 أدوات اختبار حسابي</Text>
        <Text style={{ color: C.mute, textAlign: 'right', lineHeight: 20, marginTop: 8 }}>
          هذه الأدوات للأدمن الحالي فقط: تغيّر نوع حسابك أنت ولا تسمح بتعديل حساب مستخدم آخر. لا تحذف بيانات المركبة أو العمل، وتُبقي صلاحية الإدارة كما هي.
        </Text>
        <Text style={{ color: C.txt, textAlign: 'right', fontWeight: '800', marginTop: 10 }}>
          النوع الحالي: {loading ? 'جارٍ التحميل…' : TYPE_NAME[accountType || ''] || accountType || 'غير معروف'}
        </Text>
        {!!message && <Text style={{ color: message.startsWith('تعذر') ? C.err : C.ok, textAlign: 'right', fontWeight: '800', marginTop: 8 }}>{message}</Text>}
      </View>

      <View style={ui.card}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: C.txt, textAlign: 'right', marginBottom: 10 }}>تبديل نوع الحساب</Text>
        {TYPES.map(option => (
          <View key={option.value} style={{ marginTop: 8 }}>
            <Btn
              label={accountType === option.value ? `${option.label} ✓ (الحالي)` : option.label}
              tone={accountType === option.value ? 'ok' : 'brand'}
              loading={busyType === option.value}
              disabled={loading || busyType !== null || accountType === option.value}
              onPress={() => confirmType(option.value, option.label)}
            />
          </View>
        ))}
      </View>

      <View style={ui.card}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: C.txt, textAlign: 'right' }}>خدمة السفريات</Text>
        <Text style={{ color: C.mute, textAlign: 'right', lineHeight: 19, marginTop: 6, marginBottom: 10 }}>
          شغّلها أو أوقفها على حسابك للاختبار دون حذف بيانات المركبة. متاحة عندما يكون نوع الحساب سائقاً أو مكتباً.
        </Text>
        <Btn
          label={travel ? 'إيقاف خدمة السفريات على حسابي' : 'تفعيل خدمة السفريات على حسابي'}
          tone={travel ? 'ghost' : 'brand'}
          loading={busyTravel}
          disabled={loading || busyTravel || !['driver', 'business'].includes(accountType || '')}
          onPress={() => { void setTravelService(!travel); }}
        />
      </View>
    </ScrollView>
  );
}
