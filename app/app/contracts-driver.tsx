import { Redirect } from 'expo-router';
// الرابط القديم: لوحة العقود صارت ضمن «الطلبات»
export default function ContractsRedirect() { return <Redirect href={'/work?tab=contracts' as any} />; }
