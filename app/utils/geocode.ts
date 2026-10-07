// اسم المكان من الإحداثيات (OSM Nominatim) — لعرض اسم مفهوم بدون أي كتابة من المستخدم
// ملاحظة إنتاج: الخادم العام محدود (طلب/ثانية) — يُفضّل خادم خاص أو مزود مدفوع عند الإطلاق
const cache: Record<string, string> = {};
export async function placeName(ll: number[]): Promise<string> {
  const key = ll[0].toFixed(5) + ',' + ll[1].toFixed(5);
  if (cache[key]) return cache[key];
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=ar&lat=${ll[0]}&lon=${ll[1]}`,
      { headers: { 'User-Agent': 'mishwar-app/1.0' } });
    const j = await r.json(); const a = j.address || {};
    const parts = [a.road || a.pedestrian || a.amenity || a.building, a.neighbourhood || a.suburb || a.quarter || a.city_district, a.city || a.town || a.village || a.state]
      .filter(Boolean).filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i);
    const name = parts.length ? parts.join('، ') : 'موقع محدد على الخريطة';
    cache[key] = name; return name;
  } catch { return 'موقع محدد على الخريطة'; }
}
