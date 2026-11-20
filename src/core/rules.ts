// The one rules table. Every rule value used by the calculation lives here, with its clause and source.
// Source tags (every rule was read through a third-party copy; none on the Royal Gazette's own site):
//   gazette          - the Thai text, read in the Association of Siamese Architects' (ASA) PDF copies at
//                      download.asa.or.th: the 2556 plan (mr56-bma.pdf, mr56-bma-full.pdf), the Bangkok Building
//                      Control Ordinance B.E. 2544 (bb44-03.pdf), and ASA's consolidated Thai texts of Reg. 33
//                      (cba/mr/mr35-33-upd69.pdf) and Reg. 55 (cba/mr/mr43-55-upd68.pdf), which include later
//                      amendments as footnotes (checked 21 Nov 2026)
//   Reg. translation - only the IIBH English translation of the Ministerial Regulations (Thai_02_MRs.pdf), not the
//                      Thai text; it predates amendments such as Reg. 68 (B.E. 2563)
//   assumed          - a modelling assumption made by this tool, not law
// `verified: false` marks rules whose wording has only been seen in secondary sources.

export type Source = 'gazette' | 'Reg. translation' | 'assumed';

export interface Rule {
  id: string;
  value: number;
  unit: string;
  label: string;
  clause: string;
  source: Source;
  appliesTo: string;
  verified?: boolean;
  note?: string;
}

const R = (r: Rule) => r;

