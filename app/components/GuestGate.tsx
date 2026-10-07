import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { onGuestBlocked } from '../utils/guest';
import { useToast } from './Toast';

// يلتقط محاولات الضيف لتنفيذ عملية: تنبيه + فتح شاشة الدخول.
// بعد الدخول يعود المستخدم إلى الشاشة نفسها (router.back في شاشة الدخول).
export default function GuestGate() {
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const last = useRef(0);
  const pathRef = useRef(path);
  pathRef.current = path;
  useEffect(() => onGuestBlocked(() => {
    const now = Date.now();
    if (now - last.current < 1500) return;
    last.current = now;
    toast.show('يجب تسجيل الدخول أولاً', 'info');
    if (!/^\/(login|register|terms)/.test(pathRef.current)) router.push('/login' as any);
  }), []);
  return toast.node;
}
