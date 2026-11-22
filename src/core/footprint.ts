// Buildable footprint per class: plot minus the union of round-capped strips, one per edge, each with that
// edge's setback. Road edges add the widening strip depth, so setbacks start from the planned road line.
import { clean, difference, mpArea, stripsUnion, type MultiPoly } from './geom';
import { rule } from './rules';
import type { Road, Site } from './types';

/** Building line from the road boundary (Reg. 55 cl. 41 = Ordinance cl. 50), for road width W. */
export function buildingLine(W: number, storeys: number, height: number): number {
  if (W < rule('front.narrow.road')) return Math.max(0, rule('front.narrow.dist') - W / 2);
  const tall = storeys > rule('front.tier.storeys') || height > rule('front.tier.height');
  if (!tall) return 0;
  if (W < rule('front.tier1.road')) return Math.max(0, rule('front.tier1.dist') - W / 2);
  if (W < rule('front.tier3.road')) return W * rule('front.tier2.factor');
  return rule('front.tier3.dist');
}

/** Clear space all round (Ordinance cl. 55). */
export const clearAround = (height: number) => (height > rule('clear.height') ? rule('clear.high') : rule('clear.low'));

/** Distance for walls with openings (Ordinance cl. 54, by storeys or height). */
export const sideSetback = (storeys: number, height: number) =>
  storeys > rule('side.storeys') || height > rule('side.height') ? rule('side.high') : rule('side.low');

export const highRiseFront = (road: Road) => Math.max(rule('hr.setback'), buildingLine(road.width, 99, 99));
export const lowRiseFront = (road: Road, storeys: number, height: number) =>
  Math.max(buildingLine(road.width, storeys, height), clearAround(height));

export interface Footprint {
  mp: MultiPoly;
  area: number;
  setbacks: { edge: number; road: boolean; setback: number; strip: number; side?: boolean }[];
}

function cut(site: Site, setbackFor: (edge: number, road: Road | undefined) => number, sides?: Set<number>): Footprint {
  const n = site.ring.length;
  const segs = [], setbacks = [];
  for (let i = 0; i < n; i++) {
    const road = site.roads.find((r) => r.edge === i);
    const sb = setbackFor(i, road);
    const strip = road?.strip ?? 0;
    segs.push({ a: site.ring[i], b: site.ring[(i + 1) % n], r: sb + strip });
    setbacks.push({ edge: i, road: !!road, setback: sb, strip, ...(sides ? { side: sides.has(i) } : {}) });
  }
  const mp = clean(difference(site.netMP, stripsUnion(segs)), 0.5);
  return { mp, area: mpArea(mp), setbacks };
}

export function highRiseFootprint(site: Site): Footprint {
  return cut(site, (_i, road) => (road ? highRiseFront(road) : rule('hr.setback')));
}

export function lowRiseFootprint(site: Site, storeys: number, height: number): Footprint {
  return cut(site, (_i, road) => (road ? lowRiseFront(road, storeys, height) : Math.max(sideSetback(storeys, height), clearAround(height))));
}

/** Side edges for the blank-wall layout: non-road edges whose direction is within 45° of perpendicular to the
 *  main road edge (the longest frontage). On a rectangle these are the two edges between the road and the rear;
 *  edges closer to parallel with the road (the rear) are not sides. */
export function sideEdges(site: Site): Set<number> {
  const out = new Set<number>();
  const main = [...site.roads].sort((a, b) => b.frontage - a.frontage)[0];
  if (!main) return out;
  const n = site.ring.length;
  const rd = [main.b[0] - main.a[0], main.b[1] - main.a[1]], rl = Math.hypot(rd[0], rd[1]);
  for (let i = 0; i < n; i++) {
    if (site.roadEdgeSet.has(i)) continue;
    const a = site.ring[i], b = site.ring[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9 || rl < 1e-9) continue;
    const cos = Math.abs(((b[0] - a[0]) * rd[0] + (b[1] - a[1]) * rd[1]) / (L * rl));
    if (cos <= Math.SQRT1_2 + 1e-9) out.add(i); // angle to the road edge between 45° and 135°
  }
  return out;
}

/** Low-rise block with blank (windowless) side walls: sides keep only the Ordinance cl. 55 clear space; the road
 *  and rear edges keep the low-rise rules (walls with openings, cl. 54 / Reg. 55 cl. 50). */
export function lowRiseBlankFootprint(site: Site, storeys: number, height: number, sides: Set<number>): Footprint {
  return cut(site, (i, road) => (road ? lowRiseFront(road, storeys, height)
    : sides.has(i) ? clearAround(height) : Math.max(sideSetback(storeys, height), clearAround(height))), sides);
}
