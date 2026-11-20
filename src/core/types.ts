import type { MultiPoly, Pt, Ring } from './geom';
import type { Zone } from './rules';

export interface RoadEdgeInput {
  /** index i of the plot edge from vertex i to vertex i+1, in the order the plot was drawn */
  edge: number;
  /** legal right-of-way: the planned width where the plan widens the road (art. 36 ¶2), else the road's width */
  width: number;
  /** current right-of-way at the frontage; under `width` means a widening strip comes out of the plot */
  current: number;
}

export interface Bonuses {
  affordableArea: number; // m² of affordable / legacy-resident housing provided (art. 52)
  rainwaterM3: number; // m³ of rainwater storage (art. 55)
  energyLevel: number; // 0-4 certification level (art. 56)
}

export interface Settings {
  bonus: Bonuses;
  roadContinuity: boolean; // Reg. 33 cl. 2: road continues at the same width to another public road
  groundFloor: number; // m, ground floor-to-floor
  floorToFloor: number; // m, typical floor-to-floor
  parkingAreaPerSpace: number | null; // m² gross per space; null = derived from Reg. 41 + allowance
  /** Height plane (Reg. 55 cl. 44) on a road to be widened: measured to the road's current far boundary (strict,
   *  default) or to the planned far line under plan art. 36 ¶2. */
  heightTo: 'current' | 'planned';
  avgUnitArea: number; // m², saleable
  shareOver60: number; // 0-1, share of units over 60 m² (Reg. 7 cl. 2(3))
}

export interface ZonePoly {
  zone: string;
  poly: MultiPoly;
}

export interface SiteInput {
  plot: Ring; // metres, as drawn
  roads: RoadEdgeInput[];
  /** zone polygons near the plot (metres). Ignored when zoneOverride is set. */
  zones: ZonePoly[];
  zoneOverride: Zone | null;
  settings: Settings;
  /** messages produced by the map layer (Bangkok bounds, OSM road overlap, etc.) */
  extraMessages?: Message[];
}

export type Level = 'error' | 'warn' | 'info';
export interface Message {
  level: Level;
  code: string;
  text: string;
}

export interface Road {
  edge: number; // index in the normalised CCW ring
  inputEdge: number;
  a: Pt;
  b: Pt;
  width: number; // legal width used for setbacks and height plane
  current: number;
  strip: number; // widening strip depth taken from the plot
  frontage: number;
  nearA: Pt; // planned road boundary (legal line)
  nearB: Pt;
  farA: Pt; // far boundary the height plane is measured to (per Settings.heightTo), extended along the road
  farB: Pt;
  farAltA: Pt; // the other reading's far boundary (shown as the alternative figure)
  farAltB: Pt;
  centreA: Pt;
  centreB: Pt;
}

export interface Site {
  ring: Ring; // CCW, metres
  plotMP: MultiPoly;
  grossArea: number;
  stripMP: MultiPoly; // widening strips (excluded from plot area)
  stripArea: number;
  netMP: MultiPoly;
  netArea: number;
  roads: Road[];
  roadEdgeSet: Set<number>;
}

export const DEFAULT_SETTINGS: Settings = {
  bonus: { affordableArea: 0, rainwaterM3: 0, energyLevel: 0 },
  roadContinuity: true,
  groundFloor: 4.0,
  floorToFloor: 3.2,
  parkingAreaPerSpace: null,
  heightTo: 'current',
  avgUnitArea: 50,
  shareOver60: 0.25,
};
