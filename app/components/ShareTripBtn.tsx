import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { shareTrip } from '../utils/share';

// زر «مشاركة الرحلة»: رابط تتبّع مباشر يُرسل بواتساب أو رسالة
export default function ShareTripBtn({ service, refId }: { service: 'taxi' | 'taxi_shared' | 'cargo' | 'events' | 'contracts' | 'airport'; refId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (busy) return; setBusy(true); setErr(null);
    const e = await shareTrip(service, refId);
    setBusy(false); if (e) { setErr(e); setTimeout(() => setErr(null), 3000); }
  };
  return (
    <View style={{ flex: 1 }}>
      <Pressable onPress={go} style={{ height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: '#4F46E5', backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
        <Text style={{ color: '#4F46E5', fontWeight: '900', fontSize: 13 }}>{busy ? 'جاري...' : '📤 مشاركة الرحلة'}</Text>
      </Pressable>
      {!!err && <Text style={{ color: '#dc2626', fontSize: 11, textAlign: 'center', marginTop: 4 }}>{err}</Text>}
    </View>
  );
}
