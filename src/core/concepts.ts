// Two concept generators. Both add floors until the first limit binds: permitted floor area, the class cap,
// the height plane, open space, or parking. Parking counts toward floor area.
import { clean, intersection, mpArea, mpBounds, mpPerimeter, offsetRight, stripsUnion, union, difference, segmentBuffer, type MultiPoly, type Pt } from './geom';
import { classify, type Availability, type BuildingClass } from './classify';
import { underPlane } from './envelope';
import { highRiseFootprint, lowRiseFootprint, type Footprint } from './footprint';
import { openSpaceRequired, parkingAreaPerSpace, parkingNeed, type OpenSpaceReq, type ParkingNeed } from './metrics';
import { rule } from './rules';
import { FAR_EXTENSION } from './site';
import type { Settings, Site } from './types';

export type FloorUse = 'residential' | 'parking' | 'basement parking';
export interface Floor {
  level: string; // "1".."N" above ground, "B1".. below
  use: FloorUse;
  plate: MultiPoly;
  area: number;
  z0: number;
  z1: number;
  running: number;
  spaces: number;
}

export interface Concept {
  id: 'A' | 'B';
  title: string;
  kind: 'tower' | 'low-rise basement' | 'low-rise podium';
  ok: boolean; // produced a building
  reason: string | null; // why not, if !ok
  floors: Floor[];
  total: number;
  residential: number;
  parkingArea: number;
  cap: number;
  capLabel: string;
  roofDeck: number;
  storeys: number;
  basements: number;
  cls: BuildingClass;
  parking: ParkingNeed & { provided: number; areaPerSpace: number };
  openSpace: { provided: number; req: OpenSpaceReq; plantedCapacity: number; plantedC: number; groundPlate: MultiPoly; fireRing: MultiPoly | null };
  footprint: Footprint;
  binding: string;
  notes: string[];
  roofPlantOk: boolean | null;
}

const fmt = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Part of `base` within t of any planned road line (keeps the road side, trims the rear). */
function nearRoad(site: Site, base: MultiPoly, t: number): MultiPoly {
  const cutter = union(...site.roads.map((r) => {
    const [a, b] = offsetRight(r.nearA, r.nearB, 0, FAR_EXTENSION);
    return segmentBuffer(a, b, t);
  }));
  return clean(intersection(base, cutter), 0.5);
}

/** Upper bound for the trim depth: the footprint's bounding-box diagonal (any point is within it of a road
 *  line that touches the plot). A per-vertex nearest-road distance fails when roads are on opposite sides. */
function maxDepth(site: Site, base: MultiPoly) {
  const [x0, y0, x1, y1] = mpBounds(base);
  let d = Math.hypot(x1 - x0, y1 - y0);
  for (const r of site.roads) for (const p of [r.nearA, r.nearB]) d = Math.max(d, Math.hypot(p[0] - (x0 + x1) / 2, p[1] - (y0 + y1) / 2) * 2);
  return d + 1;
}

/** Trim a footprint from the rear until its area is at most `target` (binary search on depth from the road). */
export function trimToArea(site: Site, base: MultiPoly, target: number): MultiPoly {
  const full = mpArea(base);
  if (full <= target + 1e-6) return base;
  if (target <= 0 || !site.roads.length) return [];
  let lo = 0, hi = maxDepth(site, base), best: MultiPoly = [];
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2;
    const g = nearRoad(site, base, t);
    if (mpArea(g) <= target) { lo = t; best = g; } else hi = t;
    if (hi - lo < 0.001) break;
  }
  return best;
}

/** Ground plate plus a fire ring of width w round it, clipped to the plot. */
function fireRing(site: Site, plate: MultiPoly, w: number): MultiPoly {
  const segs: { a: Pt; b: Pt; r: number }[] = [];
  for (const poly of plate) for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) segs.push({ a: ring[i], b: ring[i + 1], r: w });
  return clean(intersection(difference(stripsUnion(segs), plate), site.netMP), 0.5);
}

