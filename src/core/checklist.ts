// Pass/fail per rule for a concept, with the clause and the numbers behind it.
import type { Availability } from './classify';
import type { Concept } from './concepts';
import { dist, mpPerimeter, pointSegDist, type MultiPoly } from './geom';
import { fmtVs } from './format';
import { RULES, rule, type RuleId } from './rules';
import type { Settings, Site } from './types';

export type Status = 'pass' | 'fail' | 'warn' | 'info';
export interface CheckItem {
  id: string;
  label: string;
  status: Status;
  required: string;
  provided: string;
  clause: string;
  rules: RuleId[];
}

const n0 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 0 });
const n1 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pf = (b: boolean): Status => (b ? 'pass' : 'fail');

/** Ordinance cl. 53: length of the building face that looks onto the road and lies within 20 m of it. */
export function roadFace(site: Site, plate: MultiPoly) {
  const within = rule('face.within');
  let face = 0;
  for (const poly of plate) {
    const ring = poly[0];
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      const L = dist(a, b);
      if (L < 1e-6) continue;
      // outward normal of a CCW outer ring is to the right of a->b
      const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const r of site.roads) {
        const d = pointSegDist(mid, r.nearA, r.nearB);
        const rl = dist(r.nearA, r.nearB);
        const toRoad = [(r.nearB[1] - r.nearA[1]) / rl, -(r.nearB[0] - r.nearA[0]) / rl]; // outward of plot
        if (d <= within && nx * toRoad[0] + ny * toRoad[1] > 0.7) { face += L; break; }
      }
    }
  }
  const perimeter = mpPerimeter(plate.map((poly) => [poly[0]]));
  return { face, perimeter };
}

/** How far a low-rise result sits under the extra-large (10,000 m²) and high-rise (23 m) lines. */
export function lowRiseMargins(c: Concept) {
  return { area: rule('class.extralarge.area') - c.total, height: rule('class.highrise.height') - c.roofDeck };
}

