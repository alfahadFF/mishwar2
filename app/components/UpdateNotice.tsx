import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';

type Stage = 'available' | 'downloading' | 'ready' | 'failed' | null;

// يفحص EAS Update عند فتح التطبيق وعودته للمقدمة، ثم يطلب موافقة المستخدم قبل التنزيل وإعادة التشغيل.
export default function UpdateNotice() {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>(null);
  const stageRef = useRef<Stage>(null);
  const checking = useRef(false);
  const dismissed = useRef(false);
  const mounted = useRef(true);

  const changeStage = (next: Stage) => {
    stageRef.current = next;
    setStage(next);
  };

  const checkForUpdate = useCallback(async () => {
    if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled || checking.current || dismissed.current || stageRef.current) return;
    checking.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (mounted.current && result.isAvailable && !dismissed.current) changeStage('available');
    } catch (error) {
      console.warn('[updates] check failed', error);
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => { void checkForUpdate(); }, 900);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void checkForUpdate();
    });
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      sub.remove();
    };
  }, [checkForUpdate]);

  const downloadUpdate = async () => {
    changeStage('downloading');
    try {
      const result = await Updates.fetchUpdateAsync();
      changeStage(result.isNew ? 'ready' : null);
    } catch (error) {
      console.warn('[updates] download failed', error);
      changeStage('failed');
    }
  };

  const restart = async () => {
    try {
      await Updates.reloadAsync();
    } catch (error) {
      console.warn('[updates] reload failed', error);
      changeStage('failed');
    }
  };

  const dismiss = () => {
    dismissed.current = true;
    changeStage(null);
  };

  if (!stage) return null;
  const busy = stage === 'downloading';
  return (
    <View style={[s.banner, { top: Math.max(insets.top, 8) + 10 }]} accessibilityRole="alert">
      <Text style={s.title}>{stage === 'failed' ? 'تعذر إكمال التحديث' : 'يتوفر تحديث جديد لمشوار'}</Text>
      <Text style={s.body}>
        {stage === 'available' && 'نزّل النسخة الجديدة لتحصل على آخر التحسينات.'}
        {stage === 'downloading' && 'جارٍ تنزيل التحديث. أبقِ التطبيق مفتوحاً قليلاً.'}
        {stage === 'ready' && 'اكتمل التنزيل؛ أعد تشغيل التطبيق لتطبيق التحديث.'}
        {stage === 'failed' && 'تحقق من اتصال الإنترنت ثم أعد المحاولة.'}
      </Text>
      {!busy && (
        <View style={s.actions}>
          {stage === 'available' && <Pressable onPress={downloadUpdate} style={s.primary} accessibilityRole="button"><Text style={s.primaryText}>تنزيل التحديث</Text></Pressable>}
          {stage === 'ready' && <Pressable onPress={restart} style={s.primary} accessibilityRole="button"><Text style={s.primaryText}>إعادة تشغيل الآن</Text></Pressable>}
          {stage === 'failed' && <Pressable onPress={downloadUpdate} style={s.primary} accessibilityRole="button"><Text style={s.primaryText}>إعادة المحاولة</Text></Pressable>}
          <Pressable onPress={dismiss} style={s.secondary} accessibilityRole="button"><Text style={s.secondaryText}>لاحقاً</Text></Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  banner: { position: 'absolute', left: 12, right: 12, zIndex: 10000, elevation: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 16, padding: 13, shadowColor: '#0f172a', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  title: { color: '#1e1b4b', fontSize: 14, fontWeight: '900', textAlign: 'right' },
  body: { color: '#475569', fontSize: 11, lineHeight: 17, textAlign: 'right', marginTop: 4 },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 10 },
  primary: { minHeight: 36, paddingHorizontal: 13, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  secondary: { minHeight: 36, paddingHorizontal: 13, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#4338ca', fontSize: 11, fontWeight: '800' },
});
