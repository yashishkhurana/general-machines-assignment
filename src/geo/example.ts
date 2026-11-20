// The Soi 39 example parcel: a 40 m × 50 m mid-block plot on the west side of Sukhumvit Soi 39
// (OSM way 156261446), 406–446 m north of Sukhumvit Road. Its front edge sits on the current road
// boundary, which the tool places at half the building-gap upper bound from the OSM centreline
// (symmetric road assumption). Zone ย.10 (research session; also detected by the zone layer).
import type { Pt } from '../core/geom';
import { ROADS, type LL } from './data';
import { makeFrame } from './project';
import { along, estimateFrontage, gapEstimate, laneEstimate, polyline } from './roadWidth';

export const EXAMPLE_WAY = 156261446;
export const EXAMPLE_S0 = 406; // m along the way from its south end
export const EXAMPLE_FRONTAGE = 40;
export const EXAMPLE_DEPTH = 50;
export const PLANNED_WIDTH = 16; // gazette annex group 13; road ข 38 (art. 44(2))

export interface Example {
  ring: LL[];
  roadEdge: number;
  planned: number;
  current: number; // building-gap upper bound, not a survey
  gapMedian: number;
  gapRays: number;
  gapTotal: number;
  laneLowerBound: number | null;
}

let cached: Example | null = null;

export function soi39Example(): Example {
  if (cached) return cached;
  const way = ROADS.features.find((r) => r.properties.id === EXAMPLE_WAY)!;
  const frame = makeFrame(way.geometry.coordinates[0]);
  const line = polyline(way.geometry.coordinates.map((c) => frame.toM(c)));
  const s0 = EXAMPLE_S0, s1 = EXAMPLE_S0 + EXAMPLE_FRONTAGE;
  // place the front edge at half the building-gap bound from the centreline, then re-measure the gap from
  // that edge (the same estimator the app runs) until the two agree, so the default and the panel match
  let current = Math.round((gapEstimate(frame, line, s0, s1).value ?? PLANNED_WIDTH) * 10) / 10;
  const A = along(line, s0), B = along(line, s1);
  const dx = B.p[0] - A.p[0], dy = B.p[1] - A.p[1], L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux; // left normal: west, for a road running north
  const build = (cur: number): Pt[] => {
    const f0: Pt = [A.p[0] + nx * cur / 2, A.p[1] + ny * cur / 2];
    const f1: Pt = [f0[0] + ux * EXAMPLE_FRONTAGE, f0[1] + uy * EXAMPLE_FRONTAGE];
    return [f0, f1, [f1[0] + nx * EXAMPLE_DEPTH, f1[1] + ny * EXAMPLE_DEPTH], [f0[0] + nx * EXAMPLE_DEPTH, f0[1] + ny * EXAMPLE_DEPTH]];
  };
  let pts = build(current);
  let est = estimateFrontage(frame, pts[0], pts[1]);
  for (let i = 0; i < 3 && est.gap?.value != null && Math.abs(Math.round(est.gap.value * 10) / 10 - current) > 1e-9; i++) {
    current = Math.round(est.gap.value * 10) / 10;
    pts = build(current);
    est = estimateFrontage(frame, pts[0], pts[1]);
  }
  const ring = pts.map((p) => {
    const ll = frame.toLL(p);
    return [Math.round(ll[0] * 1e9) / 1e9, Math.round(ll[1] * 1e9) / 1e9] as LL;
  });
  const gap = est.gap ?? { median: 0, rays: 0, total: 0 };
  cached = { ring, roadEdge: 0, planned: PLANNED_WIDTH, current, gapMedian: gap.median ?? 0, gapRays: gap.rays, gapTotal: gap.total, laneLowerBound: laneEstimate(way).value };
  return cached;
}
