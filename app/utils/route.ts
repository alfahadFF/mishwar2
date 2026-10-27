import Constants from 'expo-constants';

// يجرّب OpenRouteService عند تهيئته، ثم يستخدم OSRM بديلاً عند تعذّر الطلب الأساسي.
export type LatLng = number[];
export type RouteOption = {
  km: number;
  min: number;
  path: { latitude: number; longitude: number }[];
  // المسار المروري قد يبدأ/ينتهي عند أقرب طريق، لا عند الدبوس نفسه.
  snapStartMeters: number;
  snapEndMeters: number;
};
export type RouteResult = ({ ok: true } & RouteOption & { alternatives: RouteOption[] }) | { ok: false };
export type RouteRequestOptions = { alternatives?: boolean; preference?: 'fastest' | 'shortest' };
const cache: Record<string, RouteResult> = {};
export const OSRM_URL = 'https://router.project-osrm.org';
const ORS_URL = 'https://api.openrouteservice.org/v2';
const ORS_API_KEY = String(Constants.expoConfig?.extra?.orsApiKey || '').trim();

function requestSignal(ms=15000) {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(tm) };
}

async function orsMatrix(locations: LatLng[], sources: number[], destinations: number[], metric: 'duration' | 'distance') {
  const timeout = requestSignal(10000);
  try {
    const response = await fetch(`${ORS_URL}/matrix/driving-car`, {
      method: 'POST',
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        locations: locations.map(p => [p[1], p[0]]),
        sources: sources.map(String),
        destinations: destinations.map(String),
        metrics: [metric],
        units: 'm',
      }),
      signal: timeout.signal,
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error?.message || `OpenRouteService ${response.status}`);
    return metric === 'duration' ? data.durations : data.distances;
  } finally {
    timeout.clear();
  }
}

function metersBetween(a: LatLng, b: LatLng) {
  const rad = (n: number) => n * Math.PI / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const lat1 = rad(a[0]);
  const lat2 = rad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeResult(candidates: { distance: number; duration: number; coordinates: number[][] }[], requested: LatLng[]): RouteResult | null {
  if (!Array.isArray(candidates) || requested.length < 2) return null;
  const options: RouteOption[] = [];
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.distance) || candidate.distance < 0 || !Number.isFinite(candidate.duration) || candidate.duration < 0 || !Array.isArray(candidate.coordinates)) continue;
    const path = candidate.coordinates.map((coordinate: number[]) => ({ latitude: Number(coordinate[1]), longitude: Number(coordinate[0]) }));
    if (path.length < 2 || path.some(p => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude))) continue;
    const first = path[0];
    const last = path[path.length - 1];
    options.push({
      km: candidate.distance / 1000,
      min: candidate.duration / 60,
      path,
      snapStartMeters: metersBetween(requested[0], [first.latitude, first.longitude]),
      snapEndMeters: metersBetween(requested[requested.length - 1], [last.latitude, last.longitude]),
    });
  }
  if (!options.length) return null;
  // نعتمد أقصر مسافة، وعند التعادل نفضّل الأقل زمنًا.
  options.sort((a, b) => a.km - b.km || a.min - b.min);
  const [shortest, ...alternatives] = options.slice(0, 3);
  return { ok: true, ...shortest, alternatives };
}

