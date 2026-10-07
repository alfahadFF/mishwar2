import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, TextInput, RefreshControl } from 'react-native';
import { supabase } from '../../utils/supabase';
import { errMsg } from '../../utils/errors';
import { TYPE_NAME, REJECT_REASONS, kindName, catName, fuelName, cargoName, docUrl, fmtD } from '../../utils/admin';
import { useToast } from '../Toast';
import { Pill, Empty, Row, Btn, Sheet, ui, C } from '../DriverUI';

// التحقق من حسابات العمل: الأقدم أولاً، مع الأيام الباقية من مهلة الشهر
function Photo({ label, uri }: { label: string; uri?: string | null }) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => { docUrl(uri).then(setU); }, [uri]);
  return (
    <View style={{ width: '48%', marginBottom: 8 }}>
      <Text style={[ui.sub, { marginBottom: 4 }]}>{label}</Text>
      {u ? <Image source={{ uri: u }} style={{ width: '100%', height: 130, borderRadius: 10, backgroundColor: '#f1f5f9' }} resizeMode="cover" />
         : <View style={{ height: 130, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}><Text style={ui.sub}>لا توجد صورة</Text></View>}
    </View>
  );
}

export default function AdminVerify({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => { const { data } = await supabase.rpc('admin_verify_queue'); setList((data || []) as any[]); };
  useEffect(() => { load(); }, []);

  const decide = async (approve: boolean) => {
    if (!approve && !reason.trim()) return toast.show('اختر السبب أو اكتبه', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('admin_verify_decide', { p_user: open.id, p_approve: approve, p_reason: approve ? null : reason.trim() });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show(approve ? 'تم التحقق ✓' : 'تم إرسال سبب الرفض');
    setOpen(null); setRejecting(false); setReason(''); load(); onChange();
  };

  const o = open;
  const isOffice = o?.type === 'business';
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!list ? <Empty icon="⏳" title="جاري التحميل" /> : list.length === 0 ? <Empty icon="✅" title="لا توجد حسابات بانتظار التحقق" /> : list.map(r => (
          <Pressable key={r.id} onPress={() => { setOpen(r); setRejecting(false); setReason(''); }} style={ui.card}>
            <View style={ui.cardTop}>
              <Text style={ui.h}>{r.office_name || r.full_name || r.wallet_id}</Text>
              <Pill text={r.days_left > 0 ? `باقي ${r.days_left} يوم` : 'انتهت المهلة'} tone={r.days_left <= 7 ? 'err' : 'warn'} />
            </View>
            <Text style={ui.sub}>{TYPE_NAME[r.type] || r.type} • {r.phone} • سُجّل {fmtD(r.registered_at)}</Text>
            {!!r.reject_reason && <Text style={[ui.sub, { color: C.err }]}>رُفض سابقاً: {r.reject_reason}</Text>}
          </Pressable>
        ))}
      </ScrollView>

      <Sheet visible={!!o} onClose={() => setOpen(null)} title={o ? (o.office_name || o.full_name || o.wallet_id) : ''}>
        {o && <ScrollView keyboardShouldPersistTaps="handled">
          <Row k="النوع" v={TYPE_NAME[o.type] || o.type} />
          <Row k="الهاتف" v={o.phone} />
          <Row k="المعرّف" v={o.wallet_id} />
          <Row k="المهلة" v={o.days_left > 0 ? `باقي ${o.days_left} يوم` : 'انتهت'} />
          {isOffice ? <>
            <Row k="المكتب" v={o.office_name} /><Row k="المسؤول" v={o.manager} /><Row k="المدينة" v={o.city} /><Row k="السجل التجاري" v={o.cr_number} />
          </> : <>
            <Row k="الاسم" v={o.full_name} />
            <Row k="المركبة" v={[kindName(o.kind) || cargoName(o.cargo_class), o.model, o.year, o.color].filter(Boolean).join(' • ')} />
            {!!o.category && <Row k="الفئة" v={catName(o.category) || kindName(o.category)} />}
            <Row k="الوقود" v={[fuelName(o.fuel), o.engine_cc ? `${o.engine_cc} CC` : null].filter(Boolean).join(' • ') || '—'} />
            <Row k="اللوحة" v={o.plate} /><Row k="المالك" v={o.owner} />
            <Row k="الرخصة" v={`${o.license_no || '—'} • ${o.license_place || '—'} • تنتهي ${fmtD(o.license_expiry)}`} />
          </>}
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 10 }}>
            {isOffice ? <Photo label="السجل التجاري" uri={o.cr_photo} /> : <>
              <Photo label="الصورة الشخصية" uri={o.driver_photo} />
              <Photo label="المركبة" uri={o.vehicle_photo} />
              <Photo label="الرخصة" uri={o.license_photo} />
            </>}
          </View>
          {!rejecting ? (
            <View style={ui.btns}>
              <Btn label="تم التحقق ✓" tone="ok" loading={busy} onPress={() => decide(true)} />
              <Btn label="رفض" tone="err" onPress={() => setRejecting(true)} />
            </View>
          ) : <>
            <Text style={ui.label}>سبب الرفض</Text>
            <View style={ui.chips}>
              {REJECT_REASONS.map(x => <Pill key={x} text={x} tone={reason === x ? 'brand' : 'mute'} onPress={() => setReason(x)} />)}
            </View>
            <TextInput value={reason} onChangeText={setReason} placeholder="أو اكتب السبب" placeholderTextColor="#94a3b8" multiline maxLength={200}
              style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, marginTop: 8, minHeight: 60, textAlign: 'right', textAlignVertical: 'top', color: C.txt }} />
            <Text style={ui.note}>يصله إشعار بالسبب، ويبقى الحساب يعمل حتى نهاية المهلة.</Text>
            <View style={ui.btns}>
              <Btn label="إرسال الرفض" tone="err" loading={busy} onPress={() => decide(false)} />
              <Btn label="رجوع" tone="ghost" onPress={() => setRejecting(false)} />
            </View>
          </>}
        </ScrollView>}
        {toast.node}
      </Sheet>
      {!o && toast.node}
    </View>
  );
}
