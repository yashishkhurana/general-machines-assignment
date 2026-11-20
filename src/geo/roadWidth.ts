// Estimating a road's CURRENT right-of-way at a plot's frontage from OSM, two ways (the third is the
// user's own measurement over imagery). None of these is the legal right-of-way: that needs the
// land-office parcel map or a survey.
import type { Pt } from '../core/geom';
import { BUILDINGS, ROADS, bboxOverlap, featureBBox, type LL, type RoadF } from './data';
import type { Frame } from './project';

export const LANE_M = 3.25; // assumed lane width
export const SIDEWALK_M = 1.5; // assumed width per tagged sidewalk
export const RAY_MAX = 40; // m searched each side of the centreline
export const RAY_STEP = 2; // m between rays along the frontage

export interface Polyline { pts: Pt[]; cum: number[] }

export function polyline(pts: Pt[]): Polyline {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum };
}

/** Point and unit tangent at distance s along the line. */
export function along(pl: Polyline, s: number): { p: Pt; t: Pt } {
  const { pts, cum } = pl;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i];
  const L = cum[i] - cum[i - 1] || 1;
  const u = Math.max(0, Math.min(1, (s - cum[i - 1]) / L));
  return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] };
}

/** Distance along the line of the point's projection, and the perpendicular distance. */
export function project(pl: Polyline, p: Pt): { s: number; d: number } {
  let best = { s: 0, d: Infinity };
  for (let i = 1; i < pl.pts.length; i++) {
    const a = pl.pts[i - 1], b = pl.pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    const q: Pt = [a[0] + u * dx, a[1] + u * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { s: pl.cum[i - 1] + u * Math.sqrt(L2), d };
  }
  return best;
}

const NOT_A_STREET = new Set(['service', 'living_street_link']);

/** Nearest OSM road to a point (metres), within `maxD`. Service roads are skipped. */
export function nearestRoad(frame: Frame, p: Pt, maxD = 30): { road: RoadF; line: Polyline; s: number; d: number } | null {
  const ll = frame.toLL(p);
  const pad = 0.0006;
  const box = [ll[0] - pad, ll[1] - pad, ll[0] + pad, ll[1] + pad];
  let best: { road: RoadF; line: Polyline; s: number; d: number } | null = null;
  for (const r of ROADS.features) {
    if (NOT_A_STREET.has(r.properties.highway) || !bboxOverlap(featureBBox(r), box)) continue;
    const line = polyline(r.geometry.coordinates.map((c) => frame.toM(c)));
    const pr = project(line, p);
    if (pr.d <= maxD && (!best || pr.d < best.d)) best = { road: r, line, s: pr.s, d: pr.d };
  }
  return best;
}

export interface LaneEstimate { value: number | null; lanes: number | null; sidewalks: number; text: string }

/** (a) Lower bound: lanes × 3.25 m plus 1.5 m per tagged sidewalk. The right-of-way is at least this. */
export function laneEstimate(road: RoadF | null): LaneEstimate {
  if (!road) return { value: null, lanes: null, sidewalks: 0, text: 'no OSM road found next to this edge' };
  const p = road.properties;
  if (p.width && parseFloat(p.width) > 0) return { value: parseFloat(p.width), lanes: null, sidewalks: 0, text: `OSM width tag ${p.width} m (carriageway)` };
  const lanes = p.lanes ? parseInt(p.lanes, 10) : null;
  const sw = p.sidewalk ?? p['sidewalk:both'];
  let sidewalks = sw === 'both' || p['sidewalk:both'] === 'yes' ? 2 : sw === 'left' || sw === 'right' ? 1 : 0;
  if (!sw) sidewalks = (p['sidewalk:left'] === 'yes' ? 1 : 0) + (p['sidewalk:right'] === 'yes' ? 1 : 0);
  if (!lanes) return { value: null, lanes: null, sidewalks, text: 'OSM has no lanes or width tag' };
  const value = lanes * LANE_M + sidewalks * SIDEWALK_M;
  return { value, lanes, sidewalks, text: `${lanes} lanes × ${LANE_M} m${sidewalks ? ` + ${sidewalks} sidewalk × ${SIDEWALK_M} m` : ', no sidewalk tags'}` };
}

function rayHit(o: Pt, d: Pt, polys: Pt[][]): number {
  let best = Infinity;
  for (const r of polys) {
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i], b = r[i + 1];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const den = d[0] * ey - d[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den;
      const u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
  }
  return best;
}

export interface GapEstimate {
  value: number | null; // minimum gap over the frontage (the tightest upper bound)
  median: number | null;
  rays: number; // rays with a building hit on both sides
  total: number;
  rayLines: { a: Pt; b: Pt; gap: number }[]; // for drawing
  text: string;
}

/** (b) Upper bound: gap between the building outlines facing each other across the road, measured
 *  perpendicular to the OSM centreline every 2 m over the frontage. Buildings sit back from the boundary,
 *  so the right-of-way is at or below the gap. The minimum over the frontage is the tightest bound. */
export function gapEstimate(frame: Frame, line: Polyline, s0: number, s1: number): GapEstimate {
  const lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(line.cum[line.cum.length - 1], Math.max(s0, s1));
  const mid = along(line, (lo + hi) / 2).p;
  const ll = frame.toLL(mid);
  const pad = 0.0012;
  const box = [ll[0] - pad, ll[1] - pad, ll[0] + pad, ll[1] + pad];
  const polys = BUILDINGS.features.filter((b) => bboxOverlap(featureBBox(b), box)).map((b) => b.geometry.coordinates[0].map((c) => frame.toM(c as LL)));
  const gaps: number[] = [];
  const rayLines: GapEstimate['rayLines'] = [];
  let total = 0;
  for (let s = lo; s <= hi + 1e-9; s += RAY_STEP) {
    total++;
    const { p, t } = along(line, s);
    const n: Pt = [-t[1], t[0]];
    const l = rayHit(p, n, polys), r = rayHit(p, [-n[0], -n[1]], polys);
    if (l <= RAY_MAX && r <= RAY_MAX) {
      gaps.push(l + r);
      rayLines.push({ a: [p[0] + n[0] * l, p[1] + n[1] * l], b: [p[0] - n[0] * r, p[1] - n[1] * r], gap: l + r });
    }
  }
  if (!gaps.length) return { value: null, median: null, rays: 0, total, rayLines, text: `no buildings within ${RAY_MAX} m on both sides of the road at this frontage` };
  const sorted = [...gaps].sort((a, b) => a - b);
  const value = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)];
  return { value, median, rays: gaps.length, total, rayLines, text: `minimum of ${gaps.length} perpendicular rays (every ${RAY_STEP} m over the frontage); median ${median.toFixed(1)} m` };
}

export interface FrontageEstimate {
  road: RoadF | null;
  lane: LaneEstimate;
  gap: GapEstimate | null;
}

/** Estimates for the road in front of plot edge a-b (metres). */
export function estimateFrontage(frame: Frame, a: Pt, b: Pt): FrontageEstimate {
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const near = nearestRoad(frame, mid, 30);
  if (!near) return { road: null, lane: laneEstimate(null), gap: null };
  const s0 = project(near.line, a).s, s1 = project(near.line, b).s;
  return { road: near.road, lane: laneEstimate(near.road), gap: gapEstimate(frame, near.line, s0, s1) };
}
