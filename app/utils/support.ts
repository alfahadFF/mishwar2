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

export const FACEBOOK_SUPPORT_URL = 'https://www.facebook.com/share/1FRvmwfFVd/';
export const APP_DOWNLOAD_UPDATES_URL = 'https://t.me/mishwar_app/3';

export function openFacebookSupport() {
  Linking.openURL(FACEBOOK_SUPPORT_URL).catch(() => {});
}

export function openAppDownloadUpdates() {
  Linking.openURL(APP_DOWNLOAD_UPDATES_URL).catch(() => {});
}
