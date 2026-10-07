import { useLocalSearchParams } from 'expo-router';
import RentalPanel from '../components/panels/RentalPanel';
// ?only=cars ← «مركباتي» فقط (للمكتب والسائق المؤجّر)، وبدونه الشاشة الكاملة للحساب الشخصي
export default function RentalProviderScreen() {
  const { only } = useLocalSearchParams<{ only?: string }>();
  return <RentalPanel mode={only === 'cars' ? 'cars' : 'all'} />;
}