function floorTops(s: Settings, k: number) {
  const z0 = k === 0 ? 0 : s.groundFloor + (k - 1) * s.floorToFloor;
  const z1 = s.groundFloor + k * s.floorToFloor;
  return { z0, z1 };
}

/** Plates for floors 0..max under the height plane (each floor's top plus parapet must clear it). */
function platesUnderPlane(site: Site, base: MultiPoly, s: Settings, maxFloors: number, roofDeckLimit = Infinity) {
  const out: { plate: MultiPoly; area: number; z0: number; z1: number }[] = [];
  let stop = 'floor limit';
  for (let k = 0; k < maxFloors; k++) {
    const { z0, z1 } = floorTops(s, k);
    if (z1 >= roofDeckLimit) { stop = 'roof deck under 23 m (low-rise)'; break; }
    const plate = underPlane(site, base, z1 + rule('a.parapet'));
    const area = mpArea(plate);
    if (area < rule('a.minPlate')) { stop = 'height plane'; break; }
    out.push({ plate, area, z0, z1 });
  }
  return { plates: out, stop };
}

function roofPlantFits(site: Site, top: MultiPoly, roofDeck: number) {
  return mpArea(underPlane(site, top, roofDeck + rule('a.roofPlant'))) >= rule('a.roofPlantArea');
}

// ------------------------------------------------------------------------------------------------
// Concept A: tower on a parking podium (high-rise class)
// ------------------------------------------------------------------------------------------------

