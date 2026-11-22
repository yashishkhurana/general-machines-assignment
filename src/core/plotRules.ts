// "Rules for this plot": every governing rule with its sum worked out on this plot's numbers, so a reviewer can
// check each figure from the inputs. Values come from rules.ts and the compute results; nothing here decides a
// result, it only shows the working behind it.
import type { Results } from './compute';
import { isTower, type Concept } from './concepts';
import { planeRange } from './envelope';
import { buildingLine, clearAround, sideEdges, sideSetback, type Footprint } from './footprint';
import { dist, type Pt } from './geom';
import { RULES, rule, zoneFar, zoneFarId, zoneOsrId, type RuleId } from './rules';
import type { Road, Settings, Site } from './types';

export type RuleGroup = 'Floor area' | 'Open space' | 'Setbacks' | 'Height' | 'Building class';
export interface RuleRow {
  group: RuleGroup;
  rule: string;
  ruleIds: RuleId[];
  clause: string;
  source: string;
  working: string;
  result: string;
  limits: string;
  /** set when this row governs (e.g. the open-space requirement that applies) */
  governs?: boolean;
  /** setback rows: the plot edge (metres), for highlighting on the map */
  edge?: { label: number; a: Pt; b: Pt };
  /** machine-readable value of the result, for tests */
  value?: number;
}

const n0 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 0 });
const n1 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const n2 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = (x: number) => `${+(x * 100).toFixed(2)}%`;
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const tag = (ids: RuleId[]) => ({
  ruleIds: ids,
  clause: uniq(ids.flatMap((i) => RULES[i].clause.split('; ')).filter((c) => c !== '—')).join('; ') || '—',
  source: uniq(ids.map((i) => RULES[i].source)).join(', '),
});

/** The design the setback and height rows describe: the selected card, or (no fit) the one-storey blank-wall block. */
interface Design { title: string; tower: boolean; blank: boolean; storeys: number; height: number; fp: Footprint; concept: Concept | null }

function designOf(r: Results, c: Concept | null, s: Settings): Design | null {
  if (c?.ok) return { title: c.title, tower: isTower(c), blank: c.kind === 'low-rise blank', storeys: c.storeys, height: c.roofDeck, fp: c.footprint, concept: c };
  if (r.noFit) return { title: 'One-storey block, blank side walls (the most generous; nothing fits)', tower: false, blank: true, storeys: 1, height: s.groundFloor, fp: r.noFit.footprint, concept: null };
  return null;
}

/** How the low-rise building line from the road comes about (Reg. 55 cl. 41 = Ordinance cl. 50), for planned width W. */
function buildingLineWorking(W: number, storeys: number, height: number): { text: string; ids: RuleId[] } {
  const bl = buildingLine(W, storeys, height);
  if (W < rule('front.narrow.road')) return { text: `road under ${rule('front.narrow.road')} m: ${rule('front.narrow.dist')} − ${n2(W)}/2 = ${n2(bl)} m`, ids: ['front.narrow.road', 'front.narrow.dist'] };
  if (!(storeys > rule('front.tier.storeys') || height > rule('front.tier.height'))) return { text: `${storeys} storey${storeys > 1 ? 's' : ''}, ${n1(height)} m (not over ${rule('front.tier.storeys')} storeys or ${rule('front.tier.height')} m): no building line`, ids: ['front.tier.storeys', 'front.tier.height'] };
  if (W < rule('front.tier1.road')) return { text: `road under ${rule('front.tier1.road')} m: ${rule('front.tier1.dist')} − ${n2(W)}/2 = ${n2(bl)} m`, ids: ['front.tier1.road', 'front.tier1.dist'] };
  if (W < rule('front.tier3.road')) return { text: `road ${rule('front.tier1.road')}–${rule('front.tier3.road')} m: ${rule('front.tier2.factor')} × ${n2(W)} = ${n2(bl)} m`, ids: ['front.tier2.factor'] };
  return { text: `road ${rule('front.tier3.road')} m or more: ${n2(bl)} m`, ids: ['front.tier3.road', 'front.tier3.dist'] };
}

const clearWorking = (h: number) => ({
  text: `clear space ${n1(clearAround(h))} m (roof deck ${n1(h)} m ${h > rule('clear.height') ? 'over' : 'at most'} ${rule('clear.height')} m)`,
  ids: [h > rule('clear.height') ? 'clear.high' : 'clear.low', 'clear.height'] as RuleId[],
});

