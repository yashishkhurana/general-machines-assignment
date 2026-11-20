// Height plane (Reg. 55 cl. 44): height at a point ≤ 2 × horizontal distance to the far boundary of the road.
// With several roads the tool takes the strictest road at every point (logged deviation from the
// nearest-road wording; it is equal or stricter).
import earcut from 'earcut';
import { clean, difference, mpArea, pointSegDist, segmentBuffer, union, type MultiPoly, type Pt } from './geom';
import { rule } from './rules';
import type { Site } from './types';

export function planeHeightAt(site: Site, p: Pt): number {
  let h = Infinity;
  for (const r of site.roads) h = Math.min(h, rule('height.plane') * pointSegDist(p, r.farA, r.farB));
  return h;
}

/** Part of `base` where the plane is at least z high. */
export function underPlane(site: Site, base: MultiPoly, z: number): MultiPoly {
  if (!base.length || !site.roads.length) return base;
  const r = z / rule('height.plane');
  // quick exit: if every vertex is further than r from every far line, nothing is cut
  let minD = Infinity;
  for (const poly of base) for (const ring of poly) for (const p of ring) {
    for (const road of site.roads) minD = Math.min(minD, pointSegDist(p, road.farA, road.farB));
  }
  if (minD >= r) return base;
  const cutter = union(...site.roads.map((road) => segmentBuffer(road.farA, road.farB, r)));
  return clean(difference(base, cutter), 0.5);
}

export const underPlaneArea = (site: Site, base: MultiPoly, z: number) => mpArea(underPlane(site, base, z));

/** Highest point of the plane over a footprint, and the lowest (at the road-side edge). */
export function planeRange(site: Site, mp: MultiPoly): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const poly of mp) for (const p of poly[0]) {
    const h = planeHeightAt(site, p);
    min = Math.min(min, h); max = Math.max(max, h);
  }
  return { min, max };
}

// ---- Mesh for display ---------------------------------------------------------------------------

export interface Mesh { positions: number[]; indices: number[]; maxZ: number; minTopZ: number }

/** Envelope solid over a footprint: top at min(height plane, cap), walls down to the ground.
 *  Triangles are subdivided to at most `maxEdge` metres so the min-of-planes top (several roads, the
 *  low-rise cap) is followed closely. */
export function envelopeMesh(site: Site, fp: MultiPoly, cap = Infinity, maxEdge = 3, maxTris = 60000): Mesh {
  const positions: number[] = [], indices: number[] = [];
  let maxZ = 0, minTopZ = Infinity;
  const top = (p: Pt) => Math.min(planeHeightAt(site, p), cap);
  const vert = (x: number, y: number, z: number) => { positions.push(x, y, z); return positions.length / 3 - 1; };
  const area = mpArea(fp);
  // scale the subdivision so the mesh stays inside the triangle budget on huge plots
  const edge = Math.max(maxEdge, Math.sqrt((4 * area) / maxTris));
  for (const poly of fp) {
    const flat: number[] = [], holes: number[] = [];
    poly.forEach((ring, ri) => {
      if (ri > 0) holes.push(flat.length / 2);
      for (let i = 0; i < ring.length - 1; i++) flat.push(ring[i][0], ring[i][1]);
    });
    const tri = earcut(flat, holes, 2);
    const P = (i: number): Pt => [flat[2 * i], flat[2 * i + 1]];
    const emit = (a: Pt, b: Pt, c: Pt, depth: number) => {
      const l = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
      if (l > edge && depth < 10) {
        const ab: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc: Pt = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca: Pt = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
        emit(a, ab, ca, depth + 1); emit(ab, b, bc, depth + 1); emit(ca, bc, c, depth + 1); emit(ab, bc, ca, depth + 1);
        return;
      }
      const za = top(a), zb = top(b), zc = top(c);
      maxZ = Math.max(maxZ, za, zb, zc); minTopZ = Math.min(minTopZ, za, zb, zc);
      indices.push(vert(a[0], a[1], za), vert(b[0], b[1], zb), vert(c[0], c[1], zc));
    };
    for (let i = 0; i < tri.length; i += 3) emit(P(tri[i]), P(tri[i + 1]), P(tri[i + 2]), 0);
    // walls
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i], b = ring[i + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.ceil(L / edge));
        for (let k = 0; k < n; k++) {
          const p: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
          const q: Pt = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
          const p0 = vert(p[0], p[1], 0), q0 = vert(q[0], q[1], 0), p1 = vert(p[0], p[1], top(p)), q1 = vert(q[0], q[1], top(q));
          indices.push(p0, q0, q1, p0, q1, p1);
        }
      }
    }
  }
  return { positions, indices, maxZ, minTopZ: Number.isFinite(minTopZ) ? minTopZ : 0 };
}
