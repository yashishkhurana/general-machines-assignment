// compute(inputs) -> results. Everything on screen comes from this one call.
import { availability, type Availability } from './classify';
import { checklist, type CheckItem } from './checklist';
import { conceptLowRise, conceptTower, type Concept, type ConceptKey } from './concepts';
import { fmtVs } from './format';
import { rule } from './rules';
import { planeHeightAltAt, planeRange } from './envelope';
import { highRiseFootprint, lowRiseFootprint, type Footprint } from './footprint';
import { floorArea, resolveZone, type FloorAreaResult, type ZoneResult } from './metrics';
import { buildSite } from './site';
import type { Message, SiteInput, Site } from './types';
import { validatePlot, validateRoads, validateSettings } from './validate';

/** One generated layout. `skipped` says why a high-rise candidate wasn't generated (then concept is null). */
export interface Candidate {
  key: ConceptKey;
  title: string;
  concept: Concept | null;
  checks: CheckItem[];
  passes: boolean; // produced a building and no checklist line fails
  skipped: string | null;
  fit: string; // one line: why this layout suits the plot
}
export type Shown = Candidate & { concept: Concept };

export interface Results {
  ok: boolean;
  messages: Message[];
  site: Site | null;
  zone: ZoneResult | null;
  far: FloorAreaResult | null;
  avail: Availability | null;
  footprints: { highRise: Footprint; lowRise: Footprint } | null;
  plane: { atHighRiseFront: number; atLowRiseFront: number; atHighRiseFrontAlt: number; heightTo: 'current' | 'planned' } | null;
  /** The two shown as A and B: the best first (ranking in rankCandidates). */
  concepts: Shown[];
  /** Every other candidate, in rank order ("Also considered"). */
  considered: Candidate[];
  /** All candidates, ranked. */
  candidates: Candidate[];
  /** Set when no candidate builds anything: the binding reason and a rough "what would work". */
  noFit: NoFit | null;
}
export interface NoFit { reason: string; suggestion: string | null }

const TITLES: Record<ConceptKey, string> = {
  towerPodium: 'Tower on a parking podium', towerBasement: 'Tower, basement parking',
  lowBasement: 'Low-rise block, basement parking', lowPodium: 'Low-rise block, parking floors',
};
const ORDER: ConceptKey[] = ['towerPodium', 'towerBasement', 'lowBasement', 'lowPodium'];

/** Ranking: candidates that pass every checklist line first, by residential floor area, then by planted ground
 *  available; then the ones that fail (a building before none, fewer failed lines, more residential area);
 *  skipped ones last. Ties keep the generation order. */
export function rankCandidates(cands: Candidate[]): Candidate[] {
  const fails = (c: Candidate) => c.checks.filter((k) => k.status === 'fail').length;
  const tier = (c: Candidate) => (c.passes ? 0 : c.concept ? 1 : 2);
  return [...cands].sort((a, b) => {
    const t = tier(a) - tier(b);
    if (t) return t;
    if (!a.concept || !b.concept) return ORDER.indexOf(a.key) - ORDER.indexOf(b.key);
    if (!a.passes) {
      if (a.concept.ok !== b.concept.ok) return a.concept.ok ? -1 : 1;
      if (fails(a) !== fails(b)) return fails(a) - fails(b);
    }
    const r = b.concept.residential - a.concept.residential;
    if (Math.abs(r) > 0.5) return r;
    const p = b.concept.openSpace.plantedCapacity - a.concept.openSpace.plantedCapacity;
    if (Math.abs(p) > 0.5) return p;
    return ORDER.indexOf(a.key) - ORDER.indexOf(b.key);
  });
}