export function conceptTower(site: Site, s: Settings, permitted: number, osr: number, avail: Availability): Concept {
  const aps = parkingAreaPerSpace(s);
  const fp = highRiseFootprint(site);
  let cap = permitted, capLabel = 'permitted floor area (zone ratio + bonus)';
  if (avail.floorAreaCap !== null && avail.floorAreaCap < cap) { cap = avail.floorAreaCap; capLabel = 'Reg. 33 cl. 2 cap (road under 18 m)'; }
  const reg33cap = site.netArea * rule('far.cap.reg33');
  if (reg33cap < cap) { cap = reg33cap; capLabel = 'Reg. 33 cl. 5 ratio cap'; }
  const notes: string[] = [];

  const stack = (plate0: MultiPoly) => {
    const { plates, stop } = platesUnderPlane(site, plate0, s, rule('a.maxFloors'));
    let best: ReturnType<typeof build> | null = null;
    function build(P: number) {
      const floors: Floor[] = [];
      let total = 0, residential = 0, parkingArea = 0, spaces = 0, binding = stop;
      for (let k = 0; k < plates.length; k++) {
        const pl = plates[k];
        if (total + pl.area > cap + 1e-6) { binding = capLabel; break; }
        const isPark = k < P;
        const sp = isPark ? Math.floor(pl.area / aps) : 0;
        total += pl.area; spaces += sp;
        if (isPark) parkingArea += pl.area; else residential += pl.area;
        floors.push({ level: String(k + 1), use: isPark ? 'parking' : 'residential', plate: pl.plate, area: pl.area, z0: pl.z0, z1: pl.z1, running: total, spaces: sp });
      }
      const roofDeck = floors.length ? floors[floors.length - 1].z1 : 0;
      const need = parkingNeed(total, residential, roofDeck, s);
      return { floors, total, residential, parkingArea, spaces, binding, roofDeck, need, ok: spaces >= need.needed };
    }
    for (let P = 0; P <= plates.length; P++) {
      const r = build(P);
      if (!best || r.ok || r.residential > 0) best = r;
      if (r.ok) break;
      if (r.residential === 0) break;
    }
    return best!;
  };

  const check = (plate0: MultiPoly) => {
    const st = stack(plate0);
    const maxPlate = Math.max(0, ...st.floors.map((f) => f.area));
    const req = openSpaceRequired(st.total, maxPlate, site.netArea, osr, true);
    const provided = site.netArea - mpArea(plate0);
    const ring = fireRing(site, plate0, rule('hr.fireRoad'));
    const plantedCapacity = provided - mpArea(ring);
    return { st, req, provided, ring, plantedCapacity, ok: provided >= req.governing - 1e-6 && plantedCapacity >= req.plantedB - 1e-6 };
  };

  if (fp.area < rule('a.minPlate')) return emptyConcept('A', 'Tower on podium', 'tower', fp, `High-rise setbacks (6 m all round) leave ${fmt(fp.area)} m², under the ${rule('a.minPlate')} m² smallest usable plate.`, s, site, osr);

  let plate0 = fp.mp;
  let c = check(plate0);
  if (!c.ok) {
    // trim the tower from the rear until open space and the planted half fit outside the fire ring
    let lo = 0, hi = fp.area, bestPlate: MultiPoly | null = null, bestC = c;
    for (let i = 0; i < 14; i++) {
      const target = (lo + hi) / 2;
      const p = trimToArea(site, fp.mp, target);
      const ci = check(p);
      if (ci.ok) { lo = target; bestPlate = p; bestC = ci; } else hi = target;
      if (hi - lo < 5) break;
    }
    if (bestPlate && mpArea(bestPlate) >= rule('a.minPlate')) {
      notes.push(`Tower plate trimmed from ${fmt(fp.area)} to ${fmt(mpArea(bestPlate))} m² so the open space and its planted half fit outside the 6 m fire ring.`);
      plate0 = bestPlate; c = bestC;
    } else {
      notes.push('No tower plate leaves enough open space and planted ground outside the 6 m fire ring.');
    }
  }
  const st = c.st;
  const cls = classify(st.total, st.roofDeck, Math.max(0, ...st.floors.map((f) => f.area)));
  let binding = st.binding;
  if (!c.ok) binding = 'open space';
  else if (!st.ok) binding = 'parking';
  if (!cls.highRise && !cls.extraLarge) notes.push('This result is neither high-rise nor extra-large, so the 6 m high-rise setbacks are stricter than it needs.');
  const top = st.floors[st.floors.length - 1];
  return {
    id: 'A', title: 'Tower on podium', kind: 'tower', ok: st.floors.length > 0, reason: st.floors.length ? null : 'No floor fits.',
    floors: st.floors, total: st.total, residential: st.residential, parkingArea: st.parkingArea, cap, capLabel,
    roofDeck: st.roofDeck, storeys: st.floors.length, basements: 0, cls,
    parking: { ...st.need, provided: st.spaces, areaPerSpace: aps },
    openSpace: { provided: c.provided, req: c.req, plantedCapacity: c.plantedCapacity, plantedC: c.provided * rule('planted.share'), groundPlate: plate0, fireRing: c.ring },
    footprint: fp, binding, notes, roofPlantOk: top ? roofPlantFits(site, top.plate, top.z1) : null,
  };
}

// ------------------------------------------------------------------------------------------------
// Concept B: low-rise block (under 23 m roof deck and under 10,000 m² in total, parking included)
// ------------------------------------------------------------------------------------------------

