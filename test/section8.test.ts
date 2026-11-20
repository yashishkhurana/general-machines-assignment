// Section 8 of docs/architecture.md: the numbers, written and passing before any 3D work.
// Values follow the "▸ Review, §8" notes where they change the original table (see docs/decisions.md).
import { describe, expect, it } from 'vitest';
import { availability, classify } from '../src/core/classify';
import { compute } from '../src/core/compute';
import { conceptLowRise } from '../src/core/concepts';
import { planeHeightAt } from '../src/core/envelope';
import { buildingLine, highRiseFootprint, lowRiseFootprint, lowRiseFront } from '../src/core/footprint';
import { mpArea, type Ring } from '../src/core/geom';
import { floorArea, openSpaceRequired, parkingAreaPerSpace, parkingNeed, resolveZone } from '../src/core/metrics';
import { buildSite } from '../src/core/site';
import { DEFAULT_SETTINGS, type RoadEdgeInput, type Settings, type SiteInput, type ZonePoly } from '../src/core/types';

const RECT: Ring = [[0, 0], [40, 0], [40, 50], [0, 50]]; // 40 m side (edge 0) on the road
const road = (width: number, current = width, edge = 0): RoadEdgeInput[] => [{ edge, width, current }];
const zoneAll = (zone: string): ZonePoly[] => [{ zone, poly: [[[[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000], [-1000, -1000]]]] }];
const S = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over, bonus: { ...DEFAULT_SETTINGS.bonus, ...(over.bonus ?? {}) } });
const input = (over: Partial<SiteInput> = {}): SiteInput => ({ plot: RECT, roads: road(16), zones: zoneAll('ย.10'), zoneOverride: null, settings: S(), ...over });

