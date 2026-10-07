import Constants from 'expo-constants';

// توجيه الطرق عبر OpenRouteService عند تهيئة المفتاح؛ OSRM العام يبقى بديلاً للتطوير فقط.
export type LatLng = number[];
export type RouteResult = { ok: true; km: number; min: number; path: { latitude: number; longitude: number }[] } | { ok: false };
const cache: Record<string, RouteResult> = {};
export const OSRM_URL = 'https://router.project-osrm.org';
const ORS_URL = 'https://api.openrouteservice.org/v2';
const ORS_API_KEY = String(Constants.expoConfig?.extra?.orsApiKey || '').trim();

function requestSignal() {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), 15000);
  return { signal: ctrl.signal, clear: () => clearTimeout(tm) };
}

async function orsMatrix(locations: LatLng[], sources: number[], destinations: number[], metric: 'duration' | 'distance') {
  const timeout = requestSignal();
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

export async function getRoute(points: LatLng[]): Promise<RouteResult> {
  const key = points.map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join(';');
  if (cache[key]) return cache[key];
  const timeout = requestSignal();
  try {
    let distance: number;
    let duration: number;
    let coordinates: number[][];

    if (ORS_API_KEY) {
      const response = await fetch(`${ORS_URL}/directions/driving-car/geojson`, {
        method: 'POST',
        headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json', Accept: 'application/geo+json, application/json' },
        body: JSON.stringify({ coordinates: points.map(p => [p[1], p[0]]), instructions: false }),
        signal: timeout.signal,
      });
      const data = await response.json();
      const feature = data.features?.[0];
      const summary = feature?.properties?.summary;
      coordinates = feature?.geometry?.coordinates;
      if (!response.ok || data.error || !summary || !Array.isArray(coordinates)) {
        throw new Error(data.error?.message || `OpenRouteService ${response.status}`);
      }
      distance = Number(summary.distance);
      duration = Number(summary.duration);
    } else {
      const coords = points.map(p => p[1] + ',' + p[0]).join(';');
      const response = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal: timeout.signal });
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('no route');
      const route = data.routes[0];
      distance = Number(route.distance);
      duration = Number(route.duration);
      coordinates = route.geometry.coordinates;
    }

    if (!Number.isFinite(distance) || !Number.isFinite(duration) || !coordinates?.length) throw new Error('invalid route');
    const result: RouteResult = {
      ok: true,
      km: distance / 1000,
      min: duration / 60,
      path: coordinates.map((coordinate: number[]) => ({ latitude: coordinate[1], longitude: coordinate[0] })),
    };
    cache[key] = result;
    return result;
  } catch {
    return { ok: false };
  } finally {
    timeout.clear();
  }
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

// مدة الوصول على الطريق من عدة سيارات إلى نقطة واحدة عبر Matrix.
export async function etaToPoint(from: LatLng[], to: LatLng): Promise<(number | null)[]> {
  if (!from.length) return [];
  if (ORS_API_KEY) {
    try {
      const values = await orsMatrix([to, ...from], from.map((_, i) => i + 1), [0], 'duration');
      return from.map((_, i) => values?.[i]?.[0] == null ? null : values[i][0] / 60);
    } catch {
      return from.map(() => null);
    }
  }
  const coords = [to, ...from].map(p => p[1] + ',' + p[0]).join(';');
  const src = from.map((_, i) => i + 1).join(';');
  const timeout = requestSignal();
  try {
    const response = await fetch(`${OSRM_URL}/table/v1/driving/${coords}?sources=${src}&destinations=0`, { signal: timeout.signal });
    const data = await response.json();
    if (data.code !== 'Ok') throw new Error('no table');
    return data.durations.map((row: (number | null)[]) => row[0] == null ? null : row[0] / 60);
  } catch {
    return from.map(() => null);
  } finally {
    timeout.clear();
  }
}

// مسافة الطريق (كم) من نقطة واحدة إلى عدة نقاط — طلب Matrix واحد فقط.
export async function roadKmFrom(origin: LatLng, to: LatLng[]): Promise<(number | null)[]> {
  if (!to.length) return [];
  if (ORS_API_KEY) {
    try {
      const values = await orsMatrix([origin, ...to], [0], to.map((_, i) => i + 1), 'distance');
      return to.map((_, i) => values?.[0]?.[i] == null ? null : values[0][i] / 1000);
    } catch {
      return to.map(() => null);
    }
  }
  const coords = [origin, ...to].map(p => p[1] + ',' + p[0]).join(';');
  const dst = to.map((_, i) => i + 1).join(';');
  const timeout = requestSignal();
  try {
    const response = await fetch(`${OSRM_URL}/table/v1/driving/${coords}?sources=0&destinations=${dst}&annotations=distance`, { signal: timeout.signal });
    const data = await response.json();
    if (data.code !== 'Ok') throw new Error('no table');
    return data.distances[0].map((distance: number | null) => distance == null ? null : distance / 1000);
  } catch {
    return to.map(() => null);
  } finally {
    timeout.clear();
  }
}
