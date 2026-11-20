// Turns the app's lon/lat state into the metre-space SiteInput the core computes on.
import type { Pt, Ring } from '../core/geom';
import type { Zone } from '../core/rules';
import type { Message, RoadEdgeInput, Settings, SiteInput, ZonePoly } from '../core/types';
import { ROADS, ZONES, bboxLL, bboxOverlap, featureBBox, inSiteData, type LL } from './data';
import { centroidLL, inBangkok, makeFrame, type Frame } from './project';

export interface AppPlot {
  ring: LL[];
  roads: RoadEdgeInput[];
  zoneOverride: Zone | null;
  settings: Settings;
}

function segX(p1: Pt, p2: Pt, p3: Pt, p4: Pt) {
  const d = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function inside(p: Pt, ring: Pt[]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** OSM roads (not service lanes) whose centreline runs through the plot's interior. */
export function roadsThroughPlot(frame: Frame, ringM: Pt[], ringLL: LL[]): string[] {
  const box = bboxLL(ringLL);
  const hits: string[] = [];
  for (const r of ROADS.features) {
    if (r.properties.highway === 'service' || !bboxOverlap(featureBBox(r), box)) continue;
    const pts = r.geometry.coordinates.map((c) => frame.toM(c));
    let hit = pts.some((p) => inside(p, ringM));
    for (let i = 0; !hit && i < pts.length - 1; i++) {
      for (let j = 0; j < ringM.length; j++) {
        if (segX(pts[i], pts[i + 1], ringM[j], ringM[(j + 1) % ringM.length])) {
          // crossing the boundary only counts if the road actually enters (midpoint inside) or crosses twice
          const mid: Pt = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
          if (inside(mid, ringM)) { hit = true; break; }
        }
      }
    }
    if (hit) hits.push(r.properties.name ?? r.properties['name:en'] ?? `${r.properties.highway} (OSM ${r.properties.id})`);
  }
  return [...new Set(hits)];
}

export function toSiteInput(app: AppPlot): { input: SiteInput; frame: Frame } {
  const ringLL = app.ring;
  const origin = ringLL.length ? centroidLL(ringLL) : ([100.571, 13.734] as LL);
  const frame = makeFrame(origin);
  const plot: Ring = ringLL.map((c) => frame.toM(c));
  const extra: Message[] = [];
  if (ringLL.length >= 3) {
    if (ringLL.some((c) => !inBangkok(c))) extra.push({ level: 'error', code: 'outsideBangkok', text: 'The plot is outside Bangkok. The tool covers the Bangkok Comprehensive Plan B.E. 2556 only.' });
    else {
      if (!inSiteData(origin)) extra.push({ level: 'info', code: 'outsideSiteData', text: 'Outside the Soi 39 area: no neighbouring buildings or road-width estimates here (the OSM site data is pre-baked for Phrom Phong only).' });
      const through = roadsThroughPlot(frame, plot, ringLL);
      if (through.length) extra.push({ level: 'warn', code: 'overRoad', text: `The plot is drawn over an existing road (${through.join(', ')}). A public road can't be part of a plot; check the outline.` });
    }
  }
  const box = ringLL.length ? bboxLL(ringLL) : [0, 0, 0, 0];
  const zones: ZonePoly[] = ZONES.features
    .filter((f) => bboxOverlap(featureBBox(f), box))
    .map((f) => ({ zone: f.properties.zone, poly: f.geometry.coordinates.map((poly) => poly.map((ring) => ring.map((c) => frame.toM(c)))) }));
  return { input: { plot, roads: app.roads, zones, zoneOverride: app.zoneOverride, settings: app.settings, extraMessages: extra }, frame };
}
