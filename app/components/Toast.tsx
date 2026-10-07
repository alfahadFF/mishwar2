import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

export type ToastKind = 'ok' | 'err' | 'info';
type T = { msg: string; kind: ToastKind; id: number } | null;

// إشعار سفلي موحّد لكل الشاشات
export function useToast() {
  const [t, setT] = useState<T>(null);
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);
  const show = useCallback((msg: string, kind: ToastKind = 'ok') => {
    clearTimeout(timer.current);
    setT({ msg, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!t) return;
    op.setValue(0);
    Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(op, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setT(null));
    }, 2600);
    return () => clearTimeout(timer.current);
  }, [t?.id]);
  const node = t ? (
    <Animated.View pointerEvents="none" style={[s.box, s[t.kind], { opacity: op, transform: [{ translateY: op.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
      <Text style={s.txt}>{t.msg}</Text>
    </Animated.View>
  ) : null;
  return { node, show };
}

const s = StyleSheet.create({
  box: { position: 'absolute', bottom: 28, left: 20, right: 20, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 8, zIndex: 999 },
  ok: { backgroundColor: '#065f46' },
  err: { backgroundColor: '#b91c1c' },
  info: { backgroundColor: '#1e293b' },
  txt: { color: '#fff', fontWeight: '800', fontSize: 13, textAlign: 'center' },
});
