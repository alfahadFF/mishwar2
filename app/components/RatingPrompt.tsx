import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, AppState, ActivityIndicator } from 'react-native';
import { supabase } from '../utils/supabase';
import { TAGS, SERVICE_TAGS, SERVICE_LABEL } from '../utils/rating';

const periodLabel = (it: any) => it.service !== 'contracts' ? '' : Number(it.period) === 999 ? ' • نهاية العقد' : ` • الفترة ${it.period}`;

// نافذة التقييم: تطلع تلقائياً بعد انتهاء الخدمة (وعند فتح التطبيق خلال 24 ساعة)
export default function RatingPrompt() {
  const [items, setItems] = useState<any[]>([]);
  const [stars, setStars] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const last = useRef(0);
  const cur = items[0];

  const load = useCallback(async (force?: boolean) => {
    if (!force && Date.now() - last.current < 30e3) return;
    last.current = Date.now();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.rpc('my_pending_ratings');
    if (Array.isArray(data)) setItems(data as any[]);
  }, []);

  useEffect(() => {
    load(true);
    const st = AppState.addEventListener('change', s => { if (s === 'active') load(); });
    let ch: ReturnType<typeof supabase.channel> | null = null;
    const sub = (uid: string) => {
      if (ch) supabase.removeChannel(ch);
      ch = supabase.channel(`rating_${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${uid}` },
          (p: any) => { if (p.new?.kind === 'rating') setTimeout(() => load(true), 800); })
        .subscribe();
    };
    supabase.auth.getUser().then(({ data }) => { if (data.user) sub(data.user.id); });
    const auth = supabase.auth.onAuthStateChange((_e, session) => { if (session?.user) { sub(session.user.id); load(true); } });
    return () => { st.remove(); auth.data.subscription.unsubscribe(); if (ch) supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => { setStars(null); setTags([]); }, [cur?.id]);

  const next = () => setItems(x => x.slice(1));
  const send = async () => {
    if (!cur) return;
    setBusy(true);
    await supabase.rpc('submit_rating', { p_id: cur.id, p_stars: stars, p_tags: tags }).then(() => {}, () => {});
    setBusy(false); next();
  };
  const skip = async () => {
    if (!cur) return;
    supabase.rpc('skip_rating', { p_id: cur.id }).then(() => {}, () => {});
    next();
  };
  if (!cur) return null;
  const allowed = SERVICE_TAGS[cur.service] || [];
  const shown = allowed.filter(k => stars === null ? true : stars >= 4 ? TAGS[k].pos : !TAGS[k].pos);
  const toggle = (k: string) => setTags(t => (t.includes(k) ? t.filter(x => x !== k) : [...t, k]));
  const pickStars = (n: number) => { setStars(n); setTags(t => t.filter(k => (n >= 4 ? TAGS[k].pos : !TAGS[k].pos))); };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={skip}>
      <View style={s.shade}>
        <View style={s.box}>
          <Text style={s.title}>كيف كانت {SERVICE_LABEL[cur.service] || 'الخدمة'}؟</Text>
          <Text style={s.sub}>{cur.provider_name ? `مع ${cur.provider_name}` : ''}{periodLabel(cur)}</Text>
          <View style={s.stars}>
            {[1, 2, 3, 4, 5].map(n => (
              <Pressable key={n} onPress={() => pickStars(n)} hitSlop={6}>
                <Text style={[s.star, stars !== null && n <= stars && s.starOn]}>★</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.chips}>
            {shown.map(k => (
              <Pressable key={k} onPress={() => toggle(k)} style={[s.chip, tags.includes(k) && (TAGS[k].pos ? s.chipPos : s.chipNeg)]}>
                <Text style={[s.chipT, tags.includes(k) && { color: '#fff' }]}>{TAGS[k].l}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={send} disabled={busy || (stars === null && !tags.length)} style={[s.btn, (busy || (stars === null && !tags.length)) && { opacity: 0.4 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>إرسال</Text>}
          </Pressable>
          <Pressable onPress={skip} style={s.skip}><Text style={s.skipT}>تخطّي</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  shade: { flex: 1, backgroundColor: 'rgba(15,23,42,.55)', justifyContent: 'center', padding: 20 },
  box: { backgroundColor: '#fff', borderRadius: 22, padding: 18 },
  title: { fontSize: 18, fontWeight: '900', textAlign: 'center', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 4 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 14 },
  star: { fontSize: 40, color: '#e2e8f0' },
  starOn: { color: '#f59e0b' },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, borderWidth: 1.5, borderColor: '#e2e8f0' },
  chipPos: { backgroundColor: '#059669', borderColor: '#059669' },
  chipNeg: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  chipT: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  btn: { backgroundColor: '#4F46E5', borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  btnT: { color: '#fff', fontWeight: '900', fontSize: 16 },
  skip: { alignItems: 'center', paddingVertical: 12 },
  skipT: { color: '#64748b', fontWeight: '700' },
});
