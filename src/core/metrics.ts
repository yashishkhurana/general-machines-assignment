// Plot area, zone resolution (incl. straddles), permitted floor area with bonuses, open-space requirements,
// parking count. Pure functions; every value comes from rules.ts.
import { intersection, mpArea } from './geom';
import { isSupportedZone, rule, zoneFar, zoneOsr, type Zone } from './rules';
import type { Bonuses, Message, Settings, Site, ZonePoly } from './types';

export interface ZonePart { zone: string; area: number; share: number }
export interface ZoneResult {
  status: 'single' | 'straddle' | 'unsupported' | 'override' | 'none';
  parts: ZonePart[]; // shares of the net plot
  supported: { zone: Zone; area: number }[];
  detected: ZonePart[]; // what the zone layer says, even when overridden
  messages: Message[];
}

const fmt = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Smallest share of the plot that counts as being "in" a zone (drops slivers from simplified boundaries). */
export const ZONE_TOLERANCE = 0.005;

export function detectZones(site: Site, zones: ZonePoly[]): ZonePart[] {
  const byZone = new Map<string, number>();
  for (const z of zones) {
    const a = mpArea(intersection(site.netMP, z.poly));
    if (a > 0.01) byZone.set(z.zone, (byZone.get(z.zone) ?? 0) + a);
  }
  return [...byZone.entries()]
    .map(([zone, area]) => ({ zone, area, share: area / site.netArea }))
    .sort((a, b) => b.area - a.area);
}

export function resolveZone(site: Site, zones: ZonePoly[], override: Zone | null): ZoneResult {
  const messages: Message[] = [];
  const raw = detectZones(site, zones);
  const detected = raw.filter((p) => p.share >= ZONE_TOLERANCE);
  const covered = detected.reduce((s, p) => s + p.area, 0);
  if (override) {
    const d = detected.map((p) => p.zone);
    if (!d.length) messages.push({ level: 'warn', code: 'zoneOverrideUnknown', text: `Zone set by hand to ${override}. The zone layer has no zone here, so it can't be checked.` });
    else if (d.length !== 1 || d[0] !== override) messages.push({ level: 'warn', code: 'zoneMismatch', text: `Zone set by hand to ${override}, but the zone layer puts this plot in ${d.join(' + ')}. Check the official BMA map.` });
    else messages.push({ level: 'info', code: 'zoneOverrideMatch', text: `Zone set by hand to ${override}; matches the zone layer.` });
    return { status: 'override', parts: [{ zone: override, area: site.netArea, share: 1 }], supported: [{ zone: override, area: site.netArea }], detected, messages };
  }
  if (!detected.length) {
    messages.push({ level: 'error', code: 'zoneNone', text: 'No zone found under this plot in the zone layer. Zone not supported: the tool covers ย.8–ย.10 only. You can set the zone by hand if you know it.' });
    return { status: 'none', parts: [], supported: [], detected, messages };
  }
  const unsupported = detected.filter((p) => !isSupportedZone(p.zone));
  if (unsupported.length) {
    messages.push({
      level: 'error', code: 'zoneUnsupported',
      text: `Zone not supported: the plot is ${detected.map((p) => `${fmt(p.share * 100)}% ${p.zone}`).join(', ')}. This tool covers ย.8–ย.10 only, so it gives no result.`,
    });
    return { status: 'unsupported', parts: detected, supported: [], detected, messages };
  }
  // Area not covered by any zone polygon (gaps along roads/canals in the simplified extract) is shared out
  // in proportion to the zones present. Assumption, logged.
  const gap = site.netArea - covered;
  const parts = detected.map((p) => {
    const area = p.area + (gap > 0 ? (gap * p.area) / covered : 0);
    return { zone: p.zone, area, share: area / site.netArea };
  });
  if (gap / site.netArea > 0.05) {
    messages.push({ level: 'warn', code: 'zoneGap', text: `${fmt((gap / site.netArea) * 100)}% of the plot falls in no zone polygon (the boundaries are simplified). That part is shared out in proportion to the zones present.` });
  }
  const supported = parts.map((p) => ({ zone: p.zone as Zone, area: p.area }));
  if (parts.length === 1) {
    messages.push({ level: 'info', code: 'zoneFound', text: `Zone ${parts[0].zone} from the zone layer (approximate boundaries: verify against BMA).` });
    return { status: 'single', parts, supported, detected, messages };
  }
  messages.push({
    level: 'warn', code: 'straddle',
    text: `Plot straddles ${parts.map((p) => `${p.zone} (${fmt(p.area)} m²)`).join(' and ')}. Floor area and the plan's open-space ratio are summed per part; every other rule takes the strictest zone. The plan has no straddle clause: this is the tool's assumption, not law.`,
  });
  return { status: 'straddle', parts, supported, detected, messages };
}