describe('§8 fixture: 40 × 50 m, 40 m side on a 16 m road, ย.10', () => {
  const site = buildSite(RECT, road(16));
  const far = floorArea([{ zone: 'ย.10', area: site.netArea }], site.netArea, DEFAULT_SETTINGS.bonus);

  it('plot area 2,000 m²', () => expect(site.netArea).toBeCloseTo(2000, 6));
  it('permitted floor area 16,000 m²', () => expect(far.permitted).toBeCloseTo(16000, 6));
  it('with full 20% bonus 19,200 m²', () => {
    const f = floorArea([{ zone: 'ย.10', area: 2000 }], 2000, { affordableArea: 0, rainwaterM3: 0, energyLevel: 4 });
    expect(f.permitted).toBeCloseTo(19200, 6);
  });
  it('ratios with full bonus: ย.8 7.2, ย.9 8.4, ย.10 9.6', () => {
    for (const [z, r] of [['ย.8', 7.2], ['ย.9', 8.4], ['ย.10', 9.6]] as const) {
      expect(floorArea([{ zone: z, area: 2000 }], 2000, { affordableArea: 0, rainwaterM3: 0, energyLevel: 4 }).ratioWithBonus).toBeCloseTo(r, 9);
    }
  });
  it('bonuses over 20% are clamped (art. 57)', () => {
    const f = floorArea([{ zone: 'ย.10', area: 2000 }], 2000, { affordableArea: 1000, rainwaterM3: 200, energyLevel: 4 });
    expect(f.bonusPct.applied).toBeCloseTo(0.2, 9);
    expect(f.bonusPct.clamped).toBe(true);
  });
  it('rainwater bonus is proportional: 1 m³ per 50 m² of land gives 5% (art. 55)', () => {
    expect(floorArea([{ zone: 'ย.10', area: 2000 }], 2000, { affordableArea: 0, rainwaterM3: 40, energyLevel: 0 }).bonusPct.rainwater).toBeCloseTo(0.05, 9);
    expect(floorArea([{ zone: 'ย.10', area: 2000 }], 2000, { affordableArea: 0, rainwaterM3: 60, energyLevel: 0 }).bonusPct.rainwater).toBeCloseTo(0.075, 9);
  });
  it('affordable-housing bonus is capped at 4× the affordable area (art. 52)', () => {
    const f = floorArea([{ zone: 'ย.10', area: 2000 }], 2000, { affordableArea: 100, rainwaterM3: 0, energyLevel: 0 });
    expect(f.permitted - 16000).toBeCloseTo(400, 6);
  });
  it('open space: plan at 16,000 m² is 640 m²; 30% of plot is 600 m²; plan binds at full build-out', () => {
    const r = openSpaceRequired(16000, 1064, 2000, 0.04, true);
    expect(r.plan).toBeCloseTo(640, 6);
    expect(r.reg33).toBeCloseTo(600, 6);
    expect(r.ord52).toBeCloseTo(600, 6);
    expect(r.binding).toBe('plan');
  });
  it('high-rise footprint 28 × 38 = 1,064 m²', () => expect(highRiseFootprint(site).area).toBeCloseTo(1064, 1));
  it('height plane at the high-rise front setback line: 2 × (16 + 6) = 44 m', () => expect(planeHeightAt(site, [20, 6])).toBeCloseTo(44, 6));
  it('low-rise front setback on an 8 m road: 6 − 4 = 2 m', () => expect(buildingLine(8, 7, 22.4)).toBeCloseTo(2, 9));
  it('high-rise class on a 9 m road: unavailable', () => expect(availability(buildSite(RECT, road(9)), S()).highRise).toBe(false));
  it('floor area cap on a 16 m road: 30,000 m²', () => expect(availability(site, S()).floorAreaCap).toBe(30000));
  it('review: low-rise front setback on a 16 m road is max(1.6, 2) = 2 m (Ordinance cl. 55)', () => {
    expect(buildingLine(16, 7, 22.4)).toBeCloseTo(1.6, 9);
    expect(lowRiseFront(site.roads[0], 7, 22.4)).toBeCloseTo(2, 9);
  });
  it('review: low-rise footprint after setbacks (3 m sides and rear, 2 m front) is 34 × 45 = 1,530 m²', () => {
    expect(lowRiseFootprint(site, 7, 22.4).area).toBeCloseTo(1530, 1);
  });
  it('low-rise plate after the 30% open-space rule: 1,400 m²', () => {
    const c = conceptLowRise(site, S(), 16000, 0.04, 'basement');
    expect(mpArea(c.openSpace.groundPlate)).toBeCloseTo(1400, 0);
  });
  it('7 floors, no basement: 9,800 m² is low-rise', () => expect(classify(9800, 22.4).lowRise).toBe(true));
  it('7 floors + one 1,400 m² basement: 11,200 m² is extra-large, not low-rise', () => {
    const c = classify(11200, 22.4);
    expect(c.extraLarge).toBe(true);
    expect(c.lowRise).toBe(false);
  });
  it('6 floors + one basement: 9,800 m² is low-rise', () => expect(classify(9800, 19.2).lowRise).toBe(true));
  it('planted ground at 9,800 m²: 300 m² (half of the governing 600 m²); the narrower reading would be 196 m²', () => {
    const r = openSpaceRequired(9800, 1400, 2000, 0.04, false);
    expect(r.plantedB).toBeCloseTo(300, 6);
    expect(r.plan / 2).toBeCloseTo(196, 6);
  });
});

