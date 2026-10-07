import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { supabase } from '../../utils/supabase';
import { errMsg } from '../../utils/errors';
import { SETTINGS, SERVICE_NAME } from '../../utils/admin';
import { useToast } from '../Toast';
import { Empty, Btn, ui, C } from '../DriverUI';

const num = (v: string) => Number(String(v).replace(',', '.').trim());
const FX_COUNTRIES = [
  { code: 'SY', name: 'سوريا' }, { code: 'IQ', name: 'العراق' },
  { code: 'LB', name: 'لبنان' }, { code: 'JO', name: 'الأردن' },
];
type FxRow = { country_code: string; currency_code: string; pricing_exchange_rate: number|null; previous_exchange_rate: number|null; market_exchange_rate: number|null; rounding_unit: number|null; exchange_rate_alert_threshold: number; auto_update_exchange_rate: boolean; enabled: boolean };
type FxInput = { pricing: string; market: string; rounding: string };

// الإعدادات والعمولات: كل قيمة تُحفظ وحدها، والتغيير يسري على الطلبات الجديدة فقط
export default function AdminSettings() {
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, string> | null>(null);
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [fxRows, setFxRows] = useState<FxRow[]>([]);
  const [fxInputs, setFxInputs] = useState<Record<string, FxInput>>({});
  const [fxBusy, setFxBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc('admin_settings');
    if (error) return toast.show(errMsg(error), 'err');
    const d: any = data || {};
    const v: Record<string, string> = {};
    SETTINGS.forEach(s => { const x = d.settings?.[s.k]; v[s.k] = x == null ? '' : String(x).replace(/"/g, ''); });
    (d.commissions || []).forEach((c: any) => { v['c:' + c.service] = String(Math.round(Number(c.rate) * 10000) / 100); });
    setVals(v); setOrig(v);
    const { data: fxData, error: fxError } = await supabase.rpc('admin_taxi_pricing_settings');
    if (fxError) { setFxRows([]); setFxInputs({}); return; }
    const countries = ((fxData as any)?.countries || []) as FxRow[];
    setFxRows(countries);
    const inputs: Record<string, FxInput> = {};
    countries.forEach(c => { inputs[c.country_code] = {
      pricing: c.pricing_exchange_rate == null ? '' : String(c.pricing_exchange_rate),
      market: c.market_exchange_rate == null ? '' : String(c.market_exchange_rate),
      rounding: c.rounding_unit == null ? '' : String(c.rounding_unit),
    }; });
    setFxInputs(inputs);
  };
  useEffect(() => { load(); }, []);

  const save = async (k: string) => {
    const n = num(vals![k]);
    if (!isFinite(n) || n < 0) return toast.show('أدخل رقماً صحيحاً', 'err');
    setBusy(k);
    const { error } = k.startsWith('c:')
      ? await supabase.rpc('admin_save_commission', { p_service: k.slice(2), p_pct: n })
      : await supabase.rpc('admin_save_setting', { p_key: k, p_value: n });
    setBusy(null);
    if (error) return toast.show(errMsg(error), 'err');
    setOrig(o => ({ ...o, [k]: vals![k] })); toast.show('تم الحفظ ✓');
  };

  const saveFx = async (code: string) => {
    const x = fxInputs[code] || { pricing: '', market: '', rounding: '' };
    const pricing = x.pricing.trim() ? num(x.pricing) : null;
    const market = x.market.trim() ? num(x.market) : null;
    const rounding = x.rounding.trim() ? num(x.rounding) : null;
    if ([pricing, market, rounding].some(v => v !== null && (!Number.isFinite(v) || v <= 0)))
      return toast.show('أدخل أرقاماً موجبة صحيحة أو اترك الحقل فارغاً', 'err');
    setFxBusy(code);
    const { data, error } = await supabase.rpc('admin_save_taxi_exchange_rate', {
      p_country_code: code, p_pricing_rate: pricing, p_market_rate: market, p_rounding_unit: rounding,
    });
    setFxBusy(null);
    if (error) return toast.show(errMsg(error), 'err');
    toast.show(data?.alert ? 'تنبيه: فرق سعر السوق تجاوز 3% — لم يتغير سعر التسعير تلقائياً' : 'تم حفظ إعدادات الصرف ✓');
    await load();
  };

  const field = (k: string, label: string, unit: string, hint?: string) => {
    const changed = vals![k] !== orig[k];
    return (
      <View key={k} style={ui.card}>
        <Text style={ui.h}>{label}</Text>
        {!!hint && <Text style={ui.sub}>{hint}</Text>}
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <TextInput value={vals![k]} onChangeText={t => setVals(v => ({ ...v!, [k]: t }))} keyboardType="decimal-pad" style={[ui.input, { flex: 1 }]} />
          <Text style={{ color: C.mute, fontWeight: '800', width: 34, textAlign: 'center' }}>{unit}</Text>
          <View style={{ width: 80 }}><Btn label="حفظ" small disabled={!changed} loading={busy === k} onPress={() => save(k)} /></View>
        </View>
      </View>
    );
  };

  const services = vals ? Object.keys(vals).filter(k => k.startsWith('c:')) : [];
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {!vals ? <Empty icon="⏳" title="جاري التحميل" /> : <>
          <Text style={[ui.label, { fontSize: 14 }]}>العمولات</Text>
          {services.map(k => field(k, SERVICE_NAME[k.slice(2)] || k.slice(2), '%', 'من 0 إلى 50'))}
          <Text style={[ui.label, { fontSize: 14, marginTop: 14 }]}>الإعدادات</Text>
          {SETTINGS.map(s => field(s.k, s.label, s.unit, s.hint))}
          <Text style={ui.note}>التغييرات تسري على الطلبات الجديدة فقط.</Text>
          {!!fxRows.length && <>
            <Text style={[ui.label, { fontSize: 14, marginTop: 14 }]}>تسعير التكسي وسعر الصرف</Text>
            <Text style={ui.note}>التسعير بالدولار، والسعر المحلي للعرض فقط. إدخال سعر السوق للمراقبة لا يغيّر سعر التسعير تلقائياً.</Text>
            {FX_COUNTRIES.map(meta => {
              const row = fxRows.find(x => x.country_code === meta.code);
              if (!row) return null;
              const x = fxInputs[meta.code] || { pricing: '', market: '', rounding: '' };
              const p = x.pricing.trim() ? num(x.pricing) : Number(row.pricing_exchange_rate || 0);
              const m = x.market.trim() ? num(x.market) : Number(row.market_exchange_rate || 0);
              const deviation = p > 0 && m > 0 ? Math.abs(m - p) / p : 0;
              const alert = deviation > Number(row.exchange_rate_alert_threshold || 0.03);
              const input = (key: keyof FxInput, label: string, unit: string) => (
                <View key={key} style={{ marginTop: 8 }}>
                  <Text style={ui.sub}>{label}</Text>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <TextInput value={x[key]} onChangeText={value => setFxInputs(v => ({ ...v, [meta.code]: { ...x, [key]: value } }))}
                      keyboardType="decimal-pad" style={[ui.input, { flex: 1 }]} placeholder="—" />
                    <Text style={{ color: C.mute, fontWeight: '800', minWidth: 42, textAlign: 'center' }}>{unit}</Text>
                  </View>
                </View>
              );
              return <View key={meta.code} style={ui.card}>
                <Text style={ui.h}>{meta.name} • {row.currency_code} {row.enabled ? '• مفعّل' : '• غير مفعّل'}</Text>
                {meta.code === 'SY' && <Text style={ui.sub}>13,200 ليرة قديمة = 132 ليرة جديدة لكل دولار بعد حذف صفرين.</Text>}
                {input('pricing', 'سعر التسعير المعتمد (وحدة محلية لكل USD)', row.currency_code)}
                {input('market', 'سعر السوق المرصود يدوياً للمقارنة', row.currency_code)}
                {input('rounding', 'وحدة التقريب للعملة المحلية', row.currency_code)}
                <Text style={[ui.sub, { marginTop: 8 }]}>التنبيه عند فرق أكبر من {Number(row.exchange_rate_alert_threshold) * 100}% • التحديث التلقائي: متوقف</Text>
                {alert && <View style={{ marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d' }}>
                  <Text style={{ color: '#92400e', fontWeight: '900', textAlign: 'right' }}>⚠️ فرق سعر السوق {(deviation * 100).toFixed(1)}% — يلزم مراجعة الإدارة؛ لم يتغير السعر المعتمد.</Text>
                </View>}
                <View style={{ marginTop: 10 }}><Btn label="حفظ إعدادات الصرف" small loading={fxBusy === meta.code} onPress={() => saveFx(meta.code)} /></View>
              </View>;
            })}
          </>}
        </>}
      </ScrollView>
      {toast.node}
    </View>
  );
}