export const RULES = {
  // ---- City plan B.E. 2556: zone ratios -------------------------------------------------------
  'far.y8': R({ id: 'far.y8', value: 6, unit: ':1', label: 'Floor area ratio, ย.8', clause: 'Plan art. 15', source: 'gazette', appliesTo: 'ย.8' }),
  'far.y9': R({ id: 'far.y9', value: 7, unit: ':1', label: 'Floor area ratio, ย.9', clause: 'Plan art. 16', source: 'gazette', appliesTo: 'ย.9' }),
  'far.y10': R({ id: 'far.y10', value: 8, unit: ':1', label: 'Floor area ratio, ย.10', clause: 'Plan art. 17', source: 'gazette', appliesTo: 'ย.10' }),
  'osr.y8': R({ id: 'osr.y8', value: 0.05, unit: '× floor area', label: 'Open space ratio, ย.8', clause: 'Plan art. 15', source: 'gazette', appliesTo: 'ย.8' }),
  'osr.y9': R({ id: 'osr.y9', value: 0.045, unit: '× floor area', label: 'Open space ratio, ย.9', clause: 'Plan art. 16', source: 'gazette', appliesTo: 'ย.9' }),
  'osr.y10': R({ id: 'osr.y10', value: 0.04, unit: '× floor area', label: 'Open space ratio, ย.10', clause: 'Plan art. 17', source: 'gazette', appliesTo: 'ย.10' }),
  'planted.share': R({ id: 'planted.share', value: 0.5, unit: '× open space', label: 'Planted, permeable share of open space', clause: 'Plan arts. 15–17', source: 'gazette', appliesTo: 'all', note: 'Pass/fail uses half of the governing open-space requirement (reading b). Half of the open space actually provided (reading c) is shown as a warning.' }),

  // ---- City plan: bonuses ---------------------------------------------------------------------
  'bonus.cap': R({ id: 'bonus.cap', value: 0.2, unit: '× base ratio', label: 'All bonuses combined', clause: 'Plan art. 57', source: 'gazette', appliesTo: 'ย.8–ย.10' }),
  'bonus.affordable.multiple': R({ id: 'bonus.affordable.multiple', value: 4, unit: '× affordable area', label: 'Affordable-housing bonus: extra floor area up to 4× the affordable area provided', clause: 'Plan art. 52', source: 'gazette', appliesTo: 'residential' }),
  'bonus.affordable.cap': R({ id: 'bonus.affordable.cap', value: 0.2, unit: '× base ratio', label: 'Affordable-housing bonus ceiling', clause: 'Plan art. 52', source: 'gazette', appliesTo: 'residential' }),
  'bonus.rain.per': R({ id: 'bonus.rain.per', value: 0.05, unit: 'per 1 m³ per 50 m² of land', label: 'Rainwater storage bonus, in proportion', clause: 'Plan art. 55', source: 'gazette', appliesTo: 'all' }),
  'bonus.rain.landPerM3': R({ id: 'bonus.rain.landPerM3', value: 50, unit: 'm² of land', label: 'Land area per 1 m³ of storage for one 5% step', clause: 'Plan art. 55', source: 'gazette', appliesTo: 'all' }),
  'bonus.rain.cap': R({ id: 'bonus.rain.cap', value: 0.2, unit: '× base ratio', label: 'Rainwater bonus ceiling', clause: 'Plan art. 55', source: 'gazette', appliesTo: 'all' }),
  'bonus.energy.step': R({ id: 'bonus.energy.step', value: 0.05, unit: 'per level (1–4)', label: 'Energy-certified building bonus, +5/10/15/20%', clause: 'Plan art. 56', source: 'gazette', appliesTo: 'all' }),
  'far.cap.reg33': R({ id: 'far.cap.reg33', value: 10, unit: ':1', label: 'Ratio cap, high-rise and extra-large', clause: 'Reg. 33 cl. 5', source: 'gazette', appliesTo: 'high-rise, extra-large' }),

  // ---- Building classes -----------------------------------------------------------------------
  'class.highrise.height': R({ id: 'class.highrise.height', value: 23, unit: 'm', label: 'High-rise: roof deck height from ground', clause: 'Reg. 33 cl. 1', source: 'gazette', appliesTo: 'all' }),
  'class.extralarge.margin': R({ id: 'class.extralarge.margin', value: 0.01, unit: '× 10,000 m²', label: 'Margin under 10,000 m² below which a low-rise result is flagged as fragile', clause: '—', source: 'assumed', appliesTo: 'low-rise' }),
  'class.extralarge.area': R({ id: 'class.extralarge.area', value: 10000, unit: 'm²', label: 'Extra-large: total floor area, or any single floor', clause: 'Reg. 33 cl. 1', source: 'gazette', appliesTo: 'all' }),
  'class.large.area': R({ id: 'class.large.area', value: 2000, unit: 'm²', label: 'Large building: total floor area over', clause: 'Reg. 7 cl. 1(12); Reg. 55', source: 'Reg. translation', appliesTo: 'all' }),
  'class.large.altHeight': R({ id: 'class.large.altHeight', value: 15, unit: 'm', label: 'Large building also: over 15 m with over 1,000 m²', clause: 'Reg. 7 cl. 1(12)', source: 'Reg. translation', appliesTo: 'all' }),
  'class.large.altArea': R({ id: 'class.large.altArea', value: 1000, unit: 'm²', label: 'Large building alt. floor area', clause: 'Reg. 7 cl. 1(12)', source: 'Reg. translation', appliesTo: 'all' }),

  // ---- Access for high-rise / extra-large -----------------------------------------------------
  'access.frontage': R({ id: 'access.frontage', value: 12, unit: 'm', label: 'Frontage on a public road', clause: 'Reg. 33 cl. 2', source: 'gazette', appliesTo: 'high-rise, extra-large', note: 'That 12 m strip must stay open as a fire-engine entrance up to the building (cl. 2 ¶3).' }),
  'access.road': R({ id: 'access.road', value: 10, unit: 'm', label: 'Road right-of-way, floor area up to 30,000 m²', clause: 'Reg. 33 cl. 2', source: 'gazette', appliesTo: 'high-rise, extra-large' }),
  'access.road.big': R({ id: 'access.road.big', value: 18, unit: 'm', label: 'Road right-of-way, floor area over 30,000 m²', clause: 'Reg. 33 cl. 2', source: 'gazette', appliesTo: 'high-rise, extra-large' }),
  'access.big.area': R({ id: 'access.big.area', value: 30000, unit: 'm²', label: 'Floor area above which an 18 m road is needed', clause: 'Reg. 33 cl. 2', source: 'gazette', appliesTo: 'high-rise, extra-large' }),

  // ---- Setbacks ---------------------------------------------------------------------------------
  'hr.setback': R({ id: 'hr.setback', value: 6, unit: 'm', label: 'High-rise: every part above and below ground from boundary and road (foundations are exempt; the tool applies 6 m to the whole footprint, which is stricter)', clause: 'Reg. 33 cl. 4', source: 'gazette', appliesTo: 'high-rise, extra-large' }),
  'hr.fireRoad': R({ id: 'hr.fireRoad', value: 6, unit: 'm', label: 'Fire-engine road with a traffic surface at least 6 m wide, unroofed, all round the building', clause: 'Reg. 33 cl. 3 (as amended by Reg. 50)', source: 'gazette', appliesTo: 'high-rise, extra-large', note: 'The Thai text requires a road surface (the IIBH translation\'s "road or open space" is the older wording). Where a widening line applies, its width counts from that line (cl. 3 ¶3). Modelled as a paved 6 m ring inside the planned line.' }),
  'front.narrow.road': R({ id: 'front.narrow.road', value: 6, unit: 'm', label: 'Road under 6 m: building line 3 m from centreline', clause: 'Reg. 55 cl. 41; Ordinance cl. 50', source: 'gazette', appliesTo: 'all' }),
  'front.narrow.dist': R({ id: 'front.narrow.dist', value: 3, unit: 'm from centreline', label: 'Building line on a road under 6 m', clause: 'Reg. 55 cl. 41; Ordinance cl. 50', source: 'gazette', appliesTo: 'all' }),
  'front.tier1.road': R({ id: 'front.tier1.road', value: 10, unit: 'm', label: 'Road under 10 m: 6 m from centreline (building over 2 storeys or 8 m)', clause: 'Reg. 55 cl. 41; Ordinance cl. 50', source: 'gazette', appliesTo: 'over 2 storeys / 8 m' }),
  'front.tier1.dist': R({ id: 'front.tier1.dist', value: 6, unit: 'm from centreline', label: 'Building line on a road under 10 m', clause: 'Reg. 55 cl. 41; Ordinance cl. 50', source: 'gazette', appliesTo: 'over 2 storeys / 8 m' }),
  'front.tier2.factor': R({ id: 'front.tier2.factor', value: 0.1, unit: '× road width', label: 'Road 10–20 m: 1/10 of the width from the road boundary', clause: 'Reg. 55 cl. 41; Ordinance cl. 50', source: 'gazette', appliesTo: 'over 2 storeys / 8 m' }),
  'front.tier3.road': R({ id: 'front.tier3.road', value: 20, unit: 'm', label: 'Road width from which the 2 m building line applies', clause: 'Reg. 55 cl. 41; Ordinance cl. 50', source: 'gazette', appliesTo: 'over 2 storeys / 8 m' }),
  'front.tier3.dist': R({ id: 'front.tier3.dist', value: 2, unit: 'm', label: 'Building line on a road of 20 m or more', clause: 'Reg. 55 cl. 41; Ordinance cl. 50', source: 'gazette', appliesTo: 'over 2 storeys / 8 m' }),
  'front.tier.storeys': R({ id: 'front.tier.storeys', value: 2, unit: 'storeys', label: 'Tiers apply above 2 storeys', clause: 'Reg. 55 cl. 41', source: 'gazette', appliesTo: 'all' }),
  'front.tier.height': R({ id: 'front.tier.height', value: 8, unit: 'm', label: 'Tiers apply above 8 m', clause: 'Reg. 55 cl. 41', source: 'gazette', appliesTo: 'all' }),
  'clear.low': R({ id: 'clear.low', value: 1, unit: 'm', label: 'Clear space all round a building up to 15 m', clause: 'Ordinance cl. 55', source: 'gazette', appliesTo: 'all' }),
  'clear.high': R({ id: 'clear.high', value: 2, unit: 'm', label: 'Clear space all round a building over 15 m (road side included)', clause: 'Ordinance cl. 55', source: 'gazette', appliesTo: 'all' }),
  'clear.height': R({ id: 'clear.height', value: 15, unit: 'm', label: 'Height above which 2 m clear applies', clause: 'Ordinance cl. 55', source: 'gazette', appliesTo: 'all' }),
  'side.low': R({ id: 'side.low', value: 2, unit: 'm', label: 'Walls with openings from boundary, up to 2 storeys and 9 m', clause: 'Ordinance cl. 54; Reg. 55 cl. 50', source: 'gazette', appliesTo: 'low-rise' }),
  'side.high': R({ id: 'side.high', value: 3, unit: 'm', label: 'Walls with openings from boundary, 3rd storey up or over 9 m', clause: 'Ordinance cl. 54; Reg. 55 cl. 50', source: 'gazette', appliesTo: 'low-rise' }),
  'side.height': R({ id: 'side.height', value: 9, unit: 'm', label: 'Height above which 3 m applies', clause: 'Ordinance cl. 54', source: 'gazette', appliesTo: 'low-rise' }),
  'side.storeys': R({ id: 'side.storeys', value: 2, unit: 'storeys', label: 'Storeys above which 3 m applies', clause: 'Ordinance cl. 54', source: 'gazette', appliesTo: 'low-rise' }),
  'face.fraction': R({ id: 'face.fraction', value: 1 / 8, unit: '× outer perimeter', label: 'Road-side face longer than 1/8 of the building perimeter', clause: 'Ordinance cl. 53', source: 'gazette', appliesTo: 'building on a public way' }),
  'face.within': R({ id: 'face.within', value: 20, unit: 'm', label: 'Road-side face within 20 m of the road', clause: 'Ordinance cl. 53', source: 'gazette', appliesTo: 'building on a public way' }),

  // ---- Height ---------------------------------------------------------------------------------
  'height.plane': R({ id: 'height.plane', value: 2, unit: '× distance', label: 'Height at any point ≤ 2 × horizontal distance to the far boundary of the nearest road (default: the road as it is now; option: the planned far line under art. 36 ¶2)', clause: 'Reg. 55 cl. 44; Ordinance cl. 49', source: 'gazette', appliesTo: 'all', note: 'Cl. 44 ¶3 (added by Reg. 68, B.E. 2563): other structures standing on the roof are not counted in the height.' }),

  // ---- Open space -----------------------------------------------------------------------------
  'os.reg33': R({ id: 'os.reg33', value: 0.3, unit: '× plot', label: 'Open land, residential high-rise / extra-large', clause: 'Reg. 33 cl. 6', source: 'gazette', appliesTo: 'high-rise, extra-large' }),
  'os.ord52': R({ id: 'os.ord52', value: 0.3, unit: '× plot', label: 'Open land, residential building', clause: 'Ordinance cl. 52(1)', source: 'gazette', appliesTo: 'residential' }),
  'os.reg55': R({ id: 'os.reg55', value: 0.3, unit: '× largest floor', label: 'Open space, residential', clause: 'Reg. 55 cl. 33', source: 'gazette', appliesTo: 'residential' }),

  // ---- Parking --------------------------------------------------------------------------------
  'park.unit.threshold': R({ id: 'park.unit.threshold', value: 60, unit: 'm² per unit', label: 'Condo parking applies to units over 60 m²', clause: 'Reg. 7 cl. 2(3)', source: 'Reg. translation', appliesTo: 'condominium' }),
  'park.perUnit': R({ id: 'park.perUnit', value: 1, unit: 'space per unit', label: 'Condominium in Bangkok: 1 space per unit (units over 60 m²)', clause: 'Reg. 7 cl. 3(1)(C)', source: 'Reg. translation', appliesTo: 'condominium' }),
  'park.large.divisor': R({ id: 'park.large.divisor', value: 120, unit: 'm² per space', label: 'Large building in Bangkok: 1 space per 120 m², or the per-use count if more', clause: 'Reg. 7 cl. 3(1)(H)', source: 'Reg. translation', appliesTo: 'large building', note: 'Applied to total floor area including the parking itself (stricter reading).' }),
  'park.stall.w': R({ id: 'park.stall.w', value: 2.4, unit: 'm', label: 'Stall width', clause: 'Reg. 41 cl. 2', source: 'Reg. translation', appliesTo: 'all' }),
  'park.stall.l': R({ id: 'park.stall.l', value: 5.0, unit: 'm', label: 'Stall length, perpendicular to the aisle', clause: 'Reg. 41 cl. 2(2)', source: 'Reg. translation', appliesTo: 'all' }),
  'park.aisle': R({ id: 'park.aisle', value: 6.0, unit: 'm', label: 'Two-way driveway width', clause: 'Reg. 7 cl. 8', source: 'Reg. translation', appliesTo: 'all' }),
  'park.circulation': R({ id: 'park.circulation', value: 1.4, unit: '× stall + half aisle', label: 'Allowance for ramps, turning, columns and cores in a parking floor', clause: '—', source: 'assumed', appliesTo: 'all' }),
  'park.headroom': R({ id: 'park.headroom', value: 2.1, unit: 'm', label: 'Clear height in parking areas', clause: 'Reg. 41 cl. 4', source: 'Reg. translation', appliesTo: 'all' }),

  // ---- Units ----------------------------------------------------------------------------------
  'unit.minArea': R({ id: 'unit.minArea', value: 20, unit: 'm²', label: 'Minimum unit area', clause: 'Reg. 55 cl. 19', source: 'gazette', appliesTo: 'residential' }),
  'unit.minF2F': R({ id: 'unit.minF2F', value: 2.6, unit: 'm', label: 'Minimum residential floor-to-floor', clause: 'Reg. 55 cl. 22', source: 'gazette', appliesTo: 'residential' }),
  'unit.corridor': R({ id: 'unit.corridor', value: 1.5, unit: 'm', label: 'Minimum common corridor width', clause: 'Reg. 55 cl. 21', source: 'gazette', appliesTo: 'residential' }),

  // ---- Environmental review (flag only) ------------------------------------------------------
  'eia.units': R({ id: 'eia.units', value: 80, unit: 'units', label: 'Environmental review: residential with 80+ units', clause: 'ONEP notification', source: 'assumed', appliesTo: 'residential', verified: false, note: 'Only secondary sources read. Shown as a note, never as pass/fail.' }),
  'eia.area': R({ id: 'eia.area', value: 4000, unit: 'm²', label: 'Environmental review: residential of 4,000 m² or more', clause: 'ONEP notification', source: 'assumed', appliesTo: 'residential', verified: false, note: 'Only secondary sources read. Shown as a note, never as pass/fail.' }),

  // ---- Tool assumptions -----------------------------------------------------------------------
  'a.parapet': R({ id: 'a.parapet', value: 1.2, unit: 'm', label: 'Parapet that must sit under the height plane', clause: '—', source: 'assumed', appliesTo: 'concepts' }),
  'a.roofPlant': R({ id: 'a.roofPlant', value: 4, unit: 'm', label: 'Roof plant over the core (lift overrun, stair head), checked against the plane', clause: '—', source: 'assumed', appliesTo: 'concepts', note: 'Reg. 55 cl. 44 ¶3 exempts separate rooftop structures (tanks, masts); a lift overrun or stair head is part of the building, so the check stays, as a warning.' }),
  'a.roofPlantArea': R({ id: 'a.roofPlantArea', value: 60, unit: 'm²', label: 'Roof plant footprint over the core', clause: '—', source: 'assumed', appliesTo: 'concepts' }),
  'a.minPlate': R({ id: 'a.minPlate', value: 100, unit: 'm²', label: 'Smallest usable floor plate', clause: '—', source: 'assumed', appliesTo: 'concepts' }),
  'a.efficiency': R({ id: 'a.efficiency', value: 0.75, unit: '× residential floor area', label: 'Saleable share of residential floor area', clause: '—', source: 'assumed', appliesTo: 'unit count' }),
  'a.maxFloors': R({ id: 'a.maxFloors', value: 80, unit: 'floors', label: 'Generator stop (safety)', clause: '—', source: 'assumed', appliesTo: 'concepts' }),
  'a.circleSegs': R({ id: 'a.circleSegs', value: 12, unit: 'segments per quarter', label: 'Round-cap smoothness of setback strips', clause: '—', source: 'assumed', appliesTo: 'geometry' }),

  // ---- Validation bounds (tool limits, not law) ----------------------------------------------
  'v.minArea': R({ id: 'v.minArea', value: 100, unit: 'm²', label: 'Smallest plot accepted', clause: '—', source: 'assumed', appliesTo: 'validation' }),
  'v.maxArea': R({ id: 'v.maxArea', value: 50000, unit: 'm²', label: 'Largest plot accepted', clause: '—', source: 'assumed', appliesTo: 'validation' }),
  'v.maxRoad': R({ id: 'v.maxRoad', value: 100, unit: 'm', label: 'Widest road accepted', clause: '—', source: 'assumed', appliesTo: 'validation' }),
  'v.minEdge': R({ id: 'v.minEdge', value: 0.5, unit: 'm', label: 'Shortest plot edge accepted', clause: '—', source: 'assumed', appliesTo: 'validation' }),
} as const satisfies Record<string, Rule>;

export type RuleId = keyof typeof RULES;

export const rule = (id: RuleId): number => RULES[id].value;

export const SUPPORTED_ZONES = ['ย.8', 'ย.9', 'ย.10'] as const;
export type Zone = (typeof SUPPORTED_ZONES)[number];

export const zoneFar = (z: Zone) => rule(z === 'ย.8' ? 'far.y8' : z === 'ย.9' ? 'far.y9' : 'far.y10');
export const zoneOsr = (z: Zone) => rule(z === 'ย.8' ? 'osr.y8' : z === 'ย.9' ? 'osr.y9' : 'osr.y10');
export const zoneFarId = (z: Zone): RuleId => (z === 'ย.8' ? 'far.y8' : z === 'ย.9' ? 'far.y9' : 'far.y10');
export const zoneOsrId = (z: Zone): RuleId => (z === 'ย.8' ? 'osr.y8' : z === 'ย.9' ? 'osr.y9' : 'osr.y10');
export const isSupportedZone = (z: string): z is Zone => (SUPPORTED_ZONES as readonly string[]).includes(z);
