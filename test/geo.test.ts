// Zone verification and road-width estimates on the shipped data (src/data, built 20 Nov 2026).
import { describe, expect, it } from 'vitest';
import { compute } from '../src/core/compute';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { ZONES, META, type LL } from '../src/geo/data';
import { soi39Example } from '../src/geo/example';
import { makeFrame } from '../src/geo/project';
import { toSiteInput } from '../src/geo/siteInput';
import { estimateFrontage } from '../src/geo/roadWidth';

const ringAreaLL = (r: LL[]) => { const f = makeFrame(r[0]); const m = r.map((c) => f.toM(c)); let a = 0; for (let i = 0; i < m.length - 1; i++) a += m[i][0] * m[i + 1][1] - m[i + 1][0] * m[i][1]; return Math.abs(a) / 2; };
const square = (c: LL, half = 20): LL[] => {
  const f = makeFrame(c);
  return [[-half, -half], [half, -half], [half, half], [-half, half]].map((p) => f.toLL(p as [number, number]));
};
const run = (ring: LL[], width = 16, current = width) =>
  compute(toSiteInput({ ring, roads: [{ edge: 0, width, current }], zoneOverride: null, settings: DEFAULT_SETTINGS }).input);

describe('shipped data', () => {
  it('records the date and the share of buildings with height or levels tags', () => {
    expect(META.extracted).toBe('2026-11-20');
    expect(META.osm.buildings).toBeGreaterThan(1000);
    expect(META.osm.sharePctEither).toBeLessThan(15);
  });
  it('ships ย.8–ย.10 polygons and neighbours, with no 4-point slivers', () => {
    const zones = new Set(ZONES.features.map((f) => f.properties.zone));
    for (const z of ['ย.8', 'ย.9', 'ย.10', 'พ.5']) expect(zones.has(z)).toBe(true);
    for (const f of ZONES.features) for (const p of f.geometry.coordinates) expect(p[0].length > 5 || ringAreaLL(p[0]) >= 1000).toBe(true);
  });
});

describe('Soi 39 example parcel', () => {
  const ex = soi39Example();
  const r = run(ex.ring, ex.planned, ex.current);
  it('is detected as ย.10 by the zone layer', () => {
    expect(r.zone!.status).toBe('single');
    expect(r.zone!.parts[0].zone).toBe('ย.10');
  });
  it('current-width default is the building-gap upper bound, under the planned 16 m', () => {
    expect(ex.current).toBeGreaterThan(6.5); // above the lanes lower bound
    expect(ex.current).toBeLessThan(16);
    expect(ex.laneLowerBound).toBeCloseTo(6.5, 6); // lanes=2 × 3.25 m, no sidewalk tags
    console.log(`Soi 39 example: building-gap upper bound ${ex.current} m, ${ex.gapRays} of ${ex.gapTotal} rays, median ${ex.gapMedian.toFixed(1)} m; lanes lower bound ${ex.laneLowerBound} m; ring ${JSON.stringify(ex.ring)}`);
  });
  it('draws a widening strip and removes it from plot area', () => {
    expect(r.site!.stripArea).toBeGreaterThan(0);
    expect(r.site!.netArea).toBeCloseTo(40 * (50 - (16 - ex.current) / 2), 0);
  });
  it('the estimator gives the same value when run from the plot edge', () => {
    const { input, frame } = toSiteInput({ ring: ex.ring, roads: [{ edge: 0, width: 16, current: ex.current }], zoneOverride: null, settings: DEFAULT_SETTINGS });
    const est = estimateFrontage(frame, input.plot[0], input.plot[1]);
    expect(est.road?.properties.id).toBe(156261446);
    expect(est.gap!.value!).toBeCloseTo(ex.current, 0);
  });
  it('produces both concepts', () => {
    expect(r.ok).toBe(true);
    expect(r.concepts.length).toBe(2);
    console.log(r.concepts.map((c) => `${c.concept.id}: ${c.concept.storeys}F+${c.concept.basements}B ${c.concept.total.toFixed(0)} m², ${c.concept.parking.needed}/${c.concept.parking.provided} spaces, stop: ${c.concept.binding}`).join(' | '));
  });
});

describe('zone fixtures on the real layer', () => {
  it('a plot across a ย.9 / ย.10 edge gets the straddle warning', () => {
    // find a vertex that the ย.10 feature 457-area shares with a ย.9 polygon near Soi 39 / Thonglor
    const y10 = ZONES.features.filter((f) => f.properties.zone === 'ย.10');
    const y9 = ZONES.features.filter((f) => f.properties.zone === 'ย.9');
    let shared: LL | null = null;
    outer: for (const a of y10) for (const pa of a.geometry.coordinates) for (const v of pa[0]) {
      if (v[0] < 100.56 || v[0] > 100.6 || v[1] < 13.72 || v[1] > 13.75) continue;
      for (const b of y9) for (const pb of b.geometry.coordinates) for (const w of pb[0]) {
        if (Math.abs(v[0] - w[0]) < 1e-6 && Math.abs(v[1] - w[1]) < 1e-6) { shared = v; break outer; }
      }
    }
    expect(shared).not.toBeNull();
    const r = run(square(shared!, 25));
    const m = r.messages.find((x) => x.code === 'straddle');
    expect(m?.text).toMatch(/ย\.9/);
    expect(m?.text).toMatch(/ย\.10/);
  });
  it('a plot in a non-brown zone (Asok junction) is unsupported', () => {
    const r = run(square([100.5604, 13.7372]));
    expect(r.ok).toBe(false);
    expect(r.messages.some((m) => m.code === 'zoneUnsupported' || m.code === 'zoneNone')).toBe(true);
  });
  it('a plot outside Bangkok is rejected', () => {
    const r = run(square([101.5, 13.0]));
    expect(r.messages.some((m) => m.code === 'outsideBangkok')).toBe(true);
  });
  it('a plot drawn over Soi 39 itself is flagged', () => {
    const r = run(square([100.57128, 13.7337], 15));
    expect(r.messages.some((m) => m.code === 'overRoad')).toBe(true);
  });
});

describe('fix 1: displayed area × ratio equals displayed floor area', () => {
  it('example: 1,910 m² × 8 = 15,280 m² (true-scale local projection)', () => {
    const ex = soi39Example();
    const r = run(ex.ring, ex.planned, ex.current);
    expect(r.site!.grossArea).toBeCloseTo(2000, 1);
    expect(Math.round(r.site!.netArea)).toBe(1910);
    expect(Math.round(r.far!.permitted)).toBe(1910 * 8);
  });
});
