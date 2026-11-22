// "Rules for this plot": the worked rows reproduce the §8 fixture values and the compute results.
import { describe, expect, it } from 'vitest';
import { compute, type Results } from '../src/core/compute';
import { mpArea, type Ring } from '../src/core/geom';
import { plotRules } from '../src/core/plotRules';
import { DEFAULT_SETTINGS, type RoadEdgeInput, type Settings, type SiteInput, type ZonePoly } from '../src/core/types';
import { soi39Example } from '../src/geo/example';
import { toSiteInput } from '../src/geo/siteInput';

const RECT: Ring = [[0, 0], [40, 0], [40, 50], [0, 50]];
const road = (width: number, current = width, edge = 0): RoadEdgeInput[] => [{ edge, width, current }];
const zoneAll = (zone: string): ZonePoly[] => [{ zone, poly: [[[[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000], [-1000, -1000]]]] }];
const S = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over, bonus: { ...DEFAULT_SETTINGS.bonus, ...(over.bonus ?? {}) } });
const input = (over: Partial<SiteInput> = {}): SiteInput => ({ plot: RECT, roads: road(16), zones: zoneAll('ย.10'), zoneOverride: null, settings: S(), ...over });
const rowsFor = (r: Results, key: string, s = S()) => plotRules(r, r.candidates.find((c) => c.key === key)!.concept!, s);
const row = (rows: ReturnType<typeof plotRules>, name: string | RegExp) => rows.find((x) => (typeof name === 'string' ? x.rule === name : name.test(x.rule)))!;

describe('§8 fixture (40 × 50 m, ย.10, 16 m road)', () => {
  const r = compute(input());
  const rows = rowsFor(r, 'towerPodium');
  it('floor area: 2,000 m² × 8 = 16,000 m², no bonus', () => {
    expect(row(rows, 'Net plot area').value).toBeCloseTo(2000, 6);
    const z = row(rows, 'Zone floor area ratio');
    expect(z.working).toBe('2,000 m² × 8 (ย.10)');
    expect(z.value).toBeCloseTo(16000, 6);
    const p = row(rows, 'Bonus and permitted floor area');
    expect(p.value).toBeCloseTo(16000, 6);
    expect(p.value).toBeCloseTo(r.far!.permitted, 9);
    expect(p.clause).toContain('Plan art. 57');
  });
  it('energy bonus level 4: 16,000 × (1 + 20%) = 19,200 m²', () => {
    const b = compute(input({ settings: S({ bonus: { energyLevel: 4 } as never }) }));
    const p = row(plotRules(b, b.concepts[0].concept, S({ bonus: { energyLevel: 4 } as never })), 'Bonus and permitted floor area');
    expect(p.value).toBeCloseTo(19200, 6);
    expect(p.working).toContain('× (1 + 20%)');
  });
  it('height plane at the high-rise front setback line: 2 × (6 + 16) = 44 m, as computed', () => {
    const h = row(rows, /^Height plane from edge 1/);
    expect(h.value).toBeCloseTo(44, 6);
    expect(h.working).toBe('2 × (6 m front setback + 16 m road as it is today to the far side); rises 2 m per metre further back');
    expect(h.value).toBeCloseTo(r.plane!.atHighRiseFront, 6);
  });
  it('setback rows give the footprint\'s own setbacks, edge by edge', () => {
    for (const key of ['towerPodium', 'lowBasement', 'lowBlank']) {
      const c = r.candidates.find((k) => k.key === key)!.concept!;
      const sb = plotRules(r, c, S()).filter((x) => x.group === 'Setbacks');
      expect(sb).toHaveLength(4);
      expect(sb.map((x) => x.value)).toEqual(c.footprint.setbacks.map((x) => x.setback));
    }
    const blank = rowsFor(r, 'lowBlank').filter((x) => x.group === 'Setbacks');
    expect(blank.map((x) => x.rule)).toEqual(['Edge 1 (road, 40.0 m)', 'Edge 2 (side, 50.0 m)', 'Edge 3 (rear, 40.0 m)', 'Edge 4 (side, 50.0 m)']);
    expect(blank[1].working).toMatch(/^blank side wall: clear space 1\.0 m/);
    expect(blank[1].clause).toBe('Ordinance cl. 55');
  });
  it('open space: the governing requirement is the computed one', () => {
    const c = r.candidates.find((k) => k.key === 'towerPodium')!.concept!;
    const gov = rows.filter((x) => x.group === 'Open space' && x.governs);
    expect(gov).toHaveLength(1);
    expect(gov[0].value).toBeCloseTo(c.openSpace.req.governing, 6);
    expect(row(rows, 'Planted half (reading b)').value).toBeCloseTo(c.openSpace.req.plantedB, 6);
  });
});

