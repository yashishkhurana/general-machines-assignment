// Height plane (Reg. 55 cl. 44): height at a point ≤ 2 × horizontal distance to the far boundary of the road.
// With several roads the tool takes the strictest road at every point (logged deviation from the
// nearest-road wording; it is equal or stricter).
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
