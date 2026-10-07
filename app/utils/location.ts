import * as Location from 'expo-location';
// موقع السائق الحالي؛ عند الرفض أو الفشل يُستخدم مركز دمشق
export const DEFAULT_LL: [number, number] = [33.5138, 36.2765];
export async function getMyLocation(): Promise<{ ll: [number, number]; real: boolean }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { ll: DEFAULT_LL, real: false };
    const last = await Location.getLastKnownPositionAsync();
    const pos = last || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { ll: [pos.coords.latitude, pos.coords.longitude], real: true };
  } catch { return { ll: DEFAULT_LL, real: false }; }
}
// موقع حالي فعلي (لإرسال موقع السائق أثناء فتح التطبيق)
export async function getFreshLocation(): Promise<[number, number] | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return [pos.coords.latitude, pos.coords.longitude];
  } catch { return null; }
}
