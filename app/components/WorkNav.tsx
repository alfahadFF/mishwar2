import React from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { isTaxiDriver, hasRental, hasTravel, requestTabs } from '../utils/work';
import { C } from './DriverUI';

// أزرار التنقل في شاشات حساب العمل: يظهر منها فقط ما يخص الحساب
type Here = 'map' | 'work' | 'bookings';
export default function WorkNav({ profile, here }: { profile: any; here: Here }) {
  const router = useRouter();
  if (!profile) return null;
  const items = [
    isTaxiDriver(profile) && here !== 'map' && { k: 'map', t: '🗺️ الخريطة', go: '/driver' },
    requestTabs(profile).length > 0 && here !== 'work' && { k: 'work', t: '📋 الطلبات', go: '/work' },
    here !== 'bookings' && { k: 'bookings', t: '📅 حجوزاتي', go: '/bookings' },
    hasRental(profile) && { k: 'cars', t: '🔑 مركباتي', go: '/rental-provider?only=cars' },
    hasTravel(profile) && { k: 'travel', t: '🧭 سفرياتي', go: '/travel-provider' },
    { k: 'order', t: '🧭 اطلب خدمة', go: '/' },
  ].filter(Boolean) as { k: string; t: string; go: string }[];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} style={{ flexGrow: 0 }}>
      {items.map(x => (
        <Pressable key={x.k} onPress={() => router.push(x.go as any)} style={[s.btn, x.k === 'order' && s.order]}>
          <Text style={[s.t, x.k === 'order' && { color: '#fff' }]}>{x.t}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row-reverse', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  btn: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  order: { backgroundColor: '#FF6B00', borderColor: '#FF6B00' },
  t: { fontSize: 12, fontWeight: '800', color: C.txt },
});
