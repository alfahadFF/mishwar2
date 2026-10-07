import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Header, Pill, Tabs, Empty, Btn, ui, C } from '../components/DriverUI';
import WorkStatusBanner from '../components/WorkStatusBanner';
import WorkNav from '../components/WorkNav';
import WalletSheet from '../components/WalletSheet';
import CargoPanel from '../components/panels/CargoPanel';
import EventsPanel from '../components/panels/EventsPanel';
import ContractsPanel from '../components/panels/ContractsPanel';
import RentalPanel from '../components/panels/RentalPanel';
import AirportPanel from '../components/panels/AirportPanel';
import { useWallet, money } from '../utils/wallet';
import { useWorkProfile } from '../utils/useWorkProfile';
import { isWorkType, requestTabs, TAB_NAME, WorkTab } from '../utils/work';

// «الطلبات»: شاشة واحدة لكل حسابات العمل، وتبويباتها حسب الاختصاص
export default function WorkScreen() {
  const router = useRouter();
  const { tab: q } = useLocalSearchParams<{ tab?: string }>();
  const profile = useWorkProfile();
  const { wallet, isFree } = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [pick, setPick] = useState<WorkTab | null>(null);

  const tabs = profile ? requestTabs(profile) : [];
  const want = (pick || q) as WorkTab;
  const cur: WorkTab | undefined = tabs.includes(want) ? want : tabs[0];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={ui.page}>
      <Header title="الطلبات" onBack={back} right={<>
        <Pill text={wallet ? `💳 ${money(wallet.balance)}` : '💳 —'} tone={Number(wallet?.balance) < 0 ? 'err' : 'mute'} onPress={() => setWalletOpen(true)} />
        {isFree && <Pill text={`مجاني · ${wallet?.free_days_left} يوم`} tone="ok" onPress={() => setWalletOpen(true)} />}
      </>} />
      {profile === undefined ? <Empty icon="⏳" title="جاري التحميل" />
        : !isWorkType(profile) ? (
          <View style={{ padding: 16 }}>
            <Empty icon="🔒" title="هذه الشاشة لحسابات العمل" sub="يمكنك التسجيل كسائق أو ناقل أو مكتب تأجير من «حسابي»" />
            <Btn label="إلى حسابي" onPress={() => router.replace('/account' as any)} />
          </View>
        ) : <>
          <WorkStatusBanner negative={false} />
          <WorkNav profile={profile} here="work" />
          {!cur ? (
            <Empty icon="📭" title="لا توجد خدمات مفعّلة للطلبات" sub="فعّل المناسبات أو العقود أو التأجير من «بيانات العمل» في «حسابي»" />
          ) : <>
            <Text style={s.title}>خدماتي</Text>
            {tabs.length > 1 && <Tabs value={cur} onChange={k => setPick(k as WorkTab)} tabs={tabs.map(k => ({ k, label: TAB_NAME[k] }))} />}
            <View style={{ flex: 1 }}>
              {cur === 'airport' && <AirportPanel key="airport" mode="requests" embedded />}
              {cur === 'events' && <EventsPanel key="events" mode="requests" embedded />}
              {cur === 'contracts' && <ContractsPanel key="contracts" mode="requests" embedded />}
              {cur === 'cargo' && <CargoPanel key="cargo" mode="requests" embedded />}
              {cur === 'rental' && <RentalPanel key="rental" mode="requests" embedded />}
            </View>
          </>}
        </>}
      <WalletSheet visible={walletOpen} wallet={wallet} onClose={() => setWalletOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 13, fontWeight: '900', color: C.txt, textAlign: 'right', paddingHorizontal: 14, paddingTop: 4 },
});
