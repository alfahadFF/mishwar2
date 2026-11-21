import { View, Text, Pressable, ScrollView, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../components/Toast';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabase';
import { workHomeOf } from '../utils/work';
import { openAppDownloadUpdates } from '../utils/support';

const ORANGE = '#FF6B00';
let routedOnce = false;
const DARK = '#1A1A2E';

export default function HomeScreen() {
  const router = useRouter();
  const { stayHome } = useLocalSearchParams<{ stayHome?: string }>();
  const stayHomeRef = useRef(stayHome);
  stayHomeRef.current = stayHome;
  const insets = useSafeAreaInsets();

  const toast = useToast();
  // عدد الإشعارات غير المقروءة على الجرس
  const [unread, setUnread] = useState(0);
  const [authed, setAuthed] = useState<boolean | null>(null);
  // نوع عمل بدأ تسجيله ولم يكمل نموذجه
  const [pendingRole, setPendingRole] = useState<null | 'driver' | 'travel' | 'carrier' | 'office'>(null);
  // إيقاف الحساب من الإدارة
  const [susp, setSusp] = useState<string | null>(null);
  const countUnread = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    setAuthed(!!u.user);
    if (!u.user) { setPendingRole(null); setSusp(null); return setUnread(0); }
    supabase.rpc('my_admin_flags').then(({ data }) => setSusp((data as any)?.suspended ? (data as any)?.suspend_reason || '—' : null));
    supabase.rpc('my_account').then(({ data }) => {
      const type = (data as any)?.type;
      setPendingRole(type === 'personal' ? (data as any)?.work_role || null : null);
      // حساب العمل يفتح على شاشة شغله عند تشغيل التطبيق (مرة واحدة، فزر «اطلب خدمة» يبقى في الرئيسية)
      if (!routedOnce) {
        routedOnce = true;
        if (['driver', 'transporter', 'business'].includes(type) && stayHomeRef.current !== '1')
          supabase.rpc('my_work_profile').then(({ data: p }) => { if (p) router.replace(workHomeOf(p) as any); });
      }
    });
    const { count } = await supabase.from('user_notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', u.user.id).is('read_at', null);
    setUnread(count || 0);
  }, []);
  useFocusEffect(useCallback(() => { countUnread(); }, [countUnread]));
  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    const start = (id: string) => {
      if (ch) supabase.removeChannel(ch);
      ch = supabase.channel(`bell_${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${id}` }, () => setUnread(n => n + 1))
        .subscribe();
    };
    supabase.auth.getUser().then(({ data }) => { if (data.user) start(data.user.id); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) { setAuthed(true); start(session.user.id); countUnread(); } else { setAuthed(false); if (ch) supabase.removeChannel(ch); ch = null; setUnread(0); }
    });
    return () => { sub.subscription.unsubscribe(); if (ch) supabase.removeChannel(ch); };
  }, []);
  const ROUTES: Record<string, string> = { 'تكسي': '/taxi', 'سفريات': '/travel', 'نقل': '/transport', 'مناسبات': '/events', 'عقود': '/contracts', 'مطار': '/airport', 'تأجير': '/rental' };
  const handleService = (name: string) => router.push(ROUTES[name] as any);

  return (
    <View style={s.container}>
      {/* Top Bar */}
      <View style={[s.topbar, { height: 56 + insets.top, paddingTop: insets.top, paddingLeft: 88 + insets.left, paddingRight: 16 + insets.right }]}>
        <View style={s.logoRow}>
          <Image source={require('../assets/icon.png')} style={s.logoIcon} />
          <Text style={s.logoTitle}>مشوار</Text>
        </View>
        <View style={s.topActions}>
          <Pressable onPress={() => router.push('/notifications' as any)} style={s.iconBtn} hitSlop={6}>
            <Text>🔔</Text>
            {unread > 0 && <View style={s.bellBadge}><Text style={s.bellBadgeT}>{unread > 99 ? '99+' : unread}</Text></View>}
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {!!pendingRole && (
          <View style={s.pendCard}>
            <Text style={s.pendT}>{pendingRole === 'travel' ? '🧭 أكمل تسجيلك كسائق سفريات' : pendingRole === 'driver' ? '🚕 أكمل تسجيلك كسائق' : pendingRole === 'carrier' ? '🚚 أكمل تسجيلك كناقل' : '🔑 أكمل تسجيل مكتب التأجير'}</Text>
            <Text style={s.pendD}>{pendingRole === 'office' ? 'بقي إدخال بيانات المكتب لتبدأ بإضافة مركباتك.' : 'بقي إدخال بيانات المركبة والرخصة لتبدأ باستقبال الطلبات.'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 10 }}>
              <Pressable style={s.pendBtn} onPress={() => router.push((pendingRole === 'office' ? '/office-register' : `/work-register?role=${pendingRole}`) as any)}><Text style={s.pendBtnT}>أكمل التسجيل ←</Text></Pressable>
              <Pressable style={s.pendGhost} onPress={() => setPendingRole(null)}><Text style={s.pendGhostT}>لاحقاً</Text></Pressable>
            </View>
          </View>
        )}

        {!!susp && (
          <View style={{ margin: 16, marginBottom: 0, backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 14, padding: 12 }}>
            <Text style={{ color: '#991b1b', fontWeight: '900', textAlign: 'right' }}>⛔ حسابك موقوف، تواصل مع الدعم</Text>
            <Text style={{ color: '#991b1b', textAlign: 'right', marginTop: 4, fontSize: 12 }}>السبب: {susp}</Text>
          </View>
        )}

        {/* Hero */}
        <View style={s.hero}>
          <View style={s.badge}><Text style={s.badgeText}>⚡ متاح الآن في مدينتك</Text></View>
          <Text style={s.heroTitle}>كل خدمات النقل{'\n'}في مكان واحد</Text>
          <Text style={s.heroDesc}>تكسي، سفريات، نقل بضائع، مناسبات وعقود — مقدمو خدمة موثوقون وأسعار واضحة</Text>
        </View>

        {/* Services */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>اختر خدمتك</Text>
            <Text style={s.sectionCount}>7 خدمات</Text>
          </View>
          <Pressable style={s.taxiCta} onPress={() => handleService('تكسي')} accessibilityRole="button" accessibilityLabel="اطلب تكسي الآن">
            <View style={s.taxiCtaBadge}><Text style={s.taxiCtaBadgeText}>الأكثر طلباً</Text></View>
            <View style={s.taxiCtaMain}>
              <View style={s.taxiCtaIcon}><Text style={{fontSize:28}}>🚕</Text></View>
              <View style={{flex:1}}>
                <Text style={s.taxiCtaTitle}>اطلب تكسي الآن</Text>
                <Text style={s.taxiCtaDesc}>توصيل فوري • اختر الانطلاق والوصول بسهولة</Text>
              </View>
            </View>
            <View style={s.taxiCtaAction}><Text style={s.taxiCtaActionText}>ابدأ الطلب  ←</Text></View>
          </Pressable>
          <View style={s.grid}>

            <Pressable style={[s.card, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]} onPress={() => handleService('سفريات')}>
              <View style={[s.cardIcon, { backgroundColor: '#CCFBF1' }]}><Text style={s.cardEmoji}>🧭</Text></View>
              <Text style={s.cardTitle}>سفريات</Text>
              <Text style={s.cardDesc} numberOfLines={2}>رحلات منشورة وعروض أجرة خاصة برحلتك</Text>
              <Text style={s.cardAction}>افتح الخدمة  ←</Text>
            </Pressable>

            <Pressable style={s.card} onPress={() => handleService('نقل')}>
              <View style={[s.cardIcon, { backgroundColor: '#EEF2FF' }]}><Text style={s.cardEmoji}>🚚</Text></View>
              <Text style={s.cardTitle}>نقل</Text>
              <Text style={s.cardDesc} numberOfLines={2}>نقل بضائع وعفش بأمان</Text>
              <Text style={s.cardAction}>افتح الخدمة  ←</Text>
            </Pressable>

            <Pressable style={s.card} onPress={() => handleService('مناسبات')}>
              <View style={[s.cardIcon, { backgroundColor: '#FEF3C7' }]}><Text style={s.cardEmoji}>🎉</Text></View>
              <Text style={s.cardTitle}>مناسبات</Text>
              <Text style={s.cardDesc} numberOfLines={2}>حجوزات أعراس ومؤتمرات</Text>
              <Text style={s.cardAction}>افتح الخدمة  ←</Text>
            </Pressable>

            <Pressable style={s.card} onPress={() => handleService('عقود')}>
              <View style={[s.cardIcon, { backgroundColor: '#ECFDF5' }]}><Text style={s.cardEmoji}>📋</Text></View>
              <Text style={s.cardTitle}>عقود</Text>
              <Text style={s.cardDesc} numberOfLines={2}>عقود شهرية للشركات</Text>
              <Text style={s.cardAction}>افتح الخدمة  ←</Text>
            </Pressable>

            <Pressable style={s.card} onPress={() => handleService('مطار')}>
              <View style={[s.cardIcon, { backgroundColor: '#E0F2FE' }]}><Text style={s.cardEmoji}>✈️</Text></View>
              <Text style={s.cardTitle}>المطار</Text>
              <Text style={s.cardDesc} numberOfLines={2}>استقبال المسافرين ووداعهم</Text>
              <Text style={s.cardAction}>افتح الخدمة  ←</Text>
            </Pressable>

            <Pressable style={s.card} onPress={() => handleService('تأجير')}>
              <View style={[s.cardIcon, { backgroundColor: '#EEF2FF' }]}><Text style={s.cardEmoji}>🔑</Text></View>
              <Text style={s.cardTitle}>تأجير سيارات</Text>
              <Text style={s.cardDesc} numberOfLines={2}>بالساعة واليوم والأسبوع والشهر</Text>
              <Text style={s.cardAction}>افتح الخدمة  ←</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={s.updatesLink} onPress={openAppDownloadUpdates} accessibilityRole="link" accessibilityLabel="تنزيل التطبيق والبحث عن التحديثات على تيليغرام">
          <View style={s.updatesLinkIcon}><Text style={{fontSize:20}}>🔄</Text></View>
          <View style={{flex:1}}>
            <Text style={s.updatesLinkTitle}>تنزيل التطبيق والتحديثات</Text>
            <Text style={s.updatesLinkSub}>ابحث عن أحدث نسخة على تيليغرام</Text>
          </View>
          <Text style={{fontSize:18,color:'#4F46E5',fontWeight:'900'}}>↗</Text>
        </Pressable>

        {/* Auth Card */}
        {authed === false && <View style={s.authCard}>
          <View style={s.authHead}>
            <View style={s.authIcon}><Text style={{ color: '#fff', fontSize: 18 }}>👤</Text></View>
            <View>
              <Text style={s.authTitle}>ابدأ رحلتك الآن</Text>
              <Text style={s.authSub}>سجّل الدخول لطلب الخدمات والاستفادة منها</Text>
            </View>
          </View>

          <Pressable style={s.btnPrimary} onPress={() => router.push('/login' as any)}>
            <Text style={s.btnPrimaryText}>تسجيل الدخول / إنشاء حساب  ←</Text>
          </Pressable>

        </View>}

      </ScrollView>
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  topbar: { height: 56, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoIcon: { width: 40, height: 40, borderRadius: 12 },
  logoIconText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  logoTitle: { fontWeight: '900', fontSize: 20, color: DARK, textAlign: 'right' },
  logoSub: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
  topActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444', paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  pendCard: { backgroundColor: '#fff7ed', borderWidth: 1.5, borderColor: '#fed7aa', borderRadius: 16, padding: 14, marginBottom: 14 },
  pendT: { fontSize: 15, fontWeight: '900', color: '#9a3412', textAlign: 'right' },
  pendD: { fontSize: 12, color: '#9a3412', textAlign: 'right', marginTop: 4 },
  pendBtn: { backgroundColor: '#FF6B00', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9 },
  pendBtnT: { color: '#fff', fontWeight: '900', fontSize: 13 },
  pendGhost: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fed7aa' },
  pendGhostT: { color: '#9a3412', fontWeight: '800', fontSize: 13 },
  bellBadgeT: { color: '#fff', fontSize: 10, fontWeight: '900' },
  scroll: { paddingBottom: 16 },
  hero: { margin: 16, backgroundColor: DARK, borderRadius: 20, padding: 20, overflow: 'hidden' },
  badge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,.12)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginBottom: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900', lineHeight: 28, textAlign: 'right' },
  heroDesc: { color: 'rgba(255,255,255,.75)', fontSize: 13, lineHeight: 18, marginTop: 6, textAlign: 'right' },
  stats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  statNum: { color: '#fff', fontWeight: '800', fontSize: 16 },
  statLabel: { color: 'rgba(255,255,255,.7)', fontSize: 10, marginTop: 2 },
  section: { paddingHorizontal: 16, marginTop: 6 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontWeight: '800', fontSize: 15, color: DARK },
  sectionCount: { color: ORANGE, fontWeight: '700', fontSize: 11 },
  taxiCta: { minHeight: 142, backgroundColor: '#FFF7ED', borderColor: '#FDBA74', borderWidth: 1.5, borderRadius: 20, padding: 14, marginBottom: 14, overflow: 'hidden' },
  taxiCtaBadge: { position: 'absolute', top: 0, right: 0, borderBottomLeftRadius: 12, backgroundColor: '#EA580C', paddingHorizontal: 12, paddingVertical: 6 },
  taxiCtaBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  taxiCtaMain: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginTop: 22 },
  taxiCtaIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFEDD5' },
  taxiCtaTitle: { color: '#7C2D12', fontSize: 19, lineHeight: 26, fontWeight: '900', textAlign: 'right' },
  taxiCtaDesc: { color: '#9A3412', fontSize: 11, lineHeight: 16, marginTop: 2, textAlign: 'right' },
  taxiCtaAction: { alignSelf: 'flex-start', marginTop: 11, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10, backgroundColor: '#EA580C' },
  taxiCtaActionText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: '#E5E7EB', minHeight: 132, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardAction: { color: '#4F46E5', fontSize: 10, fontWeight: '900', textAlign: 'left', marginTop: 8 },
  cardTaxi: { backgroundColor: ORANGE, borderColor: ORANGE },
  cardIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  cardIconLight: { backgroundColor: 'rgba(255,255,255,.18)' },
  cardEmoji: { fontSize: 18 },
  cardTitle: { fontWeight: '800', fontSize: 13, color: DARK, textAlign: 'right' },
  cardTitleWhite: { color: '#fff' },
  cardDesc: { fontSize: 10, color: '#6B7280', marginTop: 3, textAlign: 'right', lineHeight: 13 },
  cardDescWhite: { color: 'rgba(255,255,255,.85)' },
  cardBadgeOrange: { position: 'absolute', top: 10, right: 10, backgroundColor: '#FF6B00', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  cardBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  updatesLink: { marginHorizontal: 16, marginTop: 12, padding: 12, minHeight: 68, borderRadius: 14, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  updatesLinkIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  updatesLinkTitle: { color: '#312e81', fontSize: 12, fontWeight: '900', textAlign: 'right' },
  updatesLinkSub: { color: '#4338ca', fontSize: 10, marginTop: 3, textAlign: 'right' },
  authCard: { margin: 16, backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E5E7EB' },
  authHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  authIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center' },
  authTitle: { fontWeight: '800', fontSize: 14, color: DARK, textAlign: 'right' },
  authSub: { fontSize: 11, color: '#6B7280', marginTop: 2, textAlign: 'right' },
  btnPrimary: { height: 48, borderRadius: 14, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