describe('review: parking (Reg. 7 cl. 3(1)(C)/(H), Reg. 41)', () => {
  it('16,000 m² needs 134 spaces at 1 per 120 m², rounded up', () => {
    expect(parkingNeed(16000, 12000, 50, S()).needed).toBe(134);
  });
  it('per-space area from Reg. 41 stall 2.4 × 5.0 m + half a 6 m aisle × 1.4 allowance = 26.88 m²', () => {
    expect(parkingAreaPerSpace(S())).toBeCloseTo(26.88, 9);
  });
  const site = buildSite(RECT, road(16));
  it('low-rise at 26.88 m²/space: 5 floors + 2 basements, 9,800 m², 82 needed, 104 fit', () => {
    const c = conceptLowRise(site, S(), 16000, 0.04, 'basement');
    expect(c.storeys).toBe(5);
    expect(c.basements).toBe(2);
    expect(c.total).toBeCloseTo(9800, 0);
    expect(c.parking.needed).toBe(82);
    expect(c.parking.provided).toBe(104);
  });
  it('low-rise at ~30 m²/space (brief): 5 + 2, 82 needed, ~93 fit; 6 + 1 fails (~46 fit)', () => {
    const c = conceptLowRise(site, S({ parkingAreaPerSpace: 30 }), 16000, 0.04, 'basement');
    expect([c.storeys, c.basements]).toEqual([5, 2]);
    expect(c.parking.needed).toBe(82);
    expect(c.parking.provided).toBe(92); // 2 × floor(1,400 / 30); 2,800 / 30 = 93.3 in aggregate
    expect(Math.floor(1400 / 30)).toBe(46);
    expect(parkingNeed(9800, 8400, 19.2, S()).needed).toBeGreaterThan(46);
  });
  it('6 floors + 1 basement fails at 26.88 m²/space (52 fit, 82 needed)', () => {
    expect(Math.floor(1400 / parkingAreaPerSpace(S()))).toBe(52);
    expect(parkingNeed(9800, 8400, 20, S()).needed).toBe(82);
  });
  it('unit-mix assumption: 50 m² average, 25% over 60 m², 75% saleable', () => {
    const p = parkingNeed(16000, 12000, 50, S());
    expect(p.units).toBe(180);
    expect(p.unitsOver60).toBe(45);
    expect(p.basis).toBe('per 120 m²');
  });
});

describe('review: ข-road widening (current 10 m, planned 16 m)', () => {
  const site = buildSite(RECT, road(16, 10));
  it('the plot loses a 3 m strip along the road edge', () => {
    expect(site.roads[0].strip).toBeCloseTo(3, 9);
    expect(site.stripArea).toBeCloseTo(120, 3);
    expect(site.netArea).toBeCloseTo(1880, 3);
  });
  it('setbacks start from the new line: high-rise footprint 28 × 35 = 980 m²', () => expect(highRiseFootprint(site).area).toBeCloseTo(980, 1));
  it('height plane measured to the planned far boundary: at 6 m behind the new line, 2 × (6 + 16) = 44 m', () => expect(planeHeightAt(site, [20, 9])).toBeCloseTo(44, 6));
  it('access uses the current width: 10 m still meets Reg. 33 cl. 2', () => expect(availability(site, S()).highRise).toBe(true));
  it('permitted floor area counts only the plot behind the line: 1,880 × 8 = 15,040 m²', () => {
    const r = compute(input({ roads: road(16, 10) }));
    expect(r.far!.permitted).toBeCloseTo(15040, 1);
  });
});

describe('zone verification', () => {
  it('straddle ย.9 / ย.10: warning naming both, area in each, floor area summed per part', () => {
    const zones: ZonePoly[] = [
      { zone: 'ย.9', poly: [[[[-100, -100], [20, -100], [20, 100], [-100, 100], [-100, -100]]]] },
      { zone: 'ย.10', poly: [[[[20, -100], [100, -100], [100, 100], [20, 100], [20, -100]]]] },
    ];
    const r = compute(input({ zones }));
    const m = r.messages.find((x) => x.code === 'straddle')!;
    expect(m.text).toContain('ย.9 (1,000 m²)');
    expect(m.text).toContain('ย.10 (1,000 m²)');
    expect(r.far!.permitted).toBeCloseTo(1000 * 7 + 1000 * 8, 3);
    expect(r.far!.osrWeighted).toBeCloseTo((7000 * 0.045 + 8000 * 0.04) / 15000, 9);
  });
  it('plot in a non-brown zone: unsupported, no result', () => {
    const r = compute(input({ zones: zoneAll('พ.5') }));
    expect(r.ok).toBe(false);
    expect(r.messages.some((m) => m.code === 'zoneUnsupported')).toBe(true);
  });
  it('typed zone overrides the layer and flags the mismatch', () => {
    const r = compute(input({ zones: zoneAll('ย.10'), zoneOverride: 'ย.8' }));
    expect(r.ok).toBe(true);
    expect(r.far!.permitted).toBeCloseTo(12000, 6);
    expect(r.messages.some((m) => m.code === 'zoneMismatch')).toBe(true);
  });
  it('no zone polygon under the plot: unsupported', () => {
    const site = buildSite(RECT, road(16));
    expect(resolveZone(site, [], null).status).toBe('none');
  });
});

