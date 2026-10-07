import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { supabase } from '../../utils/supabase';
import { errMsg } from '../../utils/errors';
import { fmtDateTime } from '../../utils/events';
import { useToast } from '../Toast';
import { Pill, Tabs, Empty, Row, Btn, Sheet, CallBtn, ui, C } from '../DriverUI';

// إلغاءات سائقي التكسي: الموقوفون تلقائياً بعد 10 إلغاءات + كل من لديه إلغاءات
export default function AdminCancels({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState('susp');
  const [list, setList] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any>(null);
  const [hist, setHist] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (t = tab) => {
    setList(null);
    const { data, error } = await supabase.rpc('admin_taxi_drivers', { p_only_suspended: t === 'susp' });
    if (error) toast.show(errMsg(error), 'err');
    setList((data || []) as any[]);
  };
  useEffect(() => { load(tab); }, [tab]);

  const show = async (d: any) => {
    setOpen(d); setHist(null);
    const { data } = await supabase.rpc('admin_driver_cancels', { p_driver: d.driver_id });
    setHist((data || []) as any[]);
  };
  const lift = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_lift_taxi_suspension', { p_driver: open.driver_id });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show('تم رفع الإيقاف وتصفير العدّاد');
    setOpen(null); load(); onChange();
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs tabs={[{ k: 'susp', label: 'موقوفون' }, { k: 'all', label: 'الكل' }]} value={tab} onChange={setTab} />
      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 4, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!list ? <Empty icon="⏳" title="جاري التحميل" /> : list.length === 0 ? <Empty icon="✅" title={tab === 'susp' ? 'لا يوجد سائقون موقوفون' : 'لا توجد إلغاءات'} /> : list.map(d => (
          <Pressable key={d.driver_id} onPress={() => show(d)} style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{d.name || d.phone}</Text>
              <Pill text={d.suspended ? 'موقوف' : `${d.count} إلغاء`} tone={d.suspended ? 'err' : d.count >= 5 ? 'warn' : 'mute'} />
            </View>
            <Text style={ui.sub}>{d.phone}{d.suspended_at ? ` • أوقف ${fmtDateTime(d.suspended_at)}` : ''}</Text>
            {!!(d.last_reasons || []).length && <Text style={ui.sub} numberOfLines={1}>آخر الأسباب: {(d.last_reasons || []).filter(Boolean).join('، ')}</Text>}
          </Pressable>
        ))}
      </ScrollView>

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open ? (open.name || open.phone) : ''}>
        {open && <ScrollView>
          <View style={[ui.cardTop, { marginBottom: 6 }]}>
            <Text style={ui.sub}>{open.phone} • {open.count} إلغاء محتسب</Text>
            <CallBtn phone={open.phone} />
          </View>
          {!hist ? <Empty icon="⏳" title="جاري التحميل" /> : hist.length === 0 ? <Empty icon="📭" title="لا يوجد سجل" /> : hist.map(h => (
            <View key={h.id} style={h.voided ? { opacity: 0.45 } : null}>
              <Row k={fmtDateTime(h.created_at)} v={`${h.reason || '—'}${h.note ? ` • ${h.note}` : ''}${h.voided ? ' (ملغى)' : ''}`} />
            </View>
          ))}
          {open.suspended && <View style={ui.btns}><Btn label="رفع الإيقاف" tone="ok" loading={busy} onPress={lift} /></View>}
          {open.suspended && <Text style={ui.note}>رفع الإيقاف يصفّر عدّاد الإلغاءات للسائق.</Text>}
        </ScrollView>}
        {toast.node}
      </Sheet>
      {!open && toast.node}
    </View>
  );
}
