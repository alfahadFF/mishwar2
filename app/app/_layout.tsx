import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import NotifyListener from '../components/NotifyListener';
import SosButton from '../components/SosButton';
import LivePinger from '../components/LivePinger';
import DuesSettler from '../components/DuesSettler';
import RatingPrompt from '../components/RatingPrompt';
import PushRegistrar from '../components/PushRegistrar';
import GuestGate from '../components/GuestGate';
import '../utils/sosTask';
export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="taxi" />
        <Stack.Screen name="travel" />
        <Stack.Screen name="travel-provider" />
        <Stack.Screen name="transport" />
        <Stack.Screen name="events" />
        <Stack.Screen name="my-orders" />
        <Stack.Screen name="carrier" />
        <Stack.Screen name="events-driver" />
        <Stack.Screen name="contracts" />
        <Stack.Screen name="airport" />
        <Stack.Screen name="contracts-driver" />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="admin-wallet" />
        <Stack.Screen name="sos-settings" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="account" />
        <Stack.Screen name="work-register" />
        <Stack.Screen name="office-register" />
        <Stack.Screen name="work" />
        <Stack.Screen name="bookings" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="terms" />
      </Stack>
      <NotifyListener />
      <LivePinger />
      <DuesSettler />
      <RatingPrompt />
      <PushRegistrar />
      <SosButton />
      <GuestGate />
    </>
  );
}
