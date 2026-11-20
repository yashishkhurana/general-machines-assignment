// Static data shipped with the app (built by scripts/build-data.mjs; see src/data/meta.json).
import buildingsJson from '../data/buildings.json';
import roadsJson from '../data/roads.json';
import zonesJson from '../data/zones.json';
import metaJson from '../data/meta.json';

export type LL = [number, number];
export interface BuildingF { type: 'Feature'; properties: { id: number; h: number; src: 'height' | 'levels' | 'manual' | 'assumed'; name?: string; levels?: string; manual?: string }; geometry: { type: 'Polygon'; coordinates: LL[][] } }
export interface RoadF { type: 'Feature'; properties: { id: number; highway: string; name?: string; 'name:en'?: string; lanes?: string; width?: string; sidewalk?: string; 'sidewalk:both'?: string; 'sidewalk:left'?: string; 'sidewalk:right'?: string; oneway?: string }; geometry: { type: 'LineString'; coordinates: LL[] } }
export interface ZoneF { type: 'Feature'; properties: { zone: string; category: string }; geometry: { type: 'MultiPolygon'; coordinates: LL[][][] } }

export const BUILDINGS = buildingsJson as unknown as { type: 'FeatureCollection'; features: BuildingF[] };
export const ROADS = roadsJson as unknown as { type: 'FeatureCollection'; features: RoadF[] };
export const ZONES = zonesJson as unknown as { type: 'FeatureCollection'; features: ZoneF[] };
export const META = metaJson;

const bboxCache = new WeakMap<object, [number, number, number, number]>();
export function bboxLL(coords: LL[]): [number, number, number, number] {
  let b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
}
export function featureBBox(f: ZoneF | BuildingF | RoadF): [number, number, number, number] {
  let b = bboxCache.get(f);
  if (!b) {
    const g = f.geometry;
    const pts: LL[] = g.type === 'MultiPolygon' ? g.coordinates.flatMap((p) => p[0]) : g.type === 'Polygon' ? g.coordinates[0] : g.coordinates;
    b = bboxLL(pts);
    bboxCache.set(f, b);
  }
  return b;
}
export const bboxOverlap = (a: number[], b: number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Is the point inside the area the OSM site data covers? */
export const inSiteData = ([lon, lat]: LL) => {
  const b = META.osm.bbox;
  return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
};