describe('§8 widening review (current 10 m, planned 16 m)', () => {
  it('net plot 2,000 − 120 = 1,880 m²; plane 2 × (6 + 10 + 3) = 38 m strict, 2 × (6 + 16) = 44 m planned', () => {
    const r = compute(input({ roads: road(16, 10) }));
    const rows = rowsFor(r, 'towerPodium');
    expect(row(rows, 'Net plot area').working).toBe('2,000 m² drawn − 120 m² widening strip');
    expect(row(rows, 'Net plot area').value).toBeCloseTo(1880, 3);
    expect(row(rows, /^Height plane/).value).toBeCloseTo(38, 6);
    expect(row(rows, /^Height plane/).working).toContain('10 m road as it is today + 3 m widening strip = 13 m');
    const p = compute(input({ roads: road(16, 10), settings: S({ heightTo: 'planned' }) }));
    expect(row(rowsFor(p, 'towerPodium', S({ heightTo: 'planned' })), /^Height plane/).value).toBeCloseTo(44, 6);
    expect(row(rows, 'Edge 1 (road, 40.0 m)').result).toBe('6 m');
    expect(row(rows, 'Edge 1 (road, 40.0 m)').working).toContain('9 m from the current edge, after the 3 m widening strip');
  });
});

describe('Soi 39: blank side walls and parking floors both give 5,348 m² of flats', () => {
  const ex = soi39Example();
  const r = compute(toSiteInput({ ring: ex.ring, roads: [{ edge: ex.roadEdge, width: ex.planned, current: ex.current }], zoneOverride: null, settings: DEFAULT_SETTINGS }).input);
  const blank = r.candidates.find((c) => c.key === 'lowBlank')!.concept!;
  const podium = r.candidates.find((c) => c.key === 'lowPodium')!.concept!;
  it('same plate (30% of the plot open), four floors of flats each; different layouts', () => {
    expect(Math.abs(blank.residential - podium.residential)).toBeLessThan(0.01); // 0.003 m² apart: two trims to the same target
    expect(Math.round(blank.residential)).toBe(5348);
    const plate = r.site!.netArea * (1 - 0.3);
    for (const c of [blank, podium]) {
      expect(mpArea(c.openSpace.groundPlate)).toBeCloseTo(plate, 0);
      expect(c.openSpace.req.binding).toBe('ord52');
      expect(c.floors.filter((f) => f.use === 'residential')).toHaveLength(4);
    }
    expect(blank.binding).toMatch(/^roof deck at most 15 m .*plate set by open space$/);
    expect(podium.binding).toMatch(/^roof deck under 23 m .*plate set by open space$/);
    // not a reused result: different footprint, parking and height
    expect(blank.footprint.area).toBeGreaterThan(podium.footprint.area + 100);
    expect(blank.basements).toBe(2);
    expect(podium.floors.filter((f) => f.use === 'parking')).toHaveLength(2);
    expect(blank.roofDeck).toBeLessThanOrEqual(15);
    expect(podium.roofDeck).toBeGreaterThan(15);
  });
});
