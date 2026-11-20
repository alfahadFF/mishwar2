import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getSpeechRecognitionModule } from '../utils/speech';
import { searchPlaces, type PlaceSearchResult } from '../utils/geocode';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  inputStyle?: any;
  accessibilityLabel?: string;
};

// حقل موحد لأسماء المدن والوجهات: كتابة أو إملاء صوتي مع اقتراحات أماكن.
export default function PlaceTextInput({ value, onChangeText, placeholder, inputStyle, accessibilityLabel = 'اسم الوجهة' }: Props) {
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [message, setMessage] = useState('');
  const listeners = useRef<any[]>([]);
  const requestId = useRef(0);
  const lastSearchAt = useRef(0);

  const cleanupSpeech = () => {
    listeners.current.forEach(listener => { try { listener.remove?.(); } catch {} });
    listeners.current = [];
  };
  useEffect(() => () => cleanupSpeech(), []);

  const searchNow = async (raw = value) => {
    const id = ++requestId.current;
    const query = raw.trim();
    if (query.length < 3) {
      setResults([]);
      setMessage('اكتب 3 أحرف على الأقل لعرض اقتراحات الأماكن');
      setBusy(false);
      return;
    }
    const wait = Math.max(0, 1100 - (Date.now() - lastSearchAt.current));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    if (id !== requestId.current) return;
    lastSearchAt.current = Date.now();
    setBusy(true);
    setMessage('');
    try {
      const found = await searchPlaces(query);
      if (id !== requestId.current) return;
      setResults(found);
      if (!found.length) setMessage('لم نعثر على اقتراح مطابق؛ يمكنك إبقاء الاسم الذي كتبته');
    } catch {
      if (id === requestId.current) {
        setResults([]);
        setMessage('تعذر جلب الاقتراحات الآن؛ يمكنك إدخال الوجهة كتابةً');
      }
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };

  const startVoice = async () => {
    setMessage('');
    const module = getSpeechRecognitionModule();
    if (!module) {
      setMessage('الإدخال الصوتي متاح في نسخة التطبيق المثبّتة، ويمكنك الكتابة الآن');
      return;
    }
    try {
      const permission = await module.requestPermissionsAsync();
      if (!permission?.granted) {
        setMessage('اسمح باستخدام الميكروفون والتعرّف على الكلام للإدخال الصوتي');
        return;
      }
      cleanupSpeech();
      listeners.current = [
        module.addListener('result', (event: any) => {
          const transcript = String(event?.results?.[0]?.transcript || '').trim();
          if (!transcript) return;
          onChangeText(transcript);
          if (event?.isFinal) {
            setRecognizing(false);
            void searchNow(transcript);
          }
        }),
        module.addListener('error', (event: any) => {
          setRecognizing(false);
          setMessage(event?.error === 'not-allowed' ? 'لم يُسمح باستخدام الميكروفون' : 'لم نفهم الكلام؛ حاول مرة أخرى أو اكتب الوجهة');
        }),
        module.addListener('end', () => setRecognizing(false)),
      ];
      setRecognizing(true);
      module.start({ lang: 'ar', interimResults: true, continuous: false, maxAlternatives: 1 });
    } catch {
      setRecognizing(false);
      cleanupSpeech();
      setMessage('تعذر تشغيل الإدخال الصوتي على هذا الجهاز');
    }
  };

  const choose = (place: PlaceSearchResult) => {
    requestId.current++;
    onChangeText(place.label);
    setResults([]);
    setMessage('');
    setBusy(false);
  };

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <TextInput
          value={value}
          onChangeText={text => { requestId.current++; onChangeText(text); setResults([]); setMessage(''); setBusy(false); }}
          onSubmitEditing={() => void searchNow()}
          returnKeyType="search"
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          style={[s.input, inputStyle]}
          accessibilityLabel={accessibilityLabel}
        />
        <Pressable onPress={startVoice} disabled={recognizing} style={[s.iconButton, recognizing && s.recording]} accessibilityRole="button" accessibilityLabel="إملاء الوجهة صوتياً">
          <Text style={s.icon}>{recognizing ? '🎙️…' : '🎙️'}</Text>
        </Pressable>
        <Pressable onPress={() => void searchNow()} disabled={busy} style={[s.searchButton, busy && { opacity: 0.55 }]} accessibilityRole="button" accessibilityLabel="البحث عن الوجهة">
          <Text style={s.searchText}>{busy ? '…' : 'بحث'}</Text>
        </Pressable>
      </View>
      {!!message && <Text style={s.message}>{message}</Text>}
      {!!results.length && (
        <ScrollView style={s.results} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {results.map((place, index) => (
            <Pressable key={`${place.ll.join(',')}-${index}`} onPress={() => choose(place)} style={s.result}>
              <Text numberOfLines={1} style={s.resultTitle}>📍 {place.label}</Text>
              {!!place.detail && place.detail !== place.label && <Text numberOfLines={2} style={s.resultDetail}>{place.detail}</Text>}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 5 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  input: { flex: 1, minHeight: 46, backgroundColor: '#fff', borderWidth: 1.3, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#0f172a', textAlign: 'right', fontSize: 14 },
  iconButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.3, borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  recording: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  icon: { fontSize: 18 },
  searchButton: { minWidth: 54, height: 44, borderRadius: 12, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  searchText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  message: { color: '#64748b', textAlign: 'right', fontSize: 10, fontWeight: '700' },
  results: { maxHeight: 150, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff' },
  result: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  resultTitle: { color: '#0f172a', textAlign: 'right', fontSize: 12, fontWeight: '800' },
  resultDetail: { color: '#64748b', textAlign: 'right', fontSize: 10, marginTop: 2 },
});
