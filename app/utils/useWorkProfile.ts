import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import { syncBookingReminders } from './reminders';

// بيانات حساب العمل، وتُحدَّث تذكيرات المواعيد عند فتح الشاشة
export function useWorkProfile() {
  const [profile, setProfile] = useState<any>(undefined);
  useFocusEffect(useCallback(() => {
    supabase.rpc('my_work_profile').then(({ data }) => {
      setProfile(data || null);
      if (data) syncBookingReminders(data);
    });
  }, []));
  return profile;
}
