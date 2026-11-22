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
}

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

const n1 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1 });
function fitNote(key: ConceptKey, avail: Availability): string {
  if (key === 'towerPodium' || key === 'towerBasement') {
    const access = `${fmtVs(avail.accessFrontage, rule('access.frontage'))} m frontage on a ${fmtVs(avail.accessRoadCurrent, rule('access.road'))} m road allows a high-rise`;
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
  ok: false, messages, site, zone, far: null, avail: null, footprints: null, plane: null, concepts: [], considered: [], candidates: [],
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
    if (lowRise.area < 1) messages.push({ level: 'warn', code: 'noBuildable', text: 'Setbacks leave no buildable area for a low-rise building.' });
    if (highRise.area < 1) messages.push({ level: 'warn', code: 'noBuildableHR', text: 'High-rise setbacks (6 m all round) leave no buildable area.' });

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
    }
    add('lowBasement', () => conceptLowRise(site, s, far.permitted, far.osrWeighted, 'basement'), 'low');
    add('lowPodium', () => conceptLowRise(site, s, far.permitted, far.osrWeighted, 'podium'), 'low');

    const candidates = rankCandidates(cands);
    const concepts = candidates.filter((c): c is Shown => c.concept !== null).slice(0, 2);
    concepts.forEach((c, i) => { c.concept.id = i === 0 ? 'A' : 'B'; });
    const considered = candidates.filter((c) => !concepts.includes(c as Shown));
    for (const { concept } of concepts) {
      if (!concept.ok && concept.reason) messages.push({ level: 'warn', code: `concept${concept.id}`, text: `Concept ${concept.id}: ${concept.reason}` });
    }
    if (concepts.every((c) => !c.concept.ok) && concepts.some((c) => /height plane/.test(c.concept.reason ?? ''))) {
      messages.push({ level: 'warn', code: 'planeNoFloor', text: 'The height plane leaves no usable floor.' });
    }
    return { ok: true, messages, site, zone, far, avail, footprints: { highRise, lowRise }, plane, concepts, considered, candidates };
  } catch (e) {
    messages.push({ level: 'error', code: 'internal', text: `Calculation failed on this shape (${(e as Error).message}). Try moving a corner slightly.` });
    return empty(messages);
  }
}
