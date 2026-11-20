// Lon/lat <-> local metres. A transverse Mercator centred on the plot with scale factor 1 there, so areas
// and lengths at the plot are true. (UTM zone 47N, the plan's first choice, has a scale factor of about
// 0.99995 at Phrom Phong: a 40 × 50 m parcel came out as 1,999.8 m² and the floor area by ~1 m² short.)
import proj4 from 'proj4';
import type { Pt } from '../core/geom';

export interface Frame {
  origin: [number, number]; // lon, lat
  toM: (ll: [number, number]) => Pt;
  toLL: (p: Pt) => [number, number];
}

export function makeFrame(origin: [number, number]): Frame {
  const tm = proj4('EPSG:4326', `+proj=tmerc +lat_0=${origin[1]} +lon_0=${origin[0]} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`);
  return {
    origin,
    toM: (ll) => tm.forward(ll) as Pt,
    toLL: (p) => tm.inverse(p) as [number, number],
  };
}

export function centroidLL(ring: [number, number][]): [number, number] {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}

/** Bangkok Metropolitan Administration's rough extent (generous box). */
export const BANGKOK_BOUNDS: [number, number, number, number] = [100.32, 13.48, 100.94, 13.96];
export const inBangkok = ([lon, lat]: [number, number]) =>
  lon >= BANGKOK_BOUNDS[0] && lon <= BANGKOK_BOUNDS[2] && lat >= BANGKOK_BOUNDS[1] && lat <= BANGKOK_BOUNDS[3];
