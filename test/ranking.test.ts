// Concepts depend on the plot: four candidates, ranked; the best two shown as A and B.
import { describe, expect, it } from 'vitest';
import { compute, type Results } from '../src/core/compute';
import { isTower } from '../src/core/concepts';
import { difference, intersection, mpArea, union } from '../src/core/geom';
import { DEFAULT_SETTINGS, type ZonePoly } from '../src/core/types';
import { soi39Example } from '../src/geo/example';
import { toSiteInput } from '../src/geo/siteInput';

const all = (zone: string): ZonePoly[] => [{ zone, poly: [[[[-999, -999], [999, -999], [999, 999], [-999, 999], [-999, -999]]]] }];
const rect = (w: number, d: number): [number, number][] => [[0, 0], [w, 0], [w, d], [0, d]];
const onRoad = (w: number, d: number, road: number) =>
  compute({ plot: rect(w, d), roads: [{ edge: 0, width: road, current: road }], zones: all('ย.10'), zoneOverride: null, settings: DEFAULT_SETTINGS });
const shown = (r: Results) => r.concepts.map((c) => `${c.concept.id}:${c.key}`);

const ex = soi39Example();
const FIXTURES: Record<string, Results> = {
  'Soi 39 example': compute(toSiteInput({ ring: ex.ring, roads: [{ edge: ex.roadEdge, width: ex.planned, current: ex.current }], zoneOverride: null, settings: DEFAULT_SETTINGS }).input),
  'small plot, 24 × 25 m (600 m²) on a 12 m road': onRoad(24, 25, 12),
  'narrow plot, 11 m frontage × 40 m on a 12 m road': onRoad(11, 40, 12),
  'large plot, 80 × 80 m (6,400 m²) on a 20 m road': onRoad(80, 80, 20),
};

describe('different plots give different winners', () => {
  it('Soi 39 example: towers win; basement parking leaves more floor area for flats than the podium', () => {
    const r = FIXTURES['Soi 39 example'];
    expect(shown(r)).toEqual(['A:towerBasement', 'B:towerPodium']);
    expect(r.concepts.every((c) => c.passes)).toBe(true);
    expect(r.concepts[0].concept.residential).toBeGreaterThan(r.concepts[1].concept.residential);
    expect(r.considered.map((c) => c.key)).toEqual(['lowBasement', 'lowPodium']);
    expect(r.concepts[0].fit).toMatch(/allows a high-rise; basement parking/);
  });
  it('small plot: the 6 m tower setbacks cost too much, so low-rise wins', () => {
    const r = FIXTURES['small plot, 24 × 25 m (600 m²) on a 12 m road'];
    expect(r.avail!.highRise).toBe(true);
    expect(shown(r)).toEqual(['A:lowBasement', 'B:lowPodium']);
    const towers = r.considered.filter((c) => c.concept && isTower(c.concept));
    expect(towers).toHaveLength(2);
    for (const t of towers) expect(t.concept!.residential).toBeLessThan(r.concepts[1].concept.residential);
  });
  it('narrow plot (frontage under 12 m): no high-rise, both cards low-rise, towers skipped with the reason', () => {
    const r = FIXTURES['narrow plot, 11 m frontage × 40 m on a 12 m road'];
    expect(r.avail!.highRise).toBe(false);
    expect(shown(r)).toEqual(['A:lowBasement', 'B:lowPodium']);
    const skipped = r.considered.filter((c) => c.skipped);
    expect(skipped.map((c) => c.key)).toEqual(['towerPodium', 'towerBasement']);
    expect(skipped[0].skipped).toMatch(/Frontage 11\.0 m is under 12 m/);
    expect(r.messages.some((m) => m.code === 'noHighRise')).toBe(true);
    // fewer than two pass: the best failing ones are shown with their failed lines
    for (const c of r.concepts) expect(c.checks.filter((k) => k.status === 'fail').map((k) => k.id)).toEqual(['face']);
    expect(r.concepts[0].fit).toMatch(/^No high-rise here \(frontage 11\.0 m is under 12 m\)/);
  });
  it('large plot on an 18 m+ road: the podium tower wins (no 30,000 m² cap)', () => {
    const r = FIXTURES['large plot, 80 × 80 m (6,400 m²) on a 20 m road'];
    expect(r.avail!.floorAreaCap).toBeNull();
    expect(shown(r)).toEqual(['A:towerPodium', 'B:towerBasement']);
    expect(r.concepts[0].concept.total).toBeGreaterThan(30000);
  });
  it('the four fixtures between them have three different winners', () => {
    expect(new Set(Object.values(FIXTURES).map((r) => r.concepts[0].key)).size).toBe(3);
  });
});

describe('every candidate on every fixture', () => {
  for (const [name, r] of Object.entries(FIXTURES)) {
    it(`${name}: floor areas add up`, () => {
      expect(r.candidates).toHaveLength(4);
      for (const k of r.candidates) {
        const c = k.concept;
        if (!c || !c.ok) continue;
        const fl = c.floors;
        const sum = (f: (x: (typeof fl)[number]) => boolean) => fl.filter(f).reduce((s, x) => s + x.area, 0);
        expect(sum(() => true), `${k.key} total`).toBeCloseTo(c.total, 6);
        expect(sum((f) => f.use === 'residential'), `${k.key} residential`).toBeCloseTo(c.residential, 6);
        expect(sum((f) => f.use !== 'residential'), `${k.key} parking`).toBeCloseTo(c.parkingArea, 6);
        expect(c.residential + c.parkingArea).toBeCloseTo(c.total, 6);
        expect(c.floors[c.floors.length - 1].running).toBeCloseTo(c.total, 6);
        expect(c.floors.reduce((s, f) => s + f.spaces, 0)).toBe(c.parking.provided);
        expect(c.total).toBeLessThanOrEqual(c.cap + 1e-6);
      }
    });
    it(`${name}: ranked by passing, then residential area, then planted ground`, () => {
      const pass = r.candidates.filter((c) => c.passes);
      expect(r.candidates.slice(0, pass.length)).toEqual(pass);
      for (let i = 1; i < pass.length; i++) {
        const a = pass[i - 1].concept!, b = pass[i].concept!;
        expect(a.residential + 0.5 >= b.residential).toBe(true);
        if (Math.abs(a.residential - b.residential) <= 0.5) expect(a.openSpace.plantedCapacity + 0.5 >= b.openSpace.plantedCapacity).toBe(true);
      }
      expect(r.concepts.map((c) => c.concept.id)).toEqual(['A', 'B']);
      expect([...r.concepts, ...r.considered].map((c) => c.key).sort()).toEqual(r.candidates.map((c) => c.key).sort());
    });
  }
  it('tower basements stay inside the 6 m setback and off the planted ground', () => {
    for (const r of Object.values(FIXTURES)) {
      const t = r.candidates.find((c) => c.key === 'towerBasement')?.concept;
      if (!t?.ok || !t.basements) continue;
      const base = t.floors.find((f) => f.level === 'B1')!.plate;
      expect(mpArea(difference(base, r.footprints!.highRise.mp))).toBeLessThan(0.5);
      const planted = difference(r.site!.netMP, union(t.openSpace.groundPlate, t.openSpace.fireRing ?? []));
      expect(mpArea(intersection(base, planted))).toBeLessThan(0.5);
      expect(t.floors.filter((f) => f.level.startsWith('B')).every((f) => f.use === 'basement parking' && f.z1 <= 0)).toBe(true);
    }
  });
});