function setbackRows(site: Site, d: Design): RuleRow[] {
  const rows: RuleRow[] = [];
  const n = site.ring.length;
  const sides = sideEdges(site);
  for (let i = 0; i < n; i++) {
    const a = site.ring[i], b = site.ring[(i + 1) % n];
    const label = site.inputEdge[i] + 1;
    const road = site.roads.find((x) => x.edge === i);
    const sb = d.fp.setbacks.find((x) => x.edge === i)!;
    const role = road ? 'road' : sides.has(i) ? 'side' : 'rear';
    let working: string, ids: RuleId[];
    if (d.tower) {
      if (road) {
        const bl = buildingLineWorking(road.width, 99, 99);
        working = `max(${rule('hr.setback')} m all round; building line: ${bl.text}), from the planned road line (${n2(road.width)} m wide)`;
        ids = ['hr.setback', ...bl.ids];
      } else { working = `${rule('hr.setback')} m from every boundary, above and below ground`; ids = ['hr.setback']; }
    } else if (road) {
      const bl = buildingLineWorking(road.width, d.storeys, d.height), cl = clearWorking(d.height);
      working = `max(building line: ${bl.text}; ${cl.text}), from the planned road line (${n2(road.width)} m wide)`;
      ids = [...bl.ids, ...cl.ids];
    } else if (d.blank && sides.has(i)) {
      const cl = clearWorking(d.height);
      working = `blank side wall: ${cl.text} only`;
      ids = cl.ids;
    } else {
      const ss = sideSetback(d.storeys, d.height), cl = clearWorking(d.height);
      const high = ss === rule('side.high');
      working = `max(walls with openings: ${n1(ss)} m (${d.storeys} storeys, ${n1(d.height)} m: ${high ? `over ${rule('side.storeys')} storeys or ${rule('side.height')} m` : `up to ${rule('side.storeys')} storeys and ${rule('side.height')} m`}); ${cl.text})`;
      ids = [high ? 'side.high' : 'side.low', 'side.storeys', 'side.height', ...cl.ids];
    }
    if (sb.strip > 0) working += `; ${n2(sb.setback + sb.strip)} m from the current edge, after the ${n2(sb.strip)} m widening strip`;
    rows.push({
      group: 'Setbacks', rule: `Edge ${label} (${role}, ${n1(dist(a, b))} m)`, ...tag(uniq(ids)), working,
      result: `${n2(sb.setback)} m`,
      limits: d.title, edge: { label, a, b }, value: sb.setback,
    });
  }
  return rows;
}

/** Distance from the planned road line to the far boundary the plane is measured to, and how it's made up. */
function farDistance(road: Road, heightTo: 'current' | 'planned') {
  if (heightTo === 'planned') return { d: road.width, text: `${n2(road.width)} m planned road` };
  const d = road.current + road.strip;
  return { d, text: road.strip > 0 ? `${n2(road.current)} m road as it is today + ${n2(road.strip)} m widening strip = ${n2(d)} m` : `${n2(road.current)} m road as it is today` };
}

