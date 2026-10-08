import * as Location from 'expo-location';

export type MyLocationResult = { ll: [number, number] | null; real: boolean };

// يرجع الموقع الحقيقي فقط؛ لا يُستبدل الموقع المتعذر تحديده بإحداثيات مدينة ثابتة.
export async function getMyLocation(): Promise<MyLocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { ll: null, real: false };
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 1500 }).catch(() => null);
    const pos = last || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { ll: [pos.coords.latitude, pos.coords.longitude], real: true };
  } catch { return { ll: null, real: false }; }
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
