import { requireOptionalNativeModule } from 'expo-modules-core';

declare const require: (name: string) => any;

// لا نحمّل جسر التعرف على الكلام في Expo Go أو في بيئة لا تحتوي الوحدة الأصلية؛
// بذلك تبقى بقية الشاشة قابلة للاستخدام، ويُتاح الصوت بعد تثبيت بناء EAS المناسب.
export function getSpeechRecognitionModule(): any | null {
  try {
    if (!requireOptionalNativeModule('ExpoSpeechRecognition')) return null;
    return require('expo-speech-recognition').ExpoSpeechRecognitionModule || null;
  } catch {
    return null;
  }
}