export function plotRules(r: Results, c: Concept | null, s: Settings): RuleRow[] {
  const site = r.site, far = r.far, zone = r.zone, avail = r.avail;
  if (!site || !far || !zone || !avail) return [];
  const rows: RuleRow[] = [];
  const d = designOf(r, c, s);
  const parts = zone.supported;

  // ---- floor area
  rows.push({ group: 'Floor area', rule: 'Net plot area', ruleIds: [], clause: 'Plan art. 36 ¶2, art. 45 (widening strip)', source: 'gazette',
    working: site.stripArea > 0 ? `${n0(site.grossArea)} m² drawn − ${n0(site.stripArea)} m² widening strip` : `${n0(site.grossArea)} m² drawn, no widening strip`,
    result: `${n0(site.netArea)} m²`, limits: 'every design', value: site.netArea });
  rows.push({ group: 'Floor area', rule: 'Zone floor area ratio', ...tag(parts.map((p) => zoneFarId(p.zone))),
    working: parts.map((p) => `${n0(p.area)} m² × ${zoneFar(p.zone)} (${p.zone})`).join(' + '),
    result: `${n0(far.baseFloorArea)} m²`, limits: 'every design', value: far.baseFloorArea });
  const bp = far.bonusPct;
  rows.push({ group: 'Floor area', rule: 'Bonus and permitted floor area', ...tag(['bonus.cap', 'bonus.affordable.multiple', 'bonus.rain.per', 'bonus.energy.step']),
    working: bp.requested > 0
      ? `${n0(far.baseFloorArea)} m² × (1 + ${pct(bp.applied)}): affordable ${pct(bp.affordable)}, rainwater ${pct(bp.rainwater)}, energy ${pct(bp.energy)}${bp.clamped ? `, capped at ${pct(rule('bonus.cap'))}` : ` (cap ${pct(rule('bonus.cap'))})`}`
      : `${n0(far.baseFloorArea)} m² × (1 + 0%): no bonus claimed (cap ${pct(rule('bonus.cap'))}, art. 57)`,
    result: `${n0(far.permitted)} m²`, limits: 'every design', value: far.permitted, governs: true });
  if (avail.floorAreaCap !== null) rows.push({ group: 'Floor area', rule: 'Floor area cap on a road under 18 m', ...tag(['access.big.area', 'access.road.big']),
    working: `access road ${n2(avail.accessRoadCurrent)} m (today) is under ${rule('access.road.big')} m`, result: `≤ ${n0(avail.floorAreaCap)} m²`, limits: 'towers', value: avail.floorAreaCap, governs: avail.floorAreaCap < far.permitted });
  if (d?.tower) rows.push({ group: 'Floor area', rule: 'Ratio cap for tall buildings', ...tag(['far.cap.reg33']),
    working: `${n0(site.netArea)} m² × ${rule('far.cap.reg33')}`, result: `≤ ${n0(site.netArea * rule('far.cap.reg33'))} m²`, limits: 'towers', value: site.netArea * rule('far.cap.reg33'), governs: site.netArea * rule('far.cap.reg33') < far.permitted });
  if (d && !d.tower) rows.push({ group: 'Floor area', rule: 'Low-rise total (parking included)', ...tag(['class.extralarge.area']),
    working: `under ${n0(rule('class.extralarge.area'))} m², basements included, to stay low-rise`, result: `< ${n0(rule('class.extralarge.area'))} m²`, limits: 'low-rise blocks', value: rule('class.extralarge.area') });

  // ---- open space (selected design)
  const con = d?.concept;
  if (con) {
    const req = con.openSpace.req, os = con.openSpace;
    const osrIds = parts.map((p) => zoneOsrId(p.zone));
    const F = req.reg55 / rule('os.reg55');
    const opts: [typeof req.binding, string, RuleId[], string, number | null][] = [
      ['plan', 'Plan open-space ratio', osrIds, `${pct(far.osrWeighted)} × ${n0(con.total)} m² floor area`, req.plan],
      ['reg33', '30% of the plot (high-rise / extra-large)', ['os.reg33'], `${pct(rule('os.reg33'))} × ${n0(site.netArea)} m²`, req.reg33],
      ['ord52', '30% of the plot (residential)', ['os.ord52'], `${pct(rule('os.ord52'))} × ${n0(site.netArea)} m²`, req.ord52],
      ['reg55', '30% of the largest floor', ['os.reg55'], `${pct(rule('os.reg55'))} × ${n0(F)} m² largest floor`, req.reg55],
    ];
    for (const [k, name, ids, working, v] of opts) {
      if (v === null) continue;
      rows.push({ group: 'Open space', rule: name, ...tag(ids), working, result: `${n0(v)} m²${k === req.binding ? ' (governs)' : ''}`, limits: con.title, value: v, governs: k === req.binding });
    }
    rows.push({ group: 'Open space', rule: 'Open space provided', ruleIds: [], clause: '—', source: 'computed',
      working: `${n0(site.netArea)} m² net plot − ${n0(site.netArea - os.provided)} m² ground floor`, result: `${n0(os.provided)} m² (${os.provided >= req.governing - 1e-6 ? 'enough' : 'short'})`, limits: con.title, value: os.provided });
    rows.push({ group: 'Open space', rule: 'Planted half (reading b)', ...tag(['planted.share']),
      working: `${pct(rule('planted.share'))} × ${n0(req.governing)} m² governing requirement; ${n0(os.plantedCapacity)} m² available${isTower(con) ? ' outside the paved fire ring' : ''}`,
      result: `${n0(req.plantedB)} m² needed: ${os.plantedCapacity >= req.plantedB - 1e-6 ? 'pass' : 'fail'}`, limits: con.title, value: req.plantedB });
    rows.push({ group: 'Open space', rule: 'Planted half (reading c, warning only)', ...tag(['planted.share']),
      working: `${pct(rule('planted.share'))} × ${n0(os.provided)} m² open space provided; ${n0(os.plantedCapacity)} m² available`,
      result: `${n0(os.plantedC)} m²: ${os.plantedCapacity >= os.plantedC - 1e-6 ? 'met' : 'warning'}`, limits: con.title, value: os.plantedC });
  }

  // ---- setbacks, per edge, for the selected design
  if (d) rows.push(...setbackRows(site, d));

  // ---- height
  const heightTo = r.plane?.heightTo ?? 'current';
  if (d) {
    for (const road of site.roads) {
      const sb = d.fp.setbacks.find((x) => x.edge === road.edge)!.setback;
      const fd = farDistance(road, heightTo);
      const h = rule('height.plane') * (sb + fd.d);
      rows.push({ group: 'Height', rule: `Height plane from edge ${site.inputEdge[road.edge] + 1}`, ...tag(['height.plane']),
        working: `${rule('height.plane')} × (${n2(sb)} m front setback + ${fd.text} to the far side); rises ${rule('height.plane')} m per metre further back`,
        result: `${n1(h)} m at the front line`, limits: d.title, value: h });
    }
    if (!d.tower) rows.push({ group: 'Height', rule: d.blank ? 'Blank-wall ceiling' : 'Low-rise ceiling', ...tag(d.blank ? ['clear.height', 'clear.low'] : ['class.highrise.height']),
      working: d.blank ? `roof deck at most ${rule('clear.height')} m so ${rule('clear.low')} m clear space is enough beside the blank side walls` : `roof deck under ${rule('class.highrise.height')} m to stay low-rise`,
      result: `${n1(d.height)} m ${d.blank ? `≤ ${rule('clear.height')}` : `< ${rule('class.highrise.height')}`} m`, limits: d.title, value: d.blank ? rule('clear.height') : rule('class.highrise.height') });
    const above = con?.floors.filter((f) => !f.level.startsWith('B')) ?? [];
    const top = above[above.length - 1];
    if (top) {
      const lim = planeRange(site, top.plate).min;
      const z = top.z1 + rule('a.parapet');
      rows.push({ group: 'Height', rule: 'Roof and parapet against the plane', ...tag(['height.plane', 'a.parapet']),
        working: `floor ${top.level}: roof deck ${n2(top.z1)} m + ${rule('a.parapet')} m parapet = ${n2(z)} m; limit at its closest point ${n2(lim)} m`,
        result: `${n1(lim - z)} m to spare`, limits: d.title, value: lim - z });
    }
  }

  // ---- building class and access
  if (con) {
    const largest = Math.max(0, ...con.floors.map((f) => f.area));
    rows.push({ group: 'Building class', rule: 'High-rise test', ...tag(['class.highrise.height']),
      working: `roof deck ${n1(con.roofDeck)} m ${con.roofDeck >= rule('class.highrise.height') ? '≥' : '<'} ${rule('class.highrise.height')} m`,
      result: con.cls.highRise ? 'high-rise' : 'not high-rise', limits: con.title });
    rows.push({ group: 'Building class', rule: 'Extra-large test', ...tag(['class.extralarge.area']),
      working: `total ${n0(con.total)} m², largest floor ${n0(largest)} m², against ${n0(rule('class.extralarge.area'))} m²`,
      result: con.cls.extraLarge ? 'extra-large' : 'not extra-large', limits: con.title });
  }
  const best = site.roads.slice().sort((a, b) => b.current - a.current)[0];
  rows.push({ group: 'Building class', rule: 'Access for a high-rise or extra-large building', ...tag(['access.frontage', 'access.road']),
    working: best ? `frontage ${n1(avail.highRise ? avail.accessFrontage : Math.max(...site.roads.map((x) => x.frontage)))} m (needs ${rule('access.frontage')} m) on a road ${n2(avail.highRise ? avail.accessRoadCurrent : best.current)} m wide today (needs ${rule('access.road')} m), continuing to another road: ${s.roadContinuity ? 'yes' : 'not confirmed'}` : 'no road edge',
    result: avail.highRise ? 'allowed' : 'not allowed: low-rise only', limits: 'towers' });
  return rows;
}