export function checklist(c: Concept, site: Site, avail: Availability, s: Settings, permitted: number, kind: 'tower' | 'low'): CheckItem[] {
  const items: CheckItem[] = [];
  if (!c.ok) return items;
  const push = (i: CheckItem) => items.push(i);

  push({ id: 'far', label: 'Total floor area within the permitted floor area', status: pf(c.total <= permitted + 1e-6), required: `≤ ${n0(permitted)} m²`, provided: `${n0(c.total)} m² (parking ${n0(c.parkingArea)} m² included)`, clause: 'Plan arts. 15–17, 57', rules: ['far.y10', 'bonus.cap'] });

  if (kind === 'tower') {
    push({ id: 'access', label: 'High-rise / extra-large access: 12 m frontage on a road ≥ 10 m, continuing to another road', status: pf(avail.highRise), required: '≥ 12 m frontage, ≥ 10 m right-of-way, continuity', provided: avail.highRise ? `${fmtVs(avail.accessFrontage, rule('access.frontage'))} m frontage, ${fmtVs(avail.accessRoadCurrent, rule('access.road'))} m current right-of-way` : avail.reasons.join(' '), clause: 'Reg. 33 cl. 2', rules: ['access.frontage', 'access.road'] });
    if (c.total > rule('access.big.area')) push({ id: 'access18', label: 'Over 30,000 m²: road at least 18 m', status: pf(avail.accessRoadCurrent >= rule('access.road.big')), required: '≥ 18 m', provided: `${n1(avail.accessRoadCurrent)} m`, clause: 'Reg. 33 cl. 2', rules: ['access.road.big'] });
    push({ id: 'fireStrip', label: 'The 12 m frontage strip stays open up to the building as a fire-engine entrance', status: 'info', required: 'kept clear', provided: 'the 6 m ring and frontage are left clear in this concept', clause: 'Reg. 33 cl. 2 ¶3', rules: ['access.frontage'] });
    push({ id: 'setback6', label: 'Every part above and below ground ≥ 6 m from the boundary and the road', status: 'pass', required: '≥ 6 m', provided: 'footprint cut 6 m in from every edge (road edges from the planned line)', clause: 'Reg. 33 cl. 4', rules: ['hr.setback'] });
    push({ id: 'fireRing', label: '6 m fire-engine road all round, kept clear at ground level', status: 'pass', required: '6 m ring', provided: 'modelled as a clear, paved 6 m ring', clause: 'Reg. 33 cl. 3', rules: ['hr.fireRoad'] });
  } else {
    push({ id: 'lowrise', label: 'Stays low-rise: roof deck under 23 m and total floor area under 10,000 m², parking included', status: pf(c.cls.lowRise), required: '< 23 m and < 10,000 m²', provided: `${n1(c.roofDeck)} m, ${n0(c.total)} m²`, clause: 'Reg. 33 cl. 1', rules: ['class.highrise.height', 'class.extralarge.area'] });
    const m = lowRiseMargins(c);
    const fragile = m.area / rule('class.extralarge.area') < rule('class.extralarge.margin');
    push({ id: 'xlMargin', label: 'Margin under the extra-large line (10,000 m²) and the high-rise line (23 m)', status: fragile ? 'warn' : 'pass', required: `≥ ${n0(rule('class.extralarge.margin') * rule('class.extralarge.area'))} m² to be robust`, provided: `${n0(m.area)} m² (${(100 * m.area / rule('class.extralarge.area')).toFixed(2)}%), ${n1(m.height)} m${fragile ? ': fragile, a survey difference of a fraction of a percent tips it over' : ''}`, clause: 'Reg. 33 cl. 1', rules: ['class.extralarge.area', 'class.extralarge.margin'] });
    const sb = c.footprint.setbacks;
    const front = sb.filter((x) => x.road).map((x) => x.setback);
    const side = sb.filter((x) => !x.road).map((x) => x.setback);
    push({ id: 'front', label: 'Front building line from the planned road boundary', status: 'pass', required: front.length ? `${n1(Math.max(...front))} m (max of cl. 50 and cl. 55)` : '—', provided: 'footprint cut to it', clause: 'Reg. 55 cl. 41; Ordinance cl. 50, 55', rules: ['front.tier2.factor', 'clear.high'] });
    push({ id: 'side', label: 'Walls with openings from side and rear boundaries (openings assumed on every side)', status: 'pass', required: side.length ? `${n1(Math.max(...side))} m` : '—', provided: 'footprint cut to it', clause: 'Ordinance cl. 54; Reg. 55 cl. 50', rules: ['side.low', 'side.high'] });
  }

  push({ id: 'plane', label: 'Every floor plus parapet under the height plane', status: 'pass', required: '≤ 2 × distance to the far road boundary', provided: `plates clipped to the plane (parapet ${rule('a.parapet')} m)`, clause: 'Reg. 55 cl. 44; Ordinance cl. 49', rules: ['height.plane', 'a.parapet'] });
  if (c.roofPlantOk !== null) push({ id: 'roofPlant', label: `Roof plant (${rule('a.roofPlant')} m over ${rule('a.roofPlantArea')} m² of core) under the height plane`, status: c.roofPlantOk ? 'pass' : 'warn', required: 'fits somewhere on the top floor', provided: c.roofPlantOk ? 'fits' : 'does not fit: move plant or drop a floor', clause: 'Reg. 55 cl. 44 (assumed allowance)', rules: ['a.roofPlant'] });

  const os = c.openSpace;
  const req = os.req;
  const rows: [string, number | null, string, RuleId][] = [
    ['Plan open-space ratio × total floor area', req.plan, 'Plan arts. 15–17', 'osr.y10'],
    ['30% of the plot (high-rise / extra-large)', req.reg33, 'Reg. 33 cl. 6', 'os.reg33'],
    ['30% of the plot (residential)', req.ord52, 'Ordinance cl. 52(1)', 'os.ord52'],
    ['30% of the largest floor (residential)', req.reg55, 'Reg. 55 cl. 33', 'os.reg55'],
  ];
  const bindKey = { plan: 0, reg33: 1, ord52: 2, reg55: 3 }[req.binding];
  rows.forEach(([label, v, clause, rid], i) => {
    if (v === null) return;
    push({ id: `os${i}`, label: `Open space: ${label}${i === bindKey ? ' (binding)' : ''}`, status: pf(os.provided >= v - 1e-6), required: `${n0(v)} m²`, provided: `${n0(os.provided)} m²`, clause, rules: [rid] });
  });
  push({ id: 'plantedB', label: 'Planted, permeable ground: half of the governing open-space requirement', status: pf(os.plantedCapacity >= req.plantedB - 1e-6), required: `${n0(req.plantedB)} m²`, provided: `${n0(os.plantedCapacity)} m² available${kind === 'tower' ? ' outside the paved fire ring' : ''}`, clause: 'Plan arts. 15–17 (reading b)', rules: ['planted.share'] });
  push({ id: 'plantedC', label: 'Stricter reading: half of the open space actually provided', status: os.plantedCapacity >= os.plantedC - 1e-6 ? 'pass' : 'warn', required: `${n0(os.plantedC)} m²`, provided: `${n0(os.plantedCapacity)} m² available`, clause: 'Plan arts. 15–17 (reading c, warning only)', rules: ['planted.share'] });

  const p = c.parking;
  push({ id: 'parking', label: `Parking: ${p.basis === 'per unit' ? '1 per unit over 60 m²' : '1 per 120 m² of total floor area (large building)'}`, status: pf(p.provided >= p.needed), required: `${p.needed} spaces (per unit ${p.perUnit}, per 120 m² ${p.per120})`, provided: `${p.provided} spaces at ${n1(p.areaPerSpace)} m² each`, clause: 'Reg. 7 cl. 3(1)(C), (H); Reg. 41 cl. 2 (old English translation only)', rules: ['park.perUnit', 'park.large.divisor', 'park.stall.w', 'park.stall.l'] });

  const ground = os.groundPlate;
  if (ground.length && site.roads.length) {
    const f = roadFace(site, ground);
    const need = f.perimeter * rule('face.fraction');
    push({ id: 'face', label: 'Road-side face longer than 1/8 of the perimeter and within 20 m of the road', status: pf(f.face > need), required: `> ${n1(need)} m`, provided: `${n1(f.face)} m`, clause: 'Ordinance cl. 53', rules: ['face.fraction', 'face.within'] });
  }
  push({ id: 'f2f', label: 'Residential floor-to-floor at least 2.60 m', status: pf(s.floorToFloor >= rule('unit.minF2F')), required: '≥ 2.60 m', provided: `${n1(s.floorToFloor)} m`, clause: 'Reg. 55 cl. 22', rules: ['unit.minF2F'] });
  push({ id: 'unit', label: 'Units at least 20 m²', status: pf(s.avgUnitArea >= rule('unit.minArea')), required: '≥ 20 m²', provided: `${n0(s.avgUnitArea)} m² average (assumed mix)`, clause: 'Reg. 55 cl. 19', rules: ['unit.minArea'] });
  const eia = p.units >= rule('eia.units') || c.total >= rule('eia.area');
  push({ id: 'eia', label: 'Environmental review (flag only; trigger wording unverified)', status: 'info', required: `${rule('eia.units')}+ units or ${n0(rule('eia.area'))}+ m²`, provided: `${p.units} units, ${n0(c.total)} m²: ${eia ? 'likely needed' : 'likely not needed'}`, clause: RULES['eia.units'].clause, rules: ['eia.units', 'eia.area'] });
  return items;
}
