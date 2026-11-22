// App state, defaults, URL sharing, and keeping road edges attached to the right edge as the outline changes.
import type { Zone } from '../core/rules';
import { isSupportedZone } from '../core/rules';
import { DEFAULT_SETTINGS, type RoadEdgeInput, type Settings } from '../core/types';
import type { LL } from '../geo/data';
import { soi39Example } from '../geo/example';
import { makeFrame } from '../geo/project';

export type Tool = 'edit' | 'draw' | 'pickRoad' | 'measure';
export interface ViewState {
  satellite: boolean;
  envelope: 'highRise' | 'lowRise' | 'none';
  concept: 'A' | 'B' | 'none';
  buildings: boolean;
  zones: boolean;
  rays: boolean;
}
/** Only condominiums are modelled; office and hotel are shown as not modelled (decisions.md T14). */
export const BUILDING_TYPES = ['condo', 'office', 'hotel'] as const;
export type BuildingType = 'condo';
export const isBuildingType = (t: unknown): t is BuildingType => t === 'condo';
export interface AppState {
  buildingType: BuildingType;
  ring: LL[];
  roads: RoadEdgeInput[];
  zoneOverride: Zone | null;
  settings: Settings;
  view: ViewState;
}

export const DEFAULT_VIEW: ViewState = { satellite: false, envelope: 'highRise', concept: 'A', buildings: true, zones: false, rays: false };

export function exampleState(): AppState {
  const ex = soi39Example();
  return {
    buildingType: 'condo',
    ring: ex.ring,
    roads: [{ edge: ex.roadEdge, width: ex.planned, current: ex.current }],
    zoneOverride: null,
    settings: structuredClone(DEFAULT_SETTINGS),
    view: { ...DEFAULT_VIEW },
  };
}

// ---- URL: inputs live in the hash so a case can be shared ---------------------------------------
const r7 = (x: number) => Math.round(x * 1e9) / 1e9; // ~1 mm: keeps areas true to ~0.01 m²
const r2 = (x: number) => Math.round(x * 100) / 100;

export function encodeState(s: AppState): string {
  const st = s.settings;
  const o = {
    y: s.buildingType,
    p: s.ring.flatMap(([x, y]) => [r7(x), r7(y)]),
    e: s.roads.map((r) => [r.edge, r2(r.width), r2(r.current)]),
    z: s.zoneOverride ?? '',
    b: [st.bonus.affordableArea, st.bonus.rainwaterM3, st.bonus.energyLevel],
    c: st.roadContinuity ? 1 : 0,
    h: [st.groundFloor, st.floorToFloor],
    k: st.parkingAreaPerSpace ?? 0,
    t: st.heightTo === 'planned' ? 1 : 0,
    u: [st.avgUnitArea, st.shareOver60],
    v: [s.view.satellite ? 1 : 0, s.view.envelope, s.view.concept, s.view.buildings ? 1 : 0, s.view.zones ? 1 : 0, s.view.rays ? 1 : 0],
  };
  return 'c=' + encodeURIComponent(JSON.stringify(o));
}

/** A share link: none in the URL, read, or present but unreadable (truncated, garbage, bad corners). */
export type Decoded = { status: 'none' } | { status: 'ok'; state: AppState } | { status: 'invalid' };

