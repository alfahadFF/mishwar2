import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Header, Tabs, Empty, Btn, ui, C } from '../components/DriverUI';
import WorkNav from '../components/WorkNav';
import SharedTripsDriver from '../components/SharedTripsDriver';
import CargoPanel from '../components/panels/CargoPanel';
import EventsPanel from '../components/panels/EventsPanel';
import ContractsPanel from '../components/panels/ContractsPanel';
import RentalPanel from '../components/panels/RentalPanel';
import AirportPanel from '../components/panels/AirportPanel';
import { useToast } from '../components/Toast';
import { useWorkProfile } from '../utils/useWorkProfile';
import { isWorkType, bookingTabs, TAB_NAME, WorkTab } from '../utils/work';

// «حجوزاتي»: المواعيد القادمة فقط، مع تذكير قبل 24 ساعة وقبل ساعة
export default function BookingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { tab: q } = useLocalSearchParams<{ tab?: string }>();
  const profile = useWorkProfile();
  const [pick, setPick] = useState<WorkTab | null>(null);

  const tabs = profile ? bookingTabs(profile) : [];
  const want = (pick || q) as WorkTab;
  const cur: WorkTab | undefined = tabs.includes(want) ? want : tabs[0];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={ui.page}>
      <Header title="حجوزاتي" onBack={back} />
      {profile === undefined ? <Empty icon="⏳" title="جاري التحميل" />
        : !isWorkType(profile) ? (
          <View style={{ padding: 16 }}>
            <Empty icon="🔒" title="هذه الشاشة لحسابات العمل" />
            <Btn label="رجوع" tone="ghost" onPress={back} />
          </View>
        ) : <>
          <WorkNav profile={profile} here="bookings" />
          {!cur ? <Empty icon="📅" title="لا توجد حجوزات" /> : <>
            {tabs.length > 1 && <Tabs value={cur} onChange={k => setPick(k as WorkTab)} tabs={tabs.map(k => ({ k, label: TAB_NAME[k] }))} />}
            <View style={{ flex: 1 }}>
              {cur === 'shared' && (
                <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 90 }}>
                  <SharedTripsDriver toast={m => toast.show(m)} noTrack
                    empty={<Empty icon="👥" title="لا توجد رحلات مشتركة قادمة" sub="الرحلات التي تنشرها من الخريطة تظهر هنا" />} />
                  <Text style={s.note}>يصلك تذكير بالموعد قبل 24 ساعة وقبل ساعة.</Text>
                </ScrollView>
              )}
              {cur === 'airport' && <AirportPanel key="airport" mode="bookings" embedded />}
              {cur === 'events' && <EventsPanel key="events" mode="bookings" embedded />}
              {cur === 'contracts' && <ContractsPanel key="contracts" mode="bookings" embedded />}
              {cur === 'cargo' && <CargoPanel key="cargo" mode="bookings" embedded />}
              {cur === 'rental' && <RentalPanel key="rental" mode="bookings" embedded />}
            </View>
          </>}
        </>}
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({ note: { fontSize: 11, color: C.mute, textAlign: 'center', marginTop: 12 } });
