import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../utils/supabase';
import { errMsg } from '../utils/errors';
import { getMyLocation } from '../utils/location';
import { Airport, loadAirports, sortByNear, WAIT_HOURS, hoursText } from '../utils/airport';
import { useToast } from '../components/Toast';
import { Header, Btn, ui, C } from '../components/DriverUI';
import PointPicker from '../components/PointPicker';
import DatePicker, { ymd } from '../components/DatePicker';
import TimePicker, { timeLabel, hm } from '../components/TimePicker';

// ✈️ طلب تكسي المطار: استقبال أو وداع، ويصل للسائقين المفعّلين ضمن 20 كم ليقدّموا عروضهم
function Seg({ items, value, onPick }: { items: { k: any; t: string }[]; value: any; onPick: (k: any) => void }) {
  return (
    <View style={s.seg}>
      {items.map(x => (
        <Pressable key={String(x.k)} onPress={() => onPick(x.k)} style={[s.segB, value === x.k && s.segOn]}>
          <Text style={[s.segT, value === x.k && { color: '#fff' }]}>{x.t}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function Stepper({ label, value, onChange, min = 1, max = 60, emptyAtMin }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; emptyAtMin?: string }) {
  return (
    <View style={s.step}>
      <Text style={s.stepL}>{label}</Text>
      <View style={s.stepRow}>
        <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={s.stepB}><Text style={s.stepBT}>−</Text></Pressable>
        <Text style={s.stepV}>{emptyAtMin && value === min ? emptyAtMin : value}</Text>
        <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={s.stepB}><Text style={s.stepBT}>+</Text></Pressable>
      </View>
    </View>
  );
}

export default function AirportScreen() {
  const router = useRouter();
  const toast = useToast();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [kind, setKind] = useState<'arrival' | 'departure' | null>(null);
  const [ll, setLl] = useState<number[] | null>(null);
  const [label, setLabel] = useState('');
  const [airport, setAirport] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [round, setRound] = useState(false);
  const [go, setGo] = useState(1);
  const [back, setBack] = useState(1);
  const [waitOn, setWaitOn] = useState(false);
  const [wait, setWait] = useState(0);
  const [bags, setBags] = useState(0);
  const [notes, setNotes] = useState('');
  const [pick, setPick] = useState(false);
  const [dOpen, setDOpen] = useState(false);
  const [tOpen, setTOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadAirports().then(setAirports); }, []);
  // تعديل طلب قبل اختيار عرض
  useEffect(() => {
    if (!edit) return;
    supabase.rpc('my_airport_orders').then(({ data }) => {
      const o = ((data || []) as any[]).find(x => x.id === edit);
      if (!o) return;
      const d = new Date(o.trip_at);
      setKind(o.kind); setLl([o.pickup_lat, o.pickup_lng]); setLabel(o.pickup_label || ''); setAirport(o.airport_code);
      setDate(ymd(d)); setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      setRound(!!o.round_trip); setGo(o.pax_go || 1); setBack(o.pax_back || 1);
      setWaitOn(!!o.wait_hours); setWait(o.wait_hours || 0); setBags(o.bags || 0); setNotes(o.notes || '');
    });
  }, [edit]);

  const list = useMemo(() => sortByNear(airports, ll), [airports, ll]);
  const openMap = async () => { if (!ll) { const r = await getMyLocation(); if (r.real && r.ll) setLl(r.ll); } setPick(true); };

  const submit = async () => {
    if (!kind) return toast.show('اختر: استقبال أو وداع', 'err');
    if (!ll) return toast.show('حدد نقطة الانطلاق على الخريطة', 'err');
    if (!airport || !airports.some(a => a.code === airport)) return toast.show('اختر مطاراً داخل سوريا', 'err');
    if (!date || !time) return toast.show('اختر اليوم والساعة', 'err');
    const at = new Date(`${date}T${hm(time)}:00`);
    if (at.getTime() < Date.now() + 30 * 60e3) return toast.show('اختر موعداً بعد نصف ساعة على الأقل', 'err');
    if (waitOn && !wait) return toast.show('اختر مدة الانتظار', 'err');
    const p = { kind, airport, lat: ll[0], lng: ll[1], label, trip_at: at.toISOString(), round_trip: round, pax_go: go,
                pax_back: round ? back : null, wait_hours: waitOn ? wait : null, bags: bags || null, notes: notes.trim() };
    setBusy(true);
    const { error } = edit ? await supabase.rpc('edit_airport_order', { p_order: edit, p })
                           : await supabase.rpc('create_airport_order', { p });
    setBusy(false);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show(edit ? 'تم حفظ التعديل ✓' : 'تم نشر الطلب، ستصلك العروض ✓');
    setTimeout(() => router.replace('/my-orders?tab=airport' as any), 700);
  };

  return (
    <View style={ui.page}>
      <Header title={edit ? 'تعديل طلب المطار' : '✈️ المطار'} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>نوع الخدمة</Text>
        <Seg items={[{ k: 'arrival' as const, t: '🛬 استقبال' }, { k: 'departure' as const, t: '🛫 وداع' }]} value={kind} onPick={setKind} />

        <Text style={s.label}>نقطة الانطلاق</Text>
        <Pressable onPress={openMap} style={s.field}>
          <Text style={{ fontSize: 18 }}>📍</Text>
          <Text style={[s.fieldT, !ll && { color: '#94a3b8' }]} numberOfLines={1}>{ll ? label || 'تم تحديد النقطة ✓' : 'حدد على الخريطة'}</Text>
        </Pressable>

        <Text style={s.label}>المطار</Text>
        <View style={s.chips}>
          {list.map(a => (
            <Pressable key={a.code} onPress={() => setAirport(a.code)} style={[s.chip, airport === a.code && s.chipOn]}>
              <Text style={[s.chipT, airport === a.code && { color: '#fff' }]}>{a.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>{kind === 'arrival' ? 'موعد وصول الطائرة' : kind === 'departure' ? 'موعد الانطلاق' : 'الموعد'}</Text>
        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <Pressable onPress={() => setDOpen(true)} style={[s.field, { flex: 1 }]}><Text style={s.fieldT}>📅 {date || 'اليوم'}</Text></Pressable>
          <Pressable onPress={() => setTOpen(true)} style={[s.field, { flex: 1 }]}><Text style={s.fieldT}>🕒 {time ? timeLabel(time) : 'الساعة'}</Text></Pressable>
        </View>

        <Text style={s.label}>الرحلة</Text>
        <Seg items={[{ k: false, t: 'ذهاب فقط' }, { k: true, t: 'ذهاب وعودة' }]} value={round} onPick={setRound} />
        <Text style={s.hint}>{round ? 'مرافقون يذهبون ويعودون في المشوار نفسه.' : 'المسافر وحده، أو القادمون وحدهم.'}</Text>
        {round ? (
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            <View style={{ flex: 1 }}><Stepper label="عدد الذاهبين" value={go} onChange={setGo} /></View>
            <View style={{ flex: 1 }}><Stepper label="عدد العائدين" value={back} onChange={setBack} /></View>
          </View>
        ) : <Stepper label="عدد الركاب" value={go} onChange={setGo} />}

        <Text style={s.label}>الانتظار في المطار</Text>
        <Seg items={[{ k: false, t: 'بدون انتظار طويل' }, { k: true, t: 'مع انتظار طويل' }]} value={waitOn} onPick={v => { setWaitOn(v); if (!v) setWait(0); }} />
        {waitOn && (
          <View style={[s.chips, { marginTop: 8 }]}>
            {WAIT_HOURS.map(h => (
              <Pressable key={h} onPress={() => setWait(h)} style={[s.chip, wait === h && s.chipOn]}>
                <Text style={[s.chipT, wait === h && { color: '#fff' }]}>{hoursText(h)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Stepper label="عدد الحقائب (اختياري)" value={bags} onChange={setBags} min={0} max={30} emptyAtMin="—" />

        <Text style={s.label}>ملاحظات <Text style={s.opt}>(اختياري)</Text></Text>
        <TextInput value={notes} onChangeText={setNotes} multiline maxLength={300} placeholder="مثال: أفضّل فان" placeholderTextColor="#94a3b8"
          style={[s.field, { minHeight: 70, textAlign: 'right', textAlignVertical: 'top', fontSize: 14, color: C.txt }]} />

        <View style={{ marginTop: 18 }}>
          <Btn label={edit ? 'حفظ التعديل' : 'نشر الطلب واستقبال العروض'} onPress={submit} loading={busy} />
        </View>
        <Text style={[s.hint, { textAlign: 'center' }]}>تظهر لك العروض مع صور المركبة والسائق، ويظهر الاسم والهاتف بعد اختيار العرض.</Text>
      </ScrollView>
      <PointPicker visible={pick} title="نقطة الانطلاق" initial={ll} onClose={() => setPick(false)}
        onConfirm={(p, l) => { setLl(p); setLabel(l); setPick(false); }} />
      <DatePicker visible={dOpen} value={date} minDate={new Date()} title="اليوم" onClose={() => setDOpen(false)} onPick={v => { setDate(v); setDOpen(false); }} />
      <TimePicker visible={tOpen} value={time} title="الساعة" onClose={() => setTOpen(false)} onPick={v => { setTime(v); setTOpen(false); }} />
      {toast.node}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', color: C.txt, textAlign: 'right', marginTop: 16, marginBottom: 6 },
  opt: { fontSize: 11, fontWeight: '600', color: C.mute },
  hint: { fontSize: 11, color: C.mute, textAlign: 'right', marginTop: 6, lineHeight: 16 },
  seg: { flexDirection: 'row-reverse', gap: 8 },
  segB: { flex: 1, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  segOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  segT: { fontWeight: '800', color: C.txt, fontSize: 13 },
  field: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 12, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  fieldT: { flex: 1, fontSize: 14, fontWeight: '700', color: C.txt, textAlign: 'right' },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipT: { fontSize: 12, fontWeight: '700', color: C.txt },
  step: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 12, padding: 10, marginTop: 10 },
  stepL: { fontSize: 12, fontWeight: '800', color: C.txt, textAlign: 'right' },
  stepRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  stepB: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  stepBT: { fontSize: 22, fontWeight: '900', color: C.txt },
  stepV: { fontSize: 20, fontWeight: '900', color: C.txt },
});