/** No candidate builds: the binding reason, and (when the setbacks bind) a rough size that would. */
function noFitState(site: Site, s: SiteInput['settings'], avail: Availability, cands: Candidate[]): NoFit {
  const minPlate = rule('a.minPlate');
  const n0 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 0 });
  // the most generous footprint: a one-storey low-rise block
  const fp1 = lowRiseFootprint(site, 1, s.groundFloor);
  const road = site.roads[0];
  if (fp1.area >= minPlate || !road) {
    const low = cands.find((c) => c.key === 'lowBasement')?.concept?.reason;
    const r = low && /height plane/.test(low) ? `The height limit from the road leaves no floor of ${minPlate} m² or more; the smallest usable floor is ${minPlate} m² (assumed).` : (low ?? cands.find((c) => c.concept?.reason)?.concept?.reason ?? 'No layout fits.');
    return { reason: r, suggestion: null };
  }
  const reason = `Setbacks leave ${n0(fp1.area)} m² to build on; the smallest usable floor is ${minPlate} m² (assumed).`;
  // treat the plot as a rectangle: the road frontage by (net area / frontage) deep, with the same setbacks
  const W = road.frontage, D = site.netArea / W;
  const front = Math.max(...fp1.setbacks.filter((x) => x.road).map((x) => x.setback));
  const other = Math.max(0, ...fp1.setbacks.filter((x) => !x.road).map((x) => x.setback));
  const w0 = W - 2 * other, d0 = D - front - other;
  const up = (x: number) => Math.ceil(x * 10) / 10;
  const opts: string[] = [];
  if (d0 > 0) { const dW = up(minPlate / d0 - Math.max(0, w0)); opts.push(`about ${n1(dW)} m more frontage (${n1(W + dW)} m)`); }
  if (w0 > 0) { const dD = up(minPlate / w0 - Math.max(0, d0)); opts.push(`about ${n1(dD)} m more depth (${n1(D + dD)} m)`); }
  let suggestion = opts.length
    ? `Rough estimate, treating the plot as a ${n1(W)} × ${n1(D)} m rectangle with these setbacks: ${opts.join(' or ')} would give a ${minPlate} m² floor.`
    : `Rough estimate: the plot would need to be larger in both directions to give a ${minPlate} m² floor.`;
  if (!avail.highRise && W < rule('access.frontage')) {
    suggestion += ` A frontage of ${rule('access.frontage')} m or more also allows a high-rise${road.current < rule('access.road') ? `, if the road is also at least ${rule('access.road')} m wide` : ''}.`;
  }
  return { reason, suggestion };
}

const n1 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1 });
function fitNote(key: ConceptKey, avail: Availability): string {
  if (key === 'towerPodium' || key === 'towerBasement') {
    const w = fmtVs(avail.accessRoadCurrent, rule('access.road'));
    const access = `${fmtVs(avail.accessFrontage, rule('access.frontage'))} m frontage on ${/^(8|11|18)(\D|$)|^8/.test(w) ? 'an' : 'a'} ${w} m road allows a high-rise`;
    return key === 'towerPodium' ? `${access}; parking floors in the podium avoid digging basements.` : `${access}; basement parking leaves every floor above ground for flats.`;
  }
  const park = key === 'lowBasement' ? 'basement parking leaves every floor above ground for flats' : 'parking floors avoid digging basements';
  if (!avail.highRise) {
    const why = (avail.reasons[0] ?? '').replace(/\s*\(Reg\. 33 cl\. 2[^)]*\)\.?$/, '').replace(/\.$/, '');
    return `No high-rise here (${why.replace(/^\w/, (x) => x.toLowerCase())}); ${park}.`;
  }
  return `Under ${rule('class.highrise.height')} m and ${n1(rule('class.extralarge.area'))} m², so the 6 m setbacks and fire road don't apply; ${park}.`;
}

const empty = (messages: Message[], site: Site | null = null, zone: ZoneResult | null = null): Results => ({
  ok: false, messages, site, zone, far: null, avail: null, footprints: null, plane: null, concepts: [], considered: [], candidates: [], noFit: null,
});