export function readLink(hash: string): Decoded {
  if (!/(?:^#?|&)c=/.test(hash)) return { status: 'none' };
  const st = decodeState(hash);
  return st ? { status: 'ok', state: st } : { status: 'invalid' };
}

export function decodeState(hash: string): AppState | null {
  try {
    const m = /(?:^#?|&)c=([^&]+)/.exec(hash);
    if (!m) return null;
    const o = JSON.parse(decodeURIComponent(m[1]));
    if (!o || typeof o !== 'object' || !Array.isArray(o.p) || o.p.length < 6 || o.p.length % 2 !== 0) return null;
    if (o.p.some((x: unknown) => typeof x !== 'number' || !Number.isFinite(x))) return null;
    if (o.e !== undefined && (!Array.isArray(o.e) || o.e.some((e: unknown) => !Array.isArray(e) || e.length < 3 || e.some((x) => typeof x !== 'number' || !Number.isFinite(x))))) return null;
    const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
    const ring: LL[] = [];
    for (let i = 0; i + 1 < (o.p ?? []).length; i += 2) ring.push([num(o.p[i], NaN), num(o.p[i + 1], NaN)]);
    if (ring.some((c) => !Number.isFinite(c[0]) || !Number.isFinite(c[1]))) return null;
    const d = DEFAULT_SETTINGS;
    const settings: Settings = {
      bonus: { affordableArea: num(o.b?.[0], 0), rainwaterM3: num(o.b?.[1], 0), energyLevel: num(o.b?.[2], 0) },
      roadContinuity: o.c !== 0,
      groundFloor: num(o.h?.[0], d.groundFloor),
      floorToFloor: num(o.h?.[1], d.floorToFloor),
      parkingAreaPerSpace: num(o.k, 0) > 0 ? num(o.k, 0) : null,
      heightTo: o.t === 1 ? 'planned' : 'current',
      avgUnitArea: num(o.u?.[0], d.avgUnitArea),
      shareOver60: num(o.u?.[1], d.shareOver60),
    };
    const v = o.v ?? [];
    const env = ['highRise', 'lowRise', 'none'].includes(v[1]) ? v[1] : DEFAULT_VIEW.envelope;
    const con = ['A', 'B', 'none'].includes(v[2]) ? v[2] : DEFAULT_VIEW.concept;
    return {
      buildingType: isBuildingType(o.y) ? o.y : 'condo',
      ring,
      roads: (o.e ?? []).map((e: unknown[]) => ({ edge: num(e[0], -1), width: num(e[1], NaN), current: num(e[2], NaN) })),
      zoneOverride: isSupportedZone(o.z) ? o.z : null,
      settings,
      view: { satellite: v[0] === 1, envelope: env, concept: con, buildings: v[3] !== 0, zones: v[4] !== 0, rays: v[5] !== 0 },
    };
  } catch {
    return null;
  }
}

// ---- Road edges follow the outline ------------------------------------------------------------
/** After the outline changes, move each road edge to the new edge that best matches the old one
 *  (same endpoints, or nearest midpoint with the same direction within 8 m). Unmatched -> edge -1,
 *  which the validator reports as "road edge no longer on the plot". */
export function remapRoads(oldRing: LL[], newRing: LL[], roads: RoadEdgeInput[]): RoadEdgeInput[] {
  if (!roads.length || oldRing.length < 2 || newRing.length < 2) return roads;
  const same = oldRing.length === newRing.length && oldRing.every((p, i) => p[0] === newRing[i][0] && p[1] === newRing[i][1]);
  if (same) return roads;
  const f = makeFrame(oldRing[0]);
  const O = oldRing.map((c) => f.toM(c)), N = newRing.map((c) => f.toM(c));
  const eq = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;
  return roads.map((r) => {
    if (r.edge < 0 || r.edge >= O.length) return { ...r, edge: -1 };
    const a = O[r.edge], b = O[(r.edge + 1) % O.length];
    // exact endpoints
    for (let i = 0; i < N.length; i++) if (eq(N[i], a) && eq(N[(i + 1) % N.length], b)) return { ...r, edge: i };
    // one endpoint kept (the other was dragged), or a midpoint was inserted
    const mo = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const Lo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < N.length; i++) {
      const c = N[i], d = N[(i + 1) % N.length];
      const L = Math.hypot(d[0] - c[0], d[1] - c[1]);
      if (L < 1e-6) continue;
      const dot = ((b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1])) / (Lo * L);
      if (dot < 0.8) continue;
      const shares = eq(c, a) || eq(d, b) ? 0 : 1;
      const mid = Math.hypot((c[0] + d[0]) / 2 - mo[0], (c[1] + d[1]) / 2 - mo[1]);
      const score = shares * 100 + mid;
      if (score < bestScore && (shares === 0 || mid < 8)) { bestScore = score; best = i; }
    }
    return { ...r, edge: best };
  });
}

/** True when every input matches the example: plot, road edges, zone override and settings (not the view). */
export function isExample(s: AppState): boolean {
  const ex = exampleState();
  const sameRing = s.ring.length === ex.ring.length && s.ring.every((p, i) => Math.abs(p[0] - ex.ring[i][0]) < 1e-9 && Math.abs(p[1] - ex.ring[i][1]) < 1e-9);
  return sameRing && s.buildingType === ex.buildingType && canon(s.roads) === canon(ex.roads) && s.zoneOverride === ex.zoneOverride && canon(s.settings) === canon(ex.settings);
}

/** JSON with sorted keys, so two equal objects compare equal whatever order their keys were set in. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
