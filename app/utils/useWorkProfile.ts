import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import { syncBookingReminders } from './reminders';

// بيانات حساب العمل، وتُحدَّث تذكيرات المواعيد عند فتح الشاشة
export function useWorkProfile(retryToken = 0) {
  const [profile, setProfile] = useState<any>(undefined);
  useFocusEffect(useCallback(() => {
    let focused = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('my_work_profile');
        if (!focused) return;
        if (error) console.warn('[work] my_work_profile failed', error);
        const next = error ? null : (data || null);
        setProfile(next);
        if (next) void syncBookingReminders(next);
      } catch (error) {
        if (!focused) return;
        console.warn('[work] my_work_profile request failed', error);
        setProfile(null);
      }
    })();
    return () => { focused = false; };
  }, [retryToken]));
  return profile;
}