describe('missing fixtures from the §8 review', () => {
  it('concave L-shaped plot: per-edge strips give the exact inset', () => {
    const L: Ring = [[0, 0], [60, 0], [60, 30], [30, 30], [30, 60], [0, 60]];
    const site = buildSite(L, road(16));
    // 6 m inset of an L with 30 m arms: arms become 18 m wide -> (48 × 18) + (18 × 30) = 864 + 540 = 1,404,
    // plus the corner square behind the reflex vertex that lies more than 6 m from it: 36 − 9π ≈ 7.73 m²
    const a = highRiseFootprint(site).area;
    expect(a).toBeGreaterThan(1404 + 7.5);
    expect(a).toBeLessThan(1404 + 8.5);
  });
  it('deep plot on a narrow road: the height plane binds before floor area', () => {
    const deep: Ring = [[0, 0], [16, 0], [16, 100], [0, 100]];
    const r = compute(input({ plot: deep, roads: road(4) }));
    const b = r.concepts.find((c) => c.concept.id === 'B')!.concept;
    expect(r.avail!.highRise).toBe(false); // 4 m soi
    expect(b.total).toBeLessThan(r.far!.permitted);
    // upper floors step back from the road
    const above = b.floors.filter((f) => !f.level.startsWith('B'));
    expect(above[above.length - 1].area).toBeLessThan(above[0].area - 1);
  });
  it('non-parallel road edge: the far boundary is the road edge offset by W, not d + W', () => {
    const skew: Ring = [[0, 0], [40, 10], [40, 60], [0, 50]];
    const site = buildSite(skew, road(16));
    const r = site.roads[0];
    // a point 10 m inside, perpendicular to the edge's midpoint
    const L = Math.hypot(40, 10), nx = -10 / L, ny = 40 / L;
    const p: [number, number] = [20 + nx * 10, 5 + ny * 10];
    expect(planeHeightAt(site, p)).toBeCloseTo(2 * (10 + 16), 6);
    expect(r.width).toBe(16);
  });
});

