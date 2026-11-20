// Pure geometry in local metres (x east, y north). Polygon booleans via polygon-clipping.
import pc from 'polygon-clipping';
import { rule } from './rules';

export type Pt = [number, number];
export type Ring = Pt[]; // open ring: last point is NOT a repeat of the first
export type MultiPoly = Pt[][][]; // polygon-clipping MultiPolygon (closed rings)

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export const ringArea = (r: Ring) => Math.abs(signedArea(r));
export const ccw = (r: Ring): Ring => (signedArea(r) < 0 ? [...r].reverse() : r);

export function close(r: Ring): Pt[] {
  return r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r;
}

export function mpArea(mp: MultiPoly): number {
  let a = 0;
  for (const poly of mp) {
    poly.forEach((ring, i) => {
      const open = ring.slice(0, -1) as Ring;
      a += (i === 0 ? 1 : -1) * ringArea(open);
    });
  }
  return a;
}

export const toMP = (r: Ring): MultiPoly => [[close(r)]];

export function union(...gs: MultiPoly[]): MultiPoly {
  const xs = gs.filter((g) => g.length);
  if (!xs.length) return [];
  if (xs.length === 1) return xs[0];
  return pc.union(xs[0] as any, ...(xs.slice(1) as any)) as MultiPoly;
}
export function difference(a: MultiPoly, ...bs: MultiPoly[]): MultiPoly {
  const xs = bs.filter((g) => g.length);
  if (!a.length) return [];
  if (!xs.length) return a;
  return pc.difference(a as any, ...(xs as any)) as MultiPoly;
}
export function intersection(a: MultiPoly, b: MultiPoly): MultiPoly {
  if (!a.length || !b.length) return [];
  return pc.intersection(a as any, b as any) as MultiPoly;
}

/** Minkowski buffer of segment a-b by radius r: a rectangle plus round caps, as one polygon. */
export function segmentBuffer(a: Pt, b: Pt, r: number): MultiPoly {
  if (r <= 0) return [];
  const L = dist(a, b);
  const q = Math.round(rule('a.circleSegs'));
  const ang = L > 1e-9 ? Math.atan2(b[1] - a[1], b[0] - a[0]) : 0;
  const pts: Pt[] = [];
  // cap around b: from ang - 90° to ang + 90°
  for (let i = 0; i <= 2 * q; i++) {
    const t = ang - Math.PI / 2 + (i * Math.PI) / (2 * q);
    pts.push([b[0] + r * Math.cos(t), b[1] + r * Math.sin(t)]);
  }
  for (let i = 0; i <= 2 * q; i++) {
    const t = ang + Math.PI / 2 + (i * Math.PI) / (2 * q);
    pts.push([a[0] + r * Math.cos(t), a[1] + r * Math.sin(t)]);
  }
  return [[close(pts)]];
}

/** Rectangle on the left of a->b (interior side for a CCW ring), depth d, extended by `ext` past both ends. */
export function bandLeft(a: Pt, b: Pt, d: number, ext = 0): MultiPoly {
  if (d <= 0) return [];
  const L = dist(a, b);
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const nx = -uy, ny = ux;
  const a2: Pt = [a[0] - ux * ext, a[1] - uy * ext];
  const b2: Pt = [b[0] + ux * ext, b[1] + uy * ext];
  return [[close([a2, b2, [b2[0] + nx * d, b2[1] + ny * d], [a2[0] + nx * d, a2[1] + ny * d]])]];
}

function rect(a: Pt, b: Pt, r: number): MultiPoly {
  const L = dist(a, b);
  if (L < 1e-9) return [];
  const nx = (-(b[1] - a[1]) / L) * r, ny = ((b[0] - a[0]) / L) * r;
  return [[close([[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]])]];
}

/** Disc of radius r as a polygon whose vertices are rotated half a step, so they never coincide with the
 *  corners of the edge rectangles meeting at the same point (keeps the sweep-line booleans robust). */
function disc(c: Pt, r: number, phase = 0): MultiPoly {
  const n = 4 * Math.round(rule('a.circleSegs'));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = phase + ((i + 0.5) * 2 * Math.PI) / n;
    pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
  }
  return [[close(pts)]];
}

/** Union of round-capped strips, one per segment, each with its own radius. Built as edge rectangles plus
 *  one disc per distinct endpoint (radius = largest strip meeting there): the same shape as the union of
 *  segment buffers, without duplicate caps at shared corners. */
export function stripsUnion(segs: { a: Pt; b: Pt; r: number }[]): MultiPoly {
  const live = segs.filter((s) => s.r > 0);
  const discs = new Map<string, { c: Pt; r: number }>();
  const key = (p: Pt) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  for (const s of live) for (const p of [s.a, s.b]) {
    const k = key(p), d = discs.get(k);
    if (!d || d.r < s.r) discs.set(k, { c: p, r: s.r });
  }
  const parts: MultiPoly[] = live.map((s) => rect(s.a, s.b, s.r));
  let i = 0;
  for (const d of discs.values()) parts.push(disc(d.c, d.r, 0.0137 * i++));
  // union incrementally: a long single n-ary union is where polygon-clipping is least robust
  let acc: MultiPoly = [];
  for (const p of parts) acc = acc.length ? (pc.union(acc as any, p as any) as MultiPoly) : p;
  return acc;
}

export function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Offset segment a->b by d to its right (outside a CCW ring), extended by ext past both ends. */
export function offsetRight(a: Pt, b: Pt, d: number, ext = 0): [Pt, Pt] {
  const L = dist(a, b);
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const nx = uy, ny = -ux;
  return [
    [a[0] - ux * ext + nx * d, a[1] - uy * ext + ny * d],
    [b[0] + ux * ext + nx * d, b[1] + uy * ext + ny * d],
  ];
}

function segsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True if any two non-adjacent edges of the ring cross. */
export function selfIntersects(r: Ring): boolean {
  const n = r.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segsCross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function mpBounds(mp: MultiPoly): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of mp) for (const p of poly[0]) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  return [x0, y0, x1, y1];
}

export function mpPerimeter(mp: MultiPoly): number {
  let s = 0;
  for (const poly of mp) for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) s += dist(ring[i], ring[i + 1]);
  return s;
}

export function pointInRing(p: Pt, ring: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function pointInMP(p: Pt, mp: MultiPoly): boolean {
  for (const poly of mp) {
    if (!pointInRing(p, poly[0])) continue;
    if (poly.slice(1).some((h) => pointInRing(p, h))) continue;
    return true;
  }
  return false;
}

/** Drop tiny fragments that booleans can leave behind. */
export function clean(mp: MultiPoly, minArea = 0.05): MultiPoly {
  return mp.filter((poly) => ringArea(poly[0].slice(0, -1) as Ring) > minArea);
}
