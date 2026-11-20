// Building classes and which ones the plot can have.
import { fmtVs } from './format';
import { rule } from './rules';
import type { Settings, Site } from './types';

export interface BuildingClass {
  highRise: boolean;
  extraLarge: boolean;
  large: boolean;
  lowRise: boolean;
  label: string;
}

export function classify(totalFloorArea: number, roofDeckHeight: number, largestFloor = 0): BuildingClass {
  const highRise = roofDeckHeight >= rule('class.highrise.height');
  const extraLarge = totalFloorArea >= rule('class.extralarge.area') || largestFloor >= rule('class.extralarge.area');
  const large = totalFloorArea > rule('class.large.area') || (roofDeckHeight > rule('class.large.altHeight') && totalFloorArea > rule('class.large.altArea'));
  const lowRise = !highRise && !extraLarge;
  const label = highRise && extraLarge ? 'high-rise, extra-large' : highRise ? 'high-rise' : extraLarge ? 'extra-large' : large ? 'low-rise (large building)' : 'low-rise';
  return { highRise, extraLarge, large, lowRise, label };
}

export interface Availability {
  highRise: boolean;
  reasons: string[]; // why high-rise / extra-large is unavailable
  floorAreaCap: number | null; // 30,000 m² when the access road is under 18 m
  capReason: string | null;
  accessRoadCurrent: number; // best qualifying road's current right-of-way
  accessFrontage: number;
}

/** Reg. 33 cl. 2: a 12 m frontage on a public road of at least 10 m (18 m above 30,000 m²), continuing at that
 *  width to another public road. The tool tests the road's CURRENT right-of-way (cautious reading, logged). */
export function availability(site: Site, s: Settings): Availability {
  const reasons: string[] = [];
  const minRoad = rule('access.road');
  const ok = site.roads.filter((r) => r.frontage >= rule('access.frontage') && r.current >= minRoad);
  const best = ok.sort((a, b) => b.current - a.current)[0];
  if (!site.roads.length) reasons.push('No road edge selected.');
  else if (!best) {
    const longest = Math.max(...site.roads.map((r) => r.frontage));
    const widest = Math.max(...site.roads.map((r) => r.current));
    if (longest < rule('access.frontage')) reasons.push(`Frontage ${fmtVs(longest, rule('access.frontage'))} m is under ${rule('access.frontage')} m (Reg. 33 cl. 2).`);
    if (widest < minRoad) reasons.push(`Road right-of-way ${fmtVs(widest, minRoad)} m (current) is under ${minRoad} m (Reg. 33 cl. 2).`);
    if (!reasons.length) reasons.push(`No single road edge has both a ${rule('access.frontage')} m frontage and a ${minRoad} m road (Reg. 33 cl. 2).`);
  }
  if (!s.roadContinuity) reasons.push('The road is not confirmed to continue at the same width to another public road (Reg. 33 cl. 2, tick-box).');
  const highRise = reasons.length === 0;
  let floorAreaCap: number | null = null, capReason: string | null = null;
  if (highRise && best.current < rule('access.road.big')) {
    floorAreaCap = rule('access.big.area');
    capReason = `Road right-of-way ${fmtVs(best.current, rule('access.road.big'))} m (current) is under ${rule('access.road.big')} m, so floor area is capped at ${rule('access.big.area').toLocaleString('en-US')} m² (Reg. 33 cl. 2).`;
  }
  return { highRise, reasons, floorAreaCap, capReason, accessRoadCurrent: best?.current ?? 0, accessFrontage: best?.frontage ?? 0 };
}
