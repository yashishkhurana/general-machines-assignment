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
  setbacks: { edge: number; road: boolean; setback: number; strip: number }[];
}

function cut(site: Site, setbackFor: (edge: number, road: Road | undefined) => number): Footprint {
  const n = site.ring.length;
  const segs = [], setbacks = [];
  for (let i = 0; i < n; i++) {
    const road = site.roads.find((r) => r.edge === i);
    const sb = setbackFor(i, road);
    const strip = road?.strip ?? 0;
    segs.push({ a: site.ring[i], b: site.ring[(i + 1) % n], r: sb + strip });
    setbacks.push({ edge: i, road: !!road, setback: sb, strip });
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
