import { Redirect } from 'expo-router';
// الرابط القديم: لوحة المناسبات صارت ضمن «الطلبات»
export default function EventsRedirect() { return <Redirect href={'/work?tab=events' as any} />; }
