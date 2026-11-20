import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { placeName, searchPlaces, type PlaceSearchResult } from '../utils/geocode';
import { getSpeechRecognitionModule } from '../utils/speech';
import { MapView, UrlTile, Marker } from './OpenMapView';

export type PickedPoint = { ll: number[] | null; label: string };
type Props = { visible: boolean; title: string; color?: string; initial?: number[] | null; onClose: () => void; onConfirm: (ll: number[], label: string) => void };

// يتيح اختيار النقطة من الخريطة، أو بالبحث النصي، أو بالإملاء الصوتي.
export default function PointPicker({ visible, title, color = '#4F46E5', initial, onClose, onConfirm }: Props) {
  const [ll, setLl] = useState<number[] | null>(null);
  const [center, setCenter] = useState<number[] | null>(null);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const mapRef = useRef<any>(null);
  const req = useRef(0);
  const centerReq = useRef(0);
  const speechListeners = useRef<any[]>([]);
  const lastSearchAt = useRef(0);

  const cleanupSpeech = () => {
    speechListeners.current.forEach(x => { try { x.remove?.(); } catch {} });
    speechListeners.current = [];
  };
  useEffect(() => () => cleanupSpeech(), []);

  const animateTo = (p: number[], delta = 0.02) => mapRef.current?.animateToRegion?.({ latitude: p[0], longitude: p[1], latitudeDelta: delta, longitudeDelta: delta });
  const resolve = async (p: number[]) => {
    const my = ++req.current;
    setLoading(true);
    const n = await placeName(p);
    if (my !== req.current) return;
    setLabel(n);
    setLoading(false);
  };
  const setPoint = (p: number[], knownLabel?: string) => {
    setLl(p);
    if (knownLabel) {
      req.current++;
      setLabel(knownLabel);
      setLoading(false);
    } else {
      void resolve(p);
    }
  };

  const locate = async (selectPoint = false) => {
    const my = ++centerReq.current;
    setLocating(true);
    setLocationError(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('LOCATION_PERMISSION');
      const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 1500 }).catch(() => null);
      if (last && my === centerReq.current) {
        const p = [last.coords.latitude, last.coords.longitude];
        setCenter(p);
        if (selectPoint) setPoint(p);
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (my !== centerReq.current) return;
      const p = [pos.coords.latitude, pos.coords.longitude];
      setCenter(p);
      if (selectPoint) setPoint(p);
    } catch {
      if (my === centerReq.current) setLocationError(true);
    } finally {
      if (my === centerReq.current) setLocating(false);
    }
  };

  const runSearch = async (raw = search) => {
    const q = raw.trim();
    if (q.length < 3) { setSearchError('اكتب 3 أحرف على الأقل للبحث'); setResults([]); return; }
    const wait = Math.max(0, 1100 - (Date.now() - lastSearchAt.current));
    if (wait) await new Promise(resolveWait => setTimeout(resolveWait, wait));
    lastSearchAt.current = Date.now();
    setSearching(true);
    setSearchError('');
    try {
      const found = await searchPlaces(q, center || initial || null);
      setResults(found);
      if (!found.length) setSearchError('لم نعثر على مكان مطابق؛ جرّب كتابة اسم المدينة أو الحي');
    } catch {
      setResults([]);
      setSearchError('تعذر البحث الآن؛ تحقق من الإنترنت وحاول مرة أخرى');
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = (item: PlaceSearchResult) => {
    setCenter(item.ll);
    setPoint(item.ll, item.label);
    setSearch(item.label);
    setResults([]);
    setSearchError('');
    animateTo(item.ll, 0.012);
  };

  const startVoice = async () => {
    setSpeechError('');
    const module = getSpeechRecognitionModule();
    if (!module) {
      setSpeechError('الإدخال الصوتي يحتاج نسخة التطبيق المحدّثة؛ يمكنك البحث بالكتابة أو الخريطة الآن');
      return;
    }
    try {
      const permission = await module.requestPermissionsAsync();
      if (!permission?.granted) {
        setSpeechError('اسمح باستخدام الميكروفون والتعرّف على الكلام للإدخال الصوتي');
        return;
      }
      cleanupSpeech();
      speechListeners.current = [
        module.addListener('result', (event: any) => {
          const transcript = String(event?.results?.[0]?.transcript || '').trim();
          if (!transcript) return;
          setSearch(transcript);
          if (event?.isFinal) {
            setRecognizing(false);
            void runSearch(transcript);
          }
        }),
        module.addListener('error', (event: any) => {
          setRecognizing(false);
          setSpeechError(event?.error === 'not-allowed' ? 'لم يُسمح باستخدام الميكروفون' : 'لم نفهم الكلام؛ حاول مرة أخرى أو اكتب اسم المكان');
        }),
        module.addListener('end', () => setRecognizing(false)),
      ];
      setRecognizing(true);
      module.start({ lang: 'ar', interimResults: true, continuous: false, maxAlternatives: 1 });
    } catch {
      setRecognizing(false);
      cleanupSpeech();
      setSpeechError('تعذر تشغيل الإدخال الصوتي على هذا الجهاز');
    }
  };

  useEffect(() => {
    if (!visible) {
      centerReq.current++;
      req.current++;
      cleanupSpeech();
      setRecognizing(false);
      return;
    }
    setLl(initial || null);
    setLabel('');
    setLocationError(false);
    setSearch('');
    setResults([]);
    setSearchError('');
    setSpeechError('');
    if (initial && initial.length >= 2 && initial.every(Number.isFinite)) {
      setCenter(initial);
      animateTo(initial, 0.01);
      void resolve(initial);
    } else {
      setCenter(null);
      setLoading(false);
      void locate(false);
    }
    return () => { centerReq.current++; req.current++; };
  }, [visible, initial?.[0], initial?.[1]]);

  const region = center ? { latitude: center[0], longitude: center[1], latitudeDelta: initial ? 0.01 : 0.02, longitudeDelta: initial ? 0.01 : 0.02 } : undefined;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.head}>
            <Text style={s.title}>{title}</Text>
            <Pressable onPress={onClose} style={s.close} accessibilityRole="button" accessibilityLabel="إغلاق اختيار الموقع"><Text>✕</Text></Pressable>
          </View>
          <View style={s.searchArea}>
            <View style={s.searchRow}>
              <TextInput
                value={search}
                onChangeText={value => { setSearch(value); setSearchError(''); setResults([]); setSpeechError(''); }}
                onSubmitEditing={() => void runSearch()}
                returnKeyType="search"
                placeholder="اكتب اسم المكان أو العنوان"
                placeholderTextColor="#94a3b8"
                style={s.searchInput}
                accessibilityLabel="البحث عن مكان"
              />
              <Pressable onPress={startVoice} disabled={recognizing} style={[s.voiceBtn, recognizing && s.voiceBtnOn]} accessibilityRole="button" accessibilityLabel="إدخال صوتي">
                <Text style={s.voiceText}>{recognizing ? '🎙️…' : '🎙️'}</Text>
              </Pressable>
              <Pressable onPress={() => void runSearch()} disabled={searching} style={[s.searchBtn, searching && { opacity: 0.55 }]} accessibilityRole="button">
                <Text style={s.searchBtnText}>{searching ? '...' : 'بحث'}</Text>
              </Pressable>
            </View>
            <Text style={s.searchHint}>اكتب المكان أو قل اسمه، أو اختره مباشرة من الخريطة</Text>
            {!!speechError && <Text style={s.errorText}>{speechError}</Text>}
            {!!searchError && <Text style={s.errorText}>{searchError}</Text>}
            {!!results.length && (
              <ScrollView style={s.results} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {results.map((item, index) => (
                  <Pressable key={`${item.ll.join(',')}-${index}`} onPress={() => chooseResult(item)} style={s.resultItem}>
                    <Text style={s.resultLabel} numberOfLines={1}>📍 {item.label}</Text>
                    {!!item.detail && item.detail !== item.label && <Text style={s.resultDetail} numberOfLines={2}>{item.detail}</Text>}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
          <View style={{ flex: 1 }}>
            {center && region ? (
              <>
                <MapView ref={mapRef} style={{ flex: 1 }} basemap="hybrid" initialRegion={region}
                  onPress={(e: any) => { const c = e.nativeEvent.coordinate; setPoint([c.latitude, c.longitude]); }}>
                  <UrlTile urlTemplate="https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />
                  {ll && <Marker coordinate={{ latitude: ll[0], longitude: ll[1] }} pinColor={color} />}
                </MapView>
                <View style={s.hint}><Text style={s.hintT}>اضغط على الخريطة لتحريك دبوس الموقع</Text></View>
                <Pressable onPress={() => locate(true)} disabled={locating} style={s.my}><Text style={{ fontWeight: '800', fontSize: 12 }}>{locating ? '⏳ جارٍ تحديد الموقع' : '🎯 موقعي'}</Text></Pressable>
                {locationError && <View style={s.locationWarn}><Text style={s.locationWarnT}>تعذر تحديث الموقع؛ يمكنك استخدام آخر نقطة ظاهرة أو البحث أو إعادة المحاولة.</Text></View>}
              </>
            ) : (
              <View style={s.locationGate}>
                <Text style={s.locationIcon}>{locating ? '📡' : '📍'}</Text>
                <Text style={s.locationGateT}>{locating ? 'جارٍ تحديد موقعك لفتح الخريطة بالقرب منك' : 'تعذر تحديد موقعك؛ ابحث عن مكان أو فعّل إذن الموقع لإعادة المحاولة'}</Text>
                {!locating && <Pressable onPress={() => locate(false)} style={s.retry}><Text style={s.retryT}>إعادة تحديد موقعي</Text></Pressable>}
              </View>
            )}
          </View>
          <View style={s.bar}>
            <Text style={[s.label, !ll && { color: '#94a3b8' }]} numberOfLines={2}>{!ll ? 'لم يتم تحديد موقع بعد' : loading ? '⏳ جاري تحديد اسم المكان...' : '📍 ' + label}</Text>
            <Pressable disabled={!ll || loading} onPress={() => ll && onConfirm(ll, label || 'موقع محدد على الخريطة')} style={[s.confirm, (!ll || loading) && { backgroundColor: '#cbd5e1' }]}>
              <Text style={s.confirmT}>تأكيد الموقع</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  head: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 15, fontWeight: '900' },
  close: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  searchArea: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  searchRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  searchInput: { flex: 1, height: 44, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, backgroundColor: '#f8fafc', paddingHorizontal: 12, color: '#0f172a', fontSize: 14, textAlign: 'right' },
  voiceBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  voiceBtnOn: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  voiceText: { fontSize: 18 },
  searchBtn: { minWidth: 56, height: 44, borderRadius: 12, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  searchBtnText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  searchHint: { textAlign: 'right', fontSize: 10, color: '#64748b', marginTop: 4 },
  errorText: { textAlign: 'right', color: '#b91c1c', fontWeight: '700', fontSize: 10, marginTop: 4 },
  results: { maxHeight: 150, marginTop: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff' },
  resultItem: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  resultLabel: { textAlign: 'right', color: '#0f172a', fontSize: 12, fontWeight: '800' },
  resultDetail: { textAlign: 'right', color: '#64748b', fontSize: 10, marginTop: 2 },
  hint: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: 'rgba(15,23,42,.85)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  hintT: { color: '#fff', fontSize: 11, fontWeight: '800' },
  my: { position: 'absolute', bottom: 12, left: 12, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center' },
  bar: { padding: 14, borderTopWidth: 1, borderColor: '#e2e8f0' },
  label: { fontSize: 13, fontWeight: '800', textAlign: 'right', minHeight: 20 },
  confirm: { height: 46, borderRadius: 12, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  confirmT: { color: '#fff', fontWeight: '900', fontSize: 14 },
  locationGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, backgroundColor: '#f8fafc' },
  locationIcon: { fontSize: 38 },
  locationGateT: { fontSize: 14, lineHeight: 22, fontWeight: '800', color: '#334155', textAlign: 'center' },
  retry: { height: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  retryT: { color: '#fff', fontWeight: '900' },
  locationWarn: { position: 'absolute', top: 48, alignSelf: 'center', backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, padding: 8, marginHorizontal: 14 },
  locationWarnT: { fontSize: 11, color: '#9a3412', fontWeight: '700', textAlign: 'center' },
});