export function conceptLowRise(site: Site, s: Settings, permitted: number, osr: number, mode: 'basement' | 'podium', id: 'A' | 'B' = 'B'): Concept {
  const aps = parkingAreaPerSpace(s);
  const hrLimit = rule('class.highrise.height');
  const xl = rule('class.extralarge.area');
  const fpCache = new Map<string, Footprint>();
  const trimCache = new Map<string, MultiPoly>();
  const notes: string[] = [];
  let skippedXL = false;
  type Cand = { N: number; K: number; floors: Floor[]; total: number; residential: number; parkingArea: number; spaces: number; need: ParkingNeed; roofDeck: number; fp: Footprint; plate0: MultiPoly; req: OpenSpaceReq; ok: boolean; binding: string };
  let best: Cand | null = null, bestAny: Cand | null = null;
  let lastFp: Footprint | null = null;
  let heightStop = false;

  for (let N = 1; N <= 12; N++) {
    const roofDeck = floorTops(s, N - 1).z1;
    if (roofDeck >= hrLimit) break;
    const fp = (() => {
      const k = `${N > rule('side.storeys') || roofDeck > rule('side.height')}|${roofDeck > rule('clear.height')}|${N > rule('front.tier.storeys') || roofDeck > rule('front.tier.height')}`;
      if (!fpCache.has(k)) fpCache.set(k, lowRiseFootprint(site, N, roofDeck));
      return fpCache.get(k)!;
    })();
    lastFp = fp;
    if (fp.area < rule('a.minPlate')) break;
    const maxK = mode === 'basement' ? 4 : N - 1;
    // the plate is the largest open space allows; it is only shrunk when one such floor alone would break
    // the 10,000 m² low-rise limit or the permitted floor area (huge plots)
    const fullPlate = Math.min(fp.area, site.netArea * (1 - rule('os.ord52')), site.netArea / (1 + rule('os.reg55')));
    for (let K = 0; K <= maxK; K++) {
      const storeysTotal = mode === 'basement' ? N + K : N;
      const capArea = Math.min(fp.area, site.netArea * (1 - rule('os.ord52')), site.netArea / (1 + rule('os.reg55')), site.netArea / (1 + osr * storeysTotal), fullPlate >= xl ? (xl - 1) / storeysTotal : Infinity, fullPlate > permitted ? permitted / storeysTotal : Infinity);
      const key = `${fp.area.toFixed(2)}|${capArea.toFixed(1)}`;
      if (!trimCache.has(key)) trimCache.set(key, trimToArea(site, fp.mp, capArea));
      const plate0 = trimCache.get(key)!;
      const a0 = mpArea(plate0);
      if (a0 < rule('a.minPlate')) continue;
      const floors: Floor[] = [];
      let total = 0, residential = 0, parkingArea = 0, spaces = 0, failed = false;
      for (let k = 0; k < N; k++) {
        const { z0, z1 } = floorTops(s, k);
        const plate = underPlane(site, plate0, z1 + rule('a.parapet'));
        const area = mpArea(plate);
        if (area < rule('a.minPlate')) { failed = true; break; }
        const isPark = mode === 'podium' && k < K;
        const sp = isPark ? Math.floor(area / aps) : 0;
        total += area; spaces += sp;
        if (isPark) parkingArea += area; else residential += area;
        floors.push({ level: String(k + 1), use: isPark ? 'parking' : 'residential', plate, area, z0, z1, running: total, spaces: sp });
      }
      if (failed) { heightStop = true; break; }
      if (mode === 'basement') {
        for (let b = 1; b <= K; b++) {
          const sp = Math.floor(a0 / aps);
          total += a0; spaces += sp; parkingArea += a0;
          floors.unshift({ level: `B${b}`, use: 'basement parking', plate: plate0, area: a0, z0: -b * 3.0, z1: -(b - 1) * 3.0, running: total, spaces: sp });
        }
        // running totals in table order: basements first
        let run = 0;
        for (const f of floors.sort((x, y) => levelOrder(x.level) - levelOrder(y.level))) { run += f.area; f.running = run; }
      }
      if (total >= xl) { skippedXL = true; continue; }
      if (total > permitted + 1e-6) continue;
      const need = parkingNeed(total, residential, roofDeck, s);
      const req = openSpaceRequired(total, Math.max(...floors.map((f) => f.area)), site.netArea, osr, false);
      const ok = spaces >= need.needed && site.netArea - a0 >= req.governing - 1e-6;
      const cand: Cand = { N, K, floors, total, residential, parkingArea, spaces, need, roofDeck, fp, plate0, req, ok, binding: '' };
      const better = (x: Cand, y: Cand | null) => !y || x.residential > y.residential + 1e-6 || (Math.abs(x.residential - y.residential) <= 1e-6 && x.K < y.K);
      if (ok && better(cand, best)) best = cand;
      if (better(cand, bestAny)) bestAny = cand;
    }
    if (heightStop) break;
  }

  const title = mode === 'basement' ? 'Low-rise block, basement parking' : 'Low-rise block, parking floors';
  const kind = mode === 'basement' ? 'low-rise basement' : 'low-rise podium';
  const pick = best ?? bestAny;
  if (!pick) {
    const why = lastFp && lastFp.area < rule('a.minPlate')
      ? `Low-rise setbacks leave ${fmt(lastFp.area)} m², under the ${rule('a.minPlate')} m² smallest usable plate.`
      : heightStop ? 'The height plane leaves no usable floor.' : 'No low-rise layout fits.';
    return emptyConcept(id, title, kind, lastFp ?? lowRiseFootprint(site, 1, s.groundFloor), why, s, site, osr);
  }
  if (!best) notes.push(`No layout provides enough parking. Shown: the largest layout, which needs ${pick.need.needed} spaces and has ${pick.spaces}.`);
  // what stopped it from going one bigger
  const nextRoof = floorTops(s, pick.N).z1;
  let binding: string;
  if (!best) binding = 'parking';
  else if (skippedXL) binding = 'under 10,000 m² in total (would become extra-large)';
  else if (nextRoof >= hrLimit) binding = 'roof deck under 23 m';
  else if (heightStop) binding = 'height plane';
  else binding = 'parking';
  if (skippedXL) notes.push('Simplification: the generator drops a floor (or a basement) rather than redesign when the next one would take the total to 10,000 m² and make the building extra-large.');
  const cls = classify(pick.total, pick.roofDeck, Math.max(...pick.floors.map((f) => f.area)));
  const top = pick.floors.filter((f) => !f.level.startsWith('B')).slice(-1)[0];
  const provided = site.netArea - mpArea(pick.plate0);
  return {
    id, title, kind, ok: true, reason: null, floors: pick.floors, total: pick.total, residential: pick.residential, parkingArea: pick.parkingArea,
    cap: Math.min(permitted, xl), capLabel: permitted < xl ? 'permitted floor area' : 'under 10,000 m² (low-rise)',
    roofDeck: pick.roofDeck, storeys: pick.N, basements: mode === 'basement' ? pick.K : 0, cls,
    parking: { ...pick.need, provided: pick.spaces, areaPerSpace: aps },
    openSpace: { provided, req: pick.req, plantedCapacity: provided, plantedC: provided * rule('planted.share'), groundPlate: pick.plate0, fireRing: null },
    footprint: pick.fp, binding, notes, roofPlantOk: top ? roofPlantFits(site, top.plate, top.z1) : null,
  };
}

const levelOrder = (l: string) => (l.startsWith('B') ? -Number(l.slice(1)) : Number(l));

function emptyConcept(id: 'A' | 'B', title: string, kind: Concept['kind'], fp: Footprint, reason: string, s: Settings, site: Site, osr: number): Concept {
  return {
    id, title, kind, ok: false, reason, floors: [], total: 0, residential: 0, parkingArea: 0, cap: 0, capLabel: '', roofDeck: 0, storeys: 0, basements: 0,
    cls: classify(0, 0), parking: { ...parkingNeed(0, 0, 0, s), provided: 0, areaPerSpace: parkingAreaPerSpace(s) },
    openSpace: { provided: site.netArea, req: openSpaceRequired(0, 0, site.netArea, osr, false), plantedCapacity: site.netArea, plantedC: 0, groundPlate: [], fireRing: null },
    footprint: fp, binding: 'none', notes: [], roofPlantOk: null,
  };
}

export const perimeterOf = mpPerimeter;
