// Break-testing: huge plots, odd shapes, random outlines. Nothing may throw or hit the internal-error path,
// and a full compute must stay fast enough for live dragging.
import { describe, expect, it } from 'vitest';
import { compute } from '../src/core/compute';
import type { Ring } from '../src/core/geom';
import { DEFAULT_SETTINGS, type SiteInput } from '../src/core/types';

const Z = [{ zone: 'ย.10', poly: [[[[-5000, -5000], [5000, -5000], [5000, 5000], [-5000, 5000], [-5000, -5000]]]] }];
const run = (plot: Ring, edge = 0, w = 16, c = w) => {
  const t0 = performance.now();
  const r = compute({ plot, roads: [{ edge, width: w, current: c }], zones: Z, zoneOverride: null, settings: DEFAULT_SETTINGS } as SiteInput);
  return { r, ms: performance.now() - t0 };
};
const internal = (r: ReturnType<typeof compute>) => r.messages.filter((m) => m.code === 'internal');

describe('huge and odd plots', () => {
  it('50,000 m² square on a 30 m road computes in under 3 s', () => {
    const s = Math.sqrt(49900);
    const { r, ms } = run([[0, 0], [s, 0], [s, s], [0, s]], 0, 30);
    console.log(`huge plot: ${ms.toFixed(0)} ms; A ${r.concepts[0]?.concept.total.toFixed(0)} m², B ${r.concepts[1]?.concept.total.toFixed(0)} m²`);
    expect(internal(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.concepts[1].concept.ok).toBe(true); // low-rise plate shrinks to stay under 10,000 m²
    expect(r.concepts[1].concept.total).toBeLessThan(10000);
    expect(ms).toBeLessThan(3000);
  });
  it('star, U-shape, 64-gon, thin wedge and a plot with a near-duplicate vertex all compute', () => {
    const star: Ring = Array.from({ length: 10 }, (_, i) => { const a = (i * Math.PI) / 5, r = i % 2 ? 22 : 50; return [r * Math.cos(a), r * Math.sin(a)]; });
    const U: Ring = [[0, 0], [60, 0], [60, 50], [45, 50], [45, 15], [15, 15], [15, 50], [0, 50]];
    const circle: Ring = Array.from({ length: 64 }, (_, i) => [40 * Math.cos((i * 2 * Math.PI) / 64), 40 * Math.sin((i * 2 * Math.PI) / 64)]);
    const wedge: Ring = [[0, 0], [80, 0], [0, 12]];
    const nearDup: Ring = [[0, 0], [40, 0], [40, 50], [20.0001, 50.0001], [20, 50], [0, 50]];
    for (const [name, p] of [['star', star], ['U', U], ['circle', circle], ['wedge', wedge], ['nearDup', nearDup]] as const) {
      const { r, ms } = run(p as Ring);
      expect(internal(r), name).toEqual([]);
      expect(ms, name).toBeLessThan(3000);
    }
  });
  it('200 random outlines never throw or fail inside the geometry', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let worst = 0, errors = 0;
    for (let k = 0; k < 200; k++) {
      const n = 3 + Math.floor(rnd() * 9);
      const R = 15 + rnd() * 70;
      const ring: Ring = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 2 * Math.PI + rnd() * 0.4, r = R * (0.5 + rnd() * 0.7);
        return [r * Math.cos(a) + rnd() * 1e-6, r * Math.sin(a)];
      });
      const { r, ms } = run(ring, Math.floor(rnd() * n), 4 + rnd() * 30, 4 + rnd() * 30);
      worst = Math.max(worst, ms);
      errors += internal(r).length;
    }
    console.log(`random outlines: worst ${worst.toFixed(0)} ms, internal errors ${errors}`);
    expect(errors).toBe(0);
  }, 120000);
  it('rapid dragging: 60 successive vertex moves stay under 150 ms each on average', () => {
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) {
      const d = Math.sin(i / 5) * 8;
      run([[0, 0], [40, 0], [40 + d, 50 + d / 2], [0, 50]]);
    }
    const avg = (performance.now() - t0) / 60;
    console.log(`drag frame average: ${avg.toFixed(0)} ms`);
    expect(avg).toBeLessThan(150);
  });
});