async function routeViaORS(points: LatLng[], options: RouteRequestOptions = {}): Promise<RouteResult | null> {
  const timeout = requestSignal(10000);
  try {
    const body: any = {
      coordinates: points.map(p => [p[1], p[0]]),
      instructions: false,
    };
    if (options.preference) body.preference = options.preference;
    if (options.alternatives) body.alternative_routes = { target_count: 3, weight_factor: 1.4, share_factor: 0.6 };
    const response = await fetch(`${ORS_URL}/directions/driving-car/geojson`, {
      method: 'POST',
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json', Accept: 'application/geo+json, application/json' },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    const data = await response.json();
    if (!response.ok || data.error || !Array.isArray(data.features)) return null;
    const candidates = data.features.map((feature: any) => ({
      distance: Number(feature?.properties?.summary?.distance),
      duration: Number(feature?.properties?.summary?.duration),
      coordinates: feature?.geometry?.coordinates || [],
    }));
    return routeResult(candidates, points);
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}

async function routeViaOSRM(points: LatLng[], withAlternatives = true): Promise<RouteResult | null> {
  const timeout = requestSignal(12000);
  try {
    const coords = points.map(p => p[1] + ',' + p[0]).join(';');
    const alternatives = withAlternatives ? 3 : 'false';
    const response = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?alternatives=${alternatives}&overview=full&geometries=geojson`, { signal: timeout.signal });
    const data = await response.json();
    if (!response.ok || data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) return null;
    const candidates = data.routes.map((route: any) => ({
      distance: Number(route.distance),
      duration: Number(route.duration),
      coordinates: route.geometry?.coordinates || [],
    }));
    return routeResult(candidates, points);
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}

export async function getRoute(points: LatLng[], options: RouteRequestOptions = {}): Promise<RouteResult> {
  const coordinatesKey = points.map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join(';');
  const key = `${coordinatesKey}|${options.alternatives ? 'alternatives' : 'single'}|${options.preference || 'default'}`;
  if (cache[key]) return cache[key];

  if (ORS_API_KEY) {
    const primary = await routeViaORS(points, options);
    if (primary) { cache[key] = primary; return primary; }
    // بدائل ORS قد لا تتوفر لبعض المسافات؛ جرّب مسارًا واحدًا بالتفضيل نفسه قبل الخدمة الاحتياطية.
    if (options.alternatives) {
      const single = await routeViaORS(points, { preference: options.preference });
      if (single) { cache[key] = single; return single; }
    }
  }
  const fallback = await routeViaOSRM(points, options.alternatives === true);
  if (fallback) { cache[key] = fallback; return fallback; }
  if (options.alternatives) {
    const singleFallback = await routeViaOSRM(points, false);
    if (singleFallback) { cache[key] = singleFallback; return singleFallback; }
  }
  return { ok: false };
}

export const fmtMin = (m: number) => { m = Math.round(m); return m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60} د`; };

// مسافات الطريق لطلب: من موقع السائق إلى أول نقطة + مسار الطلب كاملاً
// محاولة واحدة فقط لكل طلب (لا إعادة عند الفشل)
export type OrderDist = { toMe?: number; tripKm?: number; tripMin?: number; fail?: boolean };
export async function orderDistances(me: LatLng | null, pts: LatLng[]): Promise<OrderDist> {
  const clean = pts.filter(p => p && isFinite(p[0]) && isFinite(p[1]));
  if (!clean.length) return { fail: true };
  const [a, b] = await Promise.all([
    me ? getRoute([me, clean[0]]) : Promise.resolve({ ok: false } as RouteResult),
    clean.length > 1 ? getRoute(clean) : Promise.resolve({ ok: false } as RouteResult),
  ]);
  const out: OrderDist = {};
  if (a.ok) out.toMe = a.km;
  if (b.ok) { out.tripKm = b.km; out.tripMin = b.min; }
  if (!a.ok && !b.ok) out.fail = true;
  return out;
}
export const fmtKm = (km?: number) => (km == null ? '—' : km < 1 ? `${Math.round(km * 1000)} م` : `${km.toFixed(1)} كم`);

// زمن الوصول على الطريق؛ عند فشل خدمة المصفوفة الأساسية تُجرَّب مصفوفة OSRM.
export async function etaToPoint(from: LatLng[], to: LatLng): Promise<(number | null)[]> {
  if (!from.length) return [];
  if (ORS_API_KEY) {
    try {
      const values = await orsMatrix([to, ...from], from.map((_, i) => i + 1), [0], 'duration');
      const result = from.map((_, i) => values?.[i]?.[0] == null ? null : Number(values[i][0]) / 60);
      if (result.every(v => v != null && Number.isFinite(v))) return result;
    } catch { /* try the OSRM fallback below */ }
  }
  const coords = [to, ...from].map(p => p[1] + ',' + p[0]).join(';');
  const src = from.map((_, i) => i + 1).join(';');
  const timeout = requestSignal();
  try {
    const response = await fetch(`${OSRM_URL}/table/v1/driving/${coords}?sources=${src}&destinations=0`, { signal: timeout.signal });
    const data = await response.json();
    if (!response.ok || data.code !== 'Ok' || !Array.isArray(data.durations)) throw new Error('no table');
    return data.durations.map((row: (number | null)[]) => row?.[0] == null ? null : row[0] / 60);
  } catch {
    return from.map(() => null);
  } finally {
    timeout.clear();
  }
}

// مسافات الطريق من نقطة واحدة إلى عدة وجهات.
export async function roadKmFrom(origin: LatLng, to: LatLng[]): Promise<(number | null)[]> {
  if (!to.length) return [];
  if (ORS_API_KEY) {
    try {
      const values = await orsMatrix([origin, ...to], [0], to.map((_, i) => i + 1), 'distance');
      const result = to.map((_, i) => values?.[0]?.[i] == null ? null : Number(values[0][i]) / 1000);
      if (result.every(v => v != null && Number.isFinite(v))) return result;
    } catch { /* try the OSRM fallback below */ }
  }
  const coords = [origin, ...to].map(p => p[1] + ',' + p[0]).join(';');
  const dst = to.map((_, i) => i + 1).join(';');
  const timeout = requestSignal();
  try {
    const response = await fetch(`${OSRM_URL}/table/v1/driving/${coords}?sources=0&destinations=${dst}&annotations=distance`, { signal: timeout.signal });
    const data = await response.json();
    if (!response.ok || data.code !== 'Ok' || !Array.isArray(data.distances?.[0])) throw new Error('no table');
    return data.distances[0].map((distance: number | null) => distance == null ? null : distance / 1000);
  } catch {
    return to.map(() => null);
  } finally {
    timeout.clear();
  }
}
