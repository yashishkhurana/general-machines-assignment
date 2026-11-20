// Lon/lat <-> local metres. UTM zone 47N (EPSG:32647) via proj4, shifted to a local origin so the
// polygon booleans work on small numbers.
import proj4 from 'proj4';
import type { Pt } from '../core/geom';

const UTM47N = '+proj=utm +zone=47 +datum=WGS84 +units=m +no_defs';
const fwd = proj4('EPSG:4326', UTM47N);

export interface Frame {
  origin: [number, number]; // lon, lat
  toM: (ll: [number, number]) => Pt;
  toLL: (p: Pt) => [number, number];
}

export function makeFrame(origin: [number, number]): Frame {
  const [ox, oy] = fwd.forward(origin);
  return {
    origin,
    toM: (ll) => {
      const [x, y] = fwd.forward(ll);
      return [x - ox, y - oy];
    },
    toLL: (p) => fwd.inverse([p[0] + ox, p[1] + oy]) as [number, number],
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
