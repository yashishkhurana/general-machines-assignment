// compute(inputs) -> results. Everything on screen comes from this one call.
import { availability, type Availability } from './classify';
import { checklist, type CheckItem } from './checklist';
import { conceptLowRise, conceptTower, type Concept } from './concepts';
import { planeRange } from './envelope';
import { highRiseFootprint, lowRiseFootprint, type Footprint } from './footprint';
import { floorArea, resolveZone, type FloorAreaResult, type ZoneResult } from './metrics';
import { buildSite } from './site';
import type { Message, SiteInput, Site } from './types';
import { validatePlot, validateRoads, validateSettings } from './validate';

export interface Results {
  ok: boolean;
  messages: Message[];
  site: Site | null;
  zone: ZoneResult | null;
  far: FloorAreaResult | null;
  avail: Availability | null;
  footprints: { highRise: Footprint; lowRise: Footprint } | null;
  plane: { atHighRiseFront: number; atLowRiseFront: number } | null;
  concepts: { concept: Concept; checks: CheckItem[] }[];
}

const empty = (messages: Message[], site: Site | null = null, zone: ZoneResult | null = null): Results => ({
  ok: false, messages, site, zone, far: null, avail: null, footprints: null, plane: null, concepts: [],
});

export function compute(input: SiteInput): Results {
  const messages: Message[] = [...(input.extraMessages ?? [])];
  try {
    messages.push(...validatePlot(input.plot));
    if (messages.some((m) => m.level === 'error')) return empty(messages);
    const roadMsgs = validateRoads(input.plot, input.roads);
    messages.push(...roadMsgs, ...validateSettings(input.settings));
    const roadsOk = !roadMsgs.some((m) => m.level === 'error');
    const site = buildSite(input.plot, roadsOk ? input.roads : []);
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
    const plane = { atHighRiseFront: pr(highRise), atLowRiseFront: pr(lowRise) };
    if (lowRise.area < 1) messages.push({ level: 'warn', code: 'noBuildable', text: 'Setbacks leave no buildable area for a low-rise building.' });
    if (highRise.area < 1) messages.push({ level: 'warn', code: 'noBuildableHR', text: 'High-rise setbacks (6 m all round) leave no buildable area.' });

    const concepts: Results['concepts'] = [];
    if (avail.highRise) {
      const A = conceptTower(site, s, far.permitted, far.osrWeighted, avail);
      concepts.push({ concept: A, checks: checklist(A, site, avail, s, far.permitted, 'tower') });
    } else {
      messages.push({ level: 'warn', code: 'noHighRise', text: `High-rise and extra-large classes are unavailable: ${avail.reasons.join(' ')} Concept A is replaced by a second low-rise layout (parking floors above ground).` });
      const A = conceptLowRise(site, s, far.permitted, far.osrWeighted, 'podium', 'A');
      concepts.push({ concept: A, checks: checklist(A, site, avail, s, far.permitted, 'low') });
    }
    const B = conceptLowRise(site, s, far.permitted, far.osrWeighted, 'basement', 'B');
    concepts.push({ concept: B, checks: checklist(B, site, avail, s, far.permitted, 'low') });
    for (const { concept } of concepts) {
      if (!concept.ok && concept.reason) messages.push({ level: 'warn', code: `concept${concept.id}`, text: `Concept ${concept.id}: ${concept.reason}` });
    }
    if (concepts.every((c) => !c.concept.ok) && concepts.some((c) => /height plane/.test(c.concept.reason ?? ''))) {
      messages.push({ level: 'warn', code: 'planeNoFloor', text: 'The height plane leaves no usable floor.' });
    }
    return { ok: true, messages, site, zone, far, avail, footprints: { highRise, lowRise }, plane, concepts };
  } catch (e) {
    messages.push({ level: 'error', code: 'internal', text: `Calculation failed on this shape (${(e as Error).message}). Try moving a corner slightly.` });
    return empty(messages);
  }
}