export interface FloorAreaResult {
  baseFloorArea: number; // Σ part area × zone ratio
  baseRatio: number; // effective ratio on the net plot
  bonusPct: { affordable: number; rainwater: number; energy: number; requested: number; applied: number; clamped: boolean };
  permitted: number; // with bonus, before class caps
  ratioWithBonus: number;
  osrWeighted: number; // plan open-space ratio, weighted by each part's permitted floor area
  messages: Message[];
}

export function bonusPercent(b: Bonuses, baseFloorArea: number, netArea: number) {
  const affordable = baseFloorArea > 0
    ? Math.min((rule('bonus.affordable.multiple') * Math.max(0, b.affordableArea)) / baseFloorArea, rule('bonus.affordable.cap'))
    : 0;
  const steps = netArea > 0 ? Math.max(0, b.rainwaterM3) / (netArea / rule('bonus.rain.landPerM3')) : 0;
  const rainwater = Math.min(steps * rule('bonus.rain.per'), rule('bonus.rain.cap'));
  const level = Math.max(0, Math.min(4, Math.floor(b.energyLevel)));
  const energy = level * rule('bonus.energy.step');
  const requested = affordable + rainwater + energy;
  const applied = Math.min(requested, rule('bonus.cap'));
  return { affordable, rainwater, energy, requested, applied, clamped: requested > rule('bonus.cap') + 1e-12 };
}

export function floorArea(supported: { zone: Zone; area: number }[], netArea: number, b: Bonuses): FloorAreaResult {
  const messages: Message[] = [];
  const baseFloorArea = supported.reduce((s, p) => s + p.area * zoneFar(p.zone), 0);
  const osrWeighted = baseFloorArea > 0 ? supported.reduce((s, p) => s + p.area * zoneFar(p.zone) * zoneOsr(p.zone), 0) / baseFloorArea : 0;
  const bonusPct = bonusPercent(b, baseFloorArea, netArea);
  if (bonusPct.clamped) {
    messages.push({ level: 'info', code: 'bonusClamped', text: `Bonuses requested add up to ${fmt(bonusPct.requested * 100, 1)}%. Clamped to ${fmt(rule('bonus.cap') * 100)}% (plan art. 57).` });
  }
  const permitted = baseFloorArea * (1 + bonusPct.applied);
  const baseRatio = netArea > 0 ? baseFloorArea / netArea : 0;
  return { baseFloorArea, baseRatio, bonusPct, permitted, ratioWithBonus: baseRatio * (1 + bonusPct.applied), osrWeighted, messages };
}

export interface OpenSpaceReq {
  plan: number;
  reg33: number | null; // only for high-rise / extra-large
  ord52: number;
  reg55: number;
  governing: number;
  binding: 'plan' | 'reg33' | 'ord52' | 'reg55';
  plantedB: number; // half of the governing requirement (pass/fail)
}

/** Open space required for a building with total floor area T and largest floor F on a plot of net area A. */
export function openSpaceRequired(T: number, F: number, netArea: number, osr: number, highRiseOrXL: boolean): OpenSpaceReq {
  const plan = T * osr;
  const reg33 = highRiseOrXL ? netArea * rule('os.reg33') : null;
  const ord52 = netArea * rule('os.ord52');
  const reg55 = F * rule('os.reg55');
  const cands: [OpenSpaceReq['binding'], number][] = [['plan', plan], ['ord52', ord52], ['reg55', reg55]];
  if (reg33 !== null) cands.splice(1, 0, ['reg33', reg33]);
  let best = cands[0];
  for (const c of cands) if (c[1] > best[1] + 1e-9) best = c;
  return { plan, reg33, ord52, reg55, governing: best[1], binding: best[0], plantedB: best[1] * rule('planted.share') };
}

export function parkingAreaPerSpace(s: Settings): number {
  if (s.parkingAreaPerSpace !== null) return s.parkingAreaPerSpace;
  return rule('park.stall.w') * (rule('park.stall.l') + rule('park.aisle') / 2) * rule('park.circulation');
}

export interface ParkingNeed {
  units: number;
  unitsOver60: number;
  perUnit: number;
  per120: number;
  needed: number;
  large: boolean;
  basis: 'per unit' | 'per 120 m²' | 'none';
}

export function isLarge(T: number, roofHeight: number) {
  return T > rule('class.large.area') || (roofHeight > rule('class.large.altHeight') && T > rule('class.large.altArea'));
}

export function parkingNeed(T: number, residentialArea: number, roofHeight: number, s: Settings): ParkingNeed {
  const units = Math.floor((residentialArea * rule('a.efficiency')) / Math.max(1, s.avgUnitArea));
  const unitsOver60 = Math.round(units * Math.max(0, Math.min(1, s.shareOver60)));
  const perUnit = unitsOver60 * rule('park.perUnit');
  const large = isLarge(T, roofHeight);
  const per120 = large ? Math.ceil(T / rule('park.large.divisor') - 1e-9) : 0;
  const needed = Math.max(perUnit, per120);
  return { units, unitsOver60, perUnit, per120, needed, large, basis: needed === 0 ? 'none' : per120 >= perUnit ? 'per 120 m²' : 'per unit' };
}

export const areaOf = mpArea;
