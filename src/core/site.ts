// Normalises the drawn plot and builds the road geometry: current edge, planned (legal) line, far boundary,
// and the widening strip that comes out of the plot when the current right-of-way is under the planned one.
import {
  bandLeft, ccw, clean, difference, dist, intersection, mpArea, offsetRight, signedArea, toMP, union,
  type Pt, type Ring,
} from './geom';
import type { RoadEdgeInput, Site } from './types';

/** How far the road's far boundary is extended past the plot edge, so the height plane treats the road as
 *  continuing straight beyond the frontage (assumption). */
export const FAR_EXTENSION = 300;

export function normaliseRing(plot: Ring) {
  const n = plot.length;
  const isCW = signedArea(plot) < 0;
  const ring = ccw(plot);
  const mapEdge = (i: number) => (isCW ? (((n - 2 - i) % n) + n) % n : i);
  return { ring, mapEdge, isCW };
}

export function buildSite(plot: Ring, roadInputs: RoadEdgeInput[], heightTo: 'current' | 'planned' = 'current'): Site {
  const { ring, mapEdge } = normaliseRing(plot);
  const n = ring.length;
  const plotMP = toMP(ring);
  const grossArea = mpArea(plotMP);
  const roads = roadInputs
    .filter((r) => r.edge >= 0 && r.edge < n)
    .map((r) => {
      const edge = mapEdge(r.edge);
      const a = ring[edge], b = ring[(edge + 1) % n];
      const current = Math.max(0, r.current);
      const width = Math.max(r.width, current);
      const strip = Math.max(0, (r.width - current) / 2); // symmetric widening about the centreline (assumption)
      const [nearA, nearB] = offsetRight(a, b, -strip);
      // Height plane (Reg. 55 cl. 44) far boundary. Default: the road as it is now (current edge + current width),
      // the strict reading. Option: the planned far line, if plan art. 36 ¶2 ("building lines and the various
      // distances") is read to cover the plane. Both are computed; the other one is shown as the alternative
      // (decisions W3). Access (Reg. 33 cl. 2, a width rule) is always tested on the current width.
      const planned = offsetRight(a, b, current + strip, FAR_EXTENSION);
      const now = offsetRight(a, b, current, FAR_EXTENSION);
      const [farA, farB] = heightTo === 'planned' ? planned : now;
      const [farAltA, farAltB] = heightTo === 'planned' ? now : planned;
      const [centreA, centreB] = offsetRight(a, b, current / 2);
      return { edge, inputEdge: r.edge, a, b, width, current, strip, frontage: dist(a, b), nearA, nearB, farA, farB, farAltA, farAltB, centreA, centreB };
    });
  const strips = roads
    .filter((r) => r.strip > 0)
    .map((r) => intersection(bandLeft(r.a, r.b, r.strip, 3 * r.strip + 1), plotMP));
  const stripMP = clean(union(...strips));
  const netMP = stripMP.length ? clean(difference(plotMP, stripMP)) : plotMP;
  return {
    ring, plotMP, grossArea, stripMP, stripArea: mpArea(stripMP), netMP, netArea: mpArea(netMP),
    roads, roadEdgeSet: new Set(roads.map((r) => r.edge)),
  };
}

export const edgeOf = (ring: Ring, i: number): [Pt, Pt] => [ring[i], ring[(i + 1) % ring.length]];
