// بحث الأماكن وعكس الإحداثيات عبر OSM Nominatim.
// البحث يُنفّذ عند الضغط على «بحث» فقط، وليس أثناء كل حرف، احتراماً لحدود الخدمة العامة.
const reverseCache: Record<string, string> = {};

export type PlaceSearchResult = { ll: number[]; label: string; detail: string };

const cleanParts = (parts: unknown[]) => parts
  .filter((v): v is string => typeof v === 'string' && !!v.trim())
  .map(v => v.trim())
  .filter((v, i, arr) => arr.indexOf(v) === i);

function addressLabel(address: any, fallback: string) {
  const parts = cleanParts([
    address?.name,
    address?.amenity,
    address?.road || address?.pedestrian || address?.building,
    address?.neighbourhood || address?.suburb || address?.quarter || address?.city_district,
    address?.city || address?.town || address?.village || address?.state,
  ]);
  return parts.slice(0, 3).join('، ') || fallback || 'موقع محدد على الخريطة';
}

export async function placeName(ll: number[]): Promise<string> {
  const key = ll[0].toFixed(5) + ',' + ll[1].toFixed(5);
  if (reverseCache[key]) return reverseCache[key];
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=ar&lat=${ll[0]}&lon=${ll[1]}`,
      { headers: { 'User-Agent': 'mishwar-app/1.0' } });
    if (!r.ok) throw new Error(`GEOCODE_HTTP_${r.status}`);
    const j = await r.json();
    const name = addressLabel(j.address || {}, j.name || '');
    reverseCache[key] = name;
    return name;
  } catch {
    return 'موقع محدد على الخريطة';
  }
}

export async function searchPlaces(query: string, focus?: number[] | null): Promise<PlaceSearchResult[]> {
  const text = query.trim();
  if (text.length < 3) return [];
  const params = new URLSearchParams({ format: 'jsonv2', q: text, limit: '6', addressdetails: '1', 'accept-language': 'ar' });
  if (focus && focus.length >= 2 && focus.every(Number.isFinite)) {
    const [lat, lng] = focus;
    const dLat = 0.18;
    const dLng = 0.18 / Math.max(0.25, Math.cos(lat * Math.PI / 180));
    params.set('viewbox', `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`);
    params.set('bounded', '0');
  }
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`,
    { headers: { 'User-Agent': 'mishwar-app/1.0' } });
  if (!response.ok) throw new Error(`GEOCODE_HTTP_${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((row: any): PlaceSearchResult | null => {
    const lat = Number(row?.lat);
    const lng = Number(row?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const detail = String(row?.display_name || '').trim();
    const label = addressLabel(row?.address || {}, String(row?.name || detail));
    return { ll: [lat, lng], label, detail };
  }).filter((row: PlaceSearchResult | null): row is PlaceSearchResult => !!row);
}
