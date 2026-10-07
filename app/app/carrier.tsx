import { Redirect } from 'expo-router';
// الرابط القديم: لوحة الناقل صارت ضمن «الطلبات»
export default function CarrierRedirect() { return <Redirect href={'/work?tab=cargo' as any} />; }
