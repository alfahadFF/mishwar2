import { Linking } from 'react-native';

// رقم الدعم — مؤقت، يُستبدل برقم دائم قبل الإطلاق
export const SUPPORT_PHONE = '+15799878363';

const waDigits = SUPPORT_PHONE.replace(/\D/g, '');

export function callSupport() {
  Linking.openURL('tel:' + SUPPORT_PHONE).catch(() => {});
}

export function whatsAppSupport() {
  const t = encodeURIComponent('مرحباً، أحتاج مساعدة في تطبيق مشوار');
  Linking.openURL(`whatsapp://send?phone=${waDigits}&text=${t}`).catch(() =>
    Linking.openURL(`https://wa.me/${waDigits}?text=${t}`).catch(() => {}),
  );
}
