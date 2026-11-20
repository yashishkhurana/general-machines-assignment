// Input checks. Returns messages; never throws. An 'error' stops the calculation, but the page keeps working.
import { dist, ringArea, selfIntersects, type Ring } from './geom';
import { fmtVs } from './format';
import { rule } from './rules';
import type { Message, RoadEdgeInput, Settings } from './types';

const fmt = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export function validatePlot(plot: Ring | null | undefined): Message[] {
  const m: Message[] = [];
  if (!plot || plot.length < 3) {
    m.push({ level: 'error', code: 'vertices', text: 'Draw a plot with at least three corners.' });
    return m;
  }
  if (plot.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
    m.push({ level: 'error', code: 'coords', text: 'The plot has an invalid corner coordinate.' });
    return m;
  }
  const minEdge = rule('v.minEdge');
  for (let i = 0; i < plot.length; i++) {
    const d = dist(plot[i], plot[(i + 1) % plot.length]);
    if (d < minEdge) {
      m.push({ level: 'error', code: 'shortEdge', text: `Edge ${i + 1} is ${d < 0.01 ? 'zero length (duplicate corner)' : `only ${fmt(d, 2)} m long`}. Remove the duplicate corner.` });
      return m;
    }
  }
  if (selfIntersects(plot)) {
    m.push({ level: 'error', code: 'selfCross', text: 'The plot outline crosses itself. Move a corner so the edges do not cross.' });
    return m;
  }
  const a = ringArea(plot);
  if (a < rule('v.minArea')) m.push({ level: 'error', code: 'tooSmall', text: `Plot is ${fmtVs(a, rule('v.minArea'), 0)} m², under the ${fmt(rule('v.minArea'))} m² this tool accepts.` });
  if (a > rule('v.maxArea')) m.push({ level: 'error', code: 'tooLarge', text: `Plot is ${fmtVs(a, rule('v.maxArea'), 0)} m², over the ${fmt(rule('v.maxArea'))} m² this tool accepts.` });
  // thin sliver check: area small relative to perimeter
  let per = 0;
  for (let i = 0; i < plot.length; i++) per += dist(plot[i], plot[(i + 1) % plot.length]);
  const meanWidth = (2 * a) / per;
  if (a >= rule('v.minArea') && meanWidth < 4) {
    m.push({ level: 'warn', code: 'sliver', text: `Plot is a sliver (mean width ≈ ${fmt(meanWidth, 1)} m). Setbacks will likely leave nothing buildable.` });
  }
  return m;
}

export function validateRoads(plot: Ring, roads: RoadEdgeInput[]): Message[] {
  const m: Message[] = [];
  const n = plot.length;
  if (!roads.length) {
    m.push({ level: 'error', code: 'noRoad', text: 'Mark the plot edge that faces the road (click "Pick road edge", then click an edge).' });
    return m;
  }
  const seen = new Set<number>();
  for (const r of roads) {
    if (!Number.isInteger(r.edge) || r.edge < 0 || r.edge >= n) {
      m.push({ level: 'error', code: 'roadEdgeGone', text: 'A road edge no longer exists on the plot (the outline changed). Pick the road edge again.' });
      continue;
    }
    if (seen.has(r.edge)) continue;
    seen.add(r.edge);
    const label = `Road on edge ${r.edge + 1}`;
    for (const [name, v] of [['width', r.width], ['current width', r.current]] as const) {
      if (typeof v !== 'number' || !Number.isFinite(v)) m.push({ level: 'error', code: 'roadNaN', text: `${label}: ${name} is not a number.` });
      else if (v <= 0) m.push({ level: 'error', code: 'roadNonPositive', text: `${label}: ${name} must be more than 0 m.` });
      else if (v > rule('v.maxRoad')) m.push({ level: 'error', code: 'roadTooWide', text: `${label}: ${name} of ${fmt(v, 1)} m is over the ${rule('v.maxRoad')} m this tool accepts.` });
    }
    if (Number.isFinite(r.current) && Number.isFinite(r.width) && r.current < r.width && r.current > 0) {
      m.push({ level: 'info', code: 'widening', text: `${label}: current right-of-way ${fmtVs(r.current, r.width)} m is under the planned ${fmtVs(r.width, r.current)} m. A ${fmt((r.width - r.current) / 2, 2)} m widening strip comes out of the plot (art. 36 ¶2, art. 45).` });
    }
    const len = dist(plot[r.edge], plot[(r.edge + 1) % n]);
    if (len < rule('access.frontage')) {
      m.push({ level: 'warn', code: 'shortFrontage', text: `${label}: frontage ${fmtVs(len, rule('access.frontage'))} m is under ${rule('access.frontage')} m. That blocks the high-rise and extra-large classes (Reg. 33 cl. 2).` });
    }
  }
  if (seen.size > 1) {
    const widths = roads.filter((r) => seen.has(r.edge)).map((r) => r.width);
    const differ = Math.max(...widths) - Math.min(...widths) > 1e-9;
    m.push({
      level: 'info', code: 'multiRoad',
      text: `${seen.size} road edges${differ ? ' with different widths' : ''}. The height plane takes the strictest road at every point. Reg. 55 cl. 45–46 may allow measuring from the wider road on corner plots; the tool does not claim it.`,
    });
  }
  return m;
}

export function validateSettings(s: Settings): Message[] {
  const m: Message[] = [];
  const b = s.bonus;
  for (const [k, v] of [['ground floor height', s.groundFloor], ['floor-to-floor', s.floorToFloor]] as const) {
    if (!Number.isFinite(v) || v <= 0) m.push({ level: 'error', code: 'height', text: `The ${k} must be a positive number.` });
  }
  // values under a legal minimum stop the result: a design that breaks them isn't a feasible design
  for (const [k, v] of [['Typical floor-to-floor', s.floorToFloor], ['Ground floor height', s.groundFloor]] as const) {
    if (Number.isFinite(v) && v > 0 && v < rule('unit.minF2F')) {
      m.push({ level: 'error', code: 'f2f', text: `${k} of ${fmtVs(v, rule('unit.minF2F'), 2)} m is under the ${rule('unit.minF2F').toFixed(2)} m legal minimum for residential floors (Reg. 55 cl. 22). Raise it to see a result.` });
    }
  }
  if (![b.affordableArea, b.rainwaterM3, b.energyLevel].every((v) => Number.isFinite(v) && v >= 0)) {
    m.push({ level: 'error', code: 'bonus', text: 'Bonus inputs must be zero or positive numbers.' });
  }
  if (s.parkingAreaPerSpace !== null && !(s.parkingAreaPerSpace >= 12)) {
    m.push({ level: 'error', code: 'parking', text: 'Parking area per space must be at least 12 m² (one 2.4 × 5.0 m stall, Reg. 41).' });
  }
  if (!(s.avgUnitArea >= rule('unit.minArea'))) m.push({ level: 'error', code: 'unit', text: `Average flat of ${Number.isFinite(s.avgUnitArea) ? fmtVs(s.avgUnitArea, rule('unit.minArea')) + ' m²' : 'that size'} is under the ${rule('unit.minArea')} m² legal minimum (Reg. 55 cl. 19). Raise it to see a result.` });
  if (!(s.shareOver60 >= 0 && s.shareOver60 <= 1)) m.push({ level: 'error', code: 'mix', text: 'Share of units over 60 m² must be between 0 and 100%.' });
  return m;
}