export function compute(input: SiteInput): Results {
  const messages: Message[] = [...(input.extraMessages ?? [])];
  try {
    messages.push(...validatePlot(input.plot));
    if (messages.some((m) => m.level === 'error')) return empty(messages);
    const roadMsgs = validateRoads(input.plot, input.roads);
    messages.push(...roadMsgs, ...validateSettings(input.settings));
    const roadsOk = !roadMsgs.some((m) => m.level === 'error');
    const site = buildSite(input.plot, roadsOk ? input.roads : [], input.settings.heightTo ?? 'current');
    // the zone is looked up even when the inputs aren't complete yet, so the panel can show it
    const zone = resolveZone(site, input.zones, input.zoneOverride);
    if (messages.some((m) => m.level === 'error')) return empty([...messages, ...zone.messages.filter((m) => m.level !== 'error')], site, zone);
    if (site.netArea < 1) return empty([...messages, { level: 'error', code: 'stripAll', text: 'The road widening strip takes the whole plot.' }], site, zone);
    messages.push(...zone.messages);
    if (!zone.supported.length) return empty(messages, site, zone);

    const s = input.settings;
    const far = floorArea(zone.supported, site.netArea, s.bonus);
    messages.push(...far.messages);
    const avail = availability(site, s);
    if (avail.capReason) messages.push({ level: 'info', code: 'cap30k', text: avail.capReason });

    const highRise = highRiseFootprint(site);
    const lowRise = lowRiseFootprint(site, 7, 22.4);
    const pr = (fp: Footprint) => (fp.area > 0 ? planeRange(site, fp.mp).min : 0);
    const prAlt = (fp: Footprint) => (fp.area > 0 ? Math.min(...fp.mp.flatMap((poly) => poly[0].map((p) => planeHeightAltAt(site, p)))) : 0);
    const plane = { atHighRiseFront: pr(highRise), atLowRiseFront: pr(lowRise), atHighRiseFrontAlt: prAlt(highRise), heightTo: input.settings.heightTo ?? 'current' };
    // both are stated again by a candidate's reason (Also considered, or the no-fit headline): kept as notes only
    if (lowRise.area < 1) messages.push({ level: 'info', code: 'noBuildable', text: 'Setbacks leave no buildable area for a low-rise building.' });
    if (highRise.area < 1) messages.push({ level: 'info', code: 'noBuildableHR', text: 'High-rise setbacks (6 m all round) leave no buildable area.' });

    const cands: Candidate[] = [];
    const add = (key: ConceptKey, make: () => Concept, kind: 'tower' | 'low') => {
      const concept = make();
      const checks = checklist(concept, site, avail, s, far.permitted, kind);
      cands.push({ key, title: TITLES[key], concept, checks, passes: concept.ok && !checks.some((k) => k.status === 'fail'), skipped: null, fit: fitNote(key, avail) });
    };
    if (avail.highRise) {
      add('towerPodium', () => conceptTower(site, s, far.permitted, far.osrWeighted, avail, 'podium'), 'tower');
      add('towerBasement', () => conceptTower(site, s, far.permitted, far.osrWeighted, avail, 'basement'), 'tower');
    } else {
      const why = avail.reasons.join(' ');
      for (const key of ['towerPodium', 'towerBasement'] as const) cands.push({ key, title: TITLES[key], concept: null, checks: [], passes: false, skipped: why, fit: '' });
      messages.push({ level: 'warn', code: 'noHighRise', text: `High-rise and extra-large classes are unavailable: ${why} Only low-rise layouts are compared.` });
      // said once: the short-frontage warning repeats this reason
      for (const m of messages) if (m.code === 'shortFrontage') m.level = 'info';
    }
    add('lowBasement', () => conceptLowRise(site, s, far.permitted, far.osrWeighted, 'basement'), 'low');
    add('lowPodium', () => conceptLowRise(site, s, far.permitted, far.osrWeighted, 'podium'), 'low');

    const candidates = rankCandidates(cands);
    // only layouts with floors get a card; the rest (with their reasons) go under Also considered
    const concepts = candidates.filter((c): c is Shown => c.concept !== null && c.concept.ok).slice(0, 2);
    concepts.forEach((c, i) => { c.concept.id = i === 0 ? 'A' : 'B'; });
    const considered = candidates.filter((c) => !concepts.includes(c as Shown));
    const noFit = concepts.length ? null : noFitState(site, s, avail, candidates);
    if (noFit && candidates.some((c) => /height plane/.test(c.concept?.reason ?? ''))) {
      messages.push({ level: 'info', code: 'planeNoFloor', text: 'The height plane leaves no usable floor.' });
    }
    return { ok: true, messages, site, zone, far, avail, footprints: { highRise, lowRise }, plane, concepts, considered, candidates, noFit };
  } catch (e) {
    messages.push({ level: 'error', code: 'internal', text: `Calculation failed on this shape (${(e as Error).message}). Try moving a corner slightly.` });
    return empty(messages);
  }
}
