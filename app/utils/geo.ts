// أقرب نقطة على المسار: المسافة (كم) + الموقع على طول المسار (لمعرفة اتجاه الركوب/النزول)
export const NEAR_KM = 1.0; // ضمن هذا البعد عن المسار → إضافة فورية
export function nearestOnPath(p: number[], path: number[][]): { km: number; along: number } {
  const k = Math.cos((p[0] * Math.PI) / 180);
  const X = (q: number[]) => [q[1] * 111.32 * k, q[0] * 110.574];
  const P = X(p);
  let best = { km: Infinity, along: 0 };
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const A = X(path[i]), B = X(path[i + 1]);
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const L2 = dx * dx + dy * dy, seg = Math.sqrt(L2);
    let t = L2 ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
    if (d < best.km) best = { km: d, along: acc + t * seg };
    acc += seg;
  }
  return best;
}
