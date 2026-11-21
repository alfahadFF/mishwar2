import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';

const TABS = [
  { href: '/', icon: '🏠', label: 'الرئيسية' },
  { href: '/my-orders', icon: '🧾', label: 'طلباتي' },
  { href: '/wallet', icon: '👛', label: 'المحفظة' },
  { href: '/loyalty', icon: '🎁', label: 'نقاطي' },
  { href: '/account', icon: '👤', label: 'حسابي' },
] as const;

function matches(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/wallet') return pathname === '/wallet' || pathname === '/admin-wallet';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function GlobalBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthenticated(!!data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const go = async (href: string) => {
    if (matches(pathname, href)) return;
    if (href === '/account') {
      let signedIn = authenticated;
      if (signedIn === null) {
        const { data } = await supabase.auth.getSession();
        signedIn = !!data.session;
        setAuthenticated(signedIn);
      }
      if (!signedIn) {
        if (pathname !== '/login' && pathname !== '/register') router.push('/login' as any);
        return;
      }
    }
    const destination = href === '/' ? '/?stayHome=1' : href;
    router.replace(destination as any);
  };

  return (
    <View style={[s.bar, { height: 64 + insets.bottom, paddingBottom: 6 + insets.bottom }]}>
      {TABS.map(tab => {
        const active = matches(pathname, tab.href);
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            onPress={() => { void go(tab.href); }}
            style={s.tab}
          >
            <Text style={s.icon}>{tab.icon}</Text>
            <Text style={[s.label, active && s.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  icon: { fontSize: 18 },
  label: { fontSize: 10, color: '#9CA3AF', fontWeight: '600' },
  labelActive: { color: '#FF6B00', fontWeight: '800' },
});