describe('validation (§6)', () => {
  const msgs = (over: Partial<SiteInput>) => compute(input(over)).messages.map((m) => m.code);
  it('fewer than three vertices', () => expect(msgs({ plot: [[0, 0], [10, 0]] })).toContain('vertices'));
  it('duplicate / zero-length edge', () => expect(msgs({ plot: [[0, 0], [40, 0], [40, 0], [40, 50], [0, 50]] })).toContain('shortEdge'));
  it('self-crossing outline', () => expect(msgs({ plot: [[0, 0], [40, 50], [40, 0], [0, 50]] })).toContain('selfCross'));
  it('plot under 100 m²', () => expect(msgs({ plot: [[0, 0], [5, 0], [5, 5], [0, 5]] })).toContain('tooSmall'));
  it('plot over 50,000 m²', () => expect(msgs({ plot: [[0, 0], [300, 0], [300, 300], [0, 300]] })).toContain('tooLarge'));
  it('no road edge', () => expect(msgs({ roads: [] })).toContain('noRoad'));
  it('road edge no longer on the plot after a vertex drag', () => expect(msgs({ roads: road(16, 16, 7) })).toContain('roadEdgeGone'));
  it('frontage under 12 m: allowed, blocks high-rise', () => {
    const r = compute(input({ plot: [[0, 0], [10, 0], [10, 60], [0, 60]] }));
    expect(r.messages.map((m) => m.code)).toContain('shortFrontage');
    expect(r.avail!.highRise).toBe(false);
  });
  it('road width zero, negative, non-numeric, over 100 m', () => {
    expect(msgs({ roads: road(0) })).toContain('roadNonPositive');
    expect(msgs({ roads: road(-3) })).toContain('roadNonPositive');
    expect(msgs({ roads: road(NaN) })).toContain('roadNaN');
    expect(msgs({ roads: road(120) })).toContain('roadTooWide');
  });
  it('setbacks leave no buildable area', () => {
    const r = compute(input({ plot: [[0, 0], [12, 0], [12, 10], [0, 10]] }));
    expect(r.messages.map((m) => m.code)).toContain('noBuildableHR');
  });
  it('two road edges with different widths', () => {
    const r = compute(input({ roads: [{ edge: 0, width: 16, current: 16 }, { edge: 1, width: 8, current: 8 }] }));
    expect(r.messages.find((m) => m.code === 'multiRoad')!.text).toContain('different widths');
  });
  it('4-vertex sliver', () => expect(msgs({ plot: [[0, 0], [100, 0], [100, 1.5], [0, 1.5]] })).toContain('sliver'));
  it('never throws on garbage', () => {
    expect(() => compute(input({ plot: [[NaN, 0], [1, 1], [2, 0]] }))).not.toThrow();
    expect(() => compute(input({ plot: null as unknown as Ring }))).not.toThrow();
  });
});

describe('concepts on the fixture', () => {
  const r = compute(input());
  it('concept A (tower) stays within 16,000 m² and parks its count', () => {
    const a = r.concepts[0].concept;
    expect(a.kind).toBe('tower');
    expect(a.total).toBeLessThanOrEqual(16000 + 1e-6);
    expect(a.parking.provided).toBeGreaterThanOrEqual(a.parking.needed);
    expect(a.cls.highRise).toBe(true);
  });
  it('every pass/fail line of both concepts passes on the fixture', () => {
    for (const { concept, checks } of r.concepts) {
      const fails = checks.filter((c) => c.status === 'fail');
      expect(fails.map((f) => `${concept.id}: ${f.label}`)).toEqual([]);
    }
  });
});

describe('drawing direction', () => {
  it('a clockwise plot gives the same results, with the road edge remapped', () => {
    // RECT drawn clockwise: (0,0) -> (0,50) -> (40,50) -> (40,0); the road edge (40,0)->(0,0) is index 3
    const cw: Ring = [[0, 0], [0, 50], [40, 50], [40, 0]];
    const a = compute(input());
    const b = compute(input({ plot: cw, roads: road(16, 10, 3) }));
    const c = compute(input({ roads: road(16, 10) }));
    expect(b.site!.netArea).toBeCloseTo(c.site!.netArea, 6);
    expect(b.footprints!.highRise.area).toBeCloseTo(c.footprints!.highRise.area, 3);
    expect(a.footprints!.highRise.area).toBeCloseTo(1064, 1);
  });
});

describe('break cases found while testing', () => {
  it('roads on opposite sides: low-rise plate trims from both and still fits (was 75 m²)', () => {
    const r = compute(input({ roads: [{ edge: 0, width: 16, current: 16 }, { edge: 2, width: 10, current: 10 }] }));
    const b = r.concepts.find((c) => c.concept.id === 'B')!.concept;
    expect(b.ok).toBe(true);
    expect(mpArea(b.openSpace.groundPlate)).toBeCloseTo(1400, 0);
  });
});
