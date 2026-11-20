// Builds the static data the app ships with. Run once; outputs are committed.
//
//   node scripts/build-data.mjs <bkk-zoning-current.geojson> <osm-map.xml> <out-dir>
//
// Inputs (downloaded 20 Nov 2026):
//   - Kanesuan/KNS.MAP public/data/bkk-zoning-current.geojson (extract of the BMA 2556 plan map)
//   - OSM API 0.6 `map` call, bbox 100.5635,13.7285,100.5775,13.7405 (© OpenStreetMap contributors, ODbL)
import fs from 'node:fs';
import path from 'node:path';

const [zonePath, osmPath, outDir] = process.argv.slice(2);
if (!zonePath || !osmPath || !outDir) {
  console.error('usage: node scripts/build-data.mjs <zoning.geojson> <osm.xml> <out-dir>');
  process.exit(1);
}

const R = 6378137;
const metres = (ring) => {
  const lat0 = (ring[0][1] * Math.PI) / 180;
  return ring.map(([x, y]) => [(x * Math.PI / 180) * R * Math.cos(lat0), (y * Math.PI / 180) * R]);
};
const area = (ring) => {
  const m = metres(ring);
  let a = 0;
  for (let i = 0; i < m.length - 1; i++) a += m[i][0] * m[i + 1][1] - m[i + 1][0] * m[i][1];
  return Math.abs(a) / 2;
};
const round = (c) => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];
const bboxOf = (rings) => {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b;
};
const overlaps = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

// ---------------------------------------------------------------------------------------------
// Zones: every ย.8–ย.10 polygon, plus every zone whose bbox comes within ~1.5 km of one, so the
// tool can name the zone a plot falls in when it is outside ย.8–ย.10. Drop 4-point ~0 ha slivers.
// ---------------------------------------------------------------------------------------------
const zin = JSON.parse(fs.readFileSync(zonePath, 'utf8'));
const BROWN = new Set(['ย.8', 'ย.9', 'ย.10']);
let slivers = 0;
const zoneFeats = [];
for (const f of zin.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const kept = polys.filter((p) => {
    const sliver = p[0].length <= 5 && area(p[0]) < 1000;
    if (sliver) slivers++;
    return !sliver;
  });
  if (!kept.length) continue;
  zoneFeats.push({ zone: f.properties.zone, category: f.properties.category, polys: kept, bbox: bboxOf(kept.map((p) => p[0])) });
}
const pad = 0.014; // ≈ 1.5 km
const brownBoxes = zoneFeats.filter((f) => BROWN.has(f.zone)).map((f) => [f.bbox[0] - pad, f.bbox[1] - pad, f.bbox[2] + pad, f.bbox[3] + pad]);
const shipped = zoneFeats.filter((f) => BROWN.has(f.zone) || brownBoxes.some((b) => overlaps(b, f.bbox)));
const zonesOut = {
  type: 'FeatureCollection',
  features: shipped.map((f) => ({
    type: 'Feature',
    properties: { zone: f.zone, category: f.category },
    geometry: { type: 'MultiPolygon', coordinates: f.polys.map((p) => p.map((r) => r.map(round))) },
  })),
};

// ---------------------------------------------------------------------------------------------
// OSM: buildings with heights, and roads.
// ---------------------------------------------------------------------------------------------
const xml = fs.readFileSync(osmPath, 'utf8');
const nodes = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodes.set(m[1], [+m[3], +m[2]]);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ways = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  const refs = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map((x) => x[1]);
  const tags = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]+)" v="([^"]*)"\/>/g)].map((x) => [unesc(x[1]), unesc(x[2])]));
  if (refs.some((r) => !nodes.has(r))) continue;
  ways.push({ id: +m[1], refs, tags, coords: refs.map((r) => round(nodes.get(r))) });
}

// Hand-set heights, for buildings near the site that OSM has no height for. `kind` is the legend tag:
//   listing - floor count stated in a source (listing, project page); visual - estimated by eye from imagery.
// Floors × 3.0 m, the same rule as the levels tag. A hand-set entry overrides an OSM tag only if `override`.
// Sources checked 20 Nov 2026.
const MANUAL = {
  253415212: { floors: 20, kind: 'listing', name: 'Adelphi Grande (Sukhumvit Soi 41)', src: 'oyster.com/bangkok/hotels/adelphi-grande-sukhumvit-by-compass-hospitality; hotels.com' },
  324280545: { floors: 27, kind: 'listing', name: 'CNC Residence (Sukhumvit Soi 33)', src: 'fazwaz.com, nestopa.com, hipflat.co.th project pages' },
  331962399: { floors: 8, kind: 'listing', name: 'The Bless Hotel & Residence (Sukhumvit Soi 33)', src: 'hotels.com, expedia.co.th, nestopa.com (tallest wing)' },
  176153885: { floors: 5, kind: 'listing', name: 'Fuji Supermarket (Soi 33/1)', src: 'thailand.tripcanvas.co guide (low confidence)' },
  208691131: { floors: 22, kind: 'listing', name: 'PSI Tower', src: "sourced: contractor's project page" },
  324280507: { floors: 30, kind: 'listing', name: 'D.S. Tower II', src: 'sourced: property listing' },
  324280512: { floors: 9, kind: 'listing', name: '39 Suites', src: 'sourced: property listing' },
  331962370: { floors: 6, kind: 'visual', name: 'Former Banphaeo Hospital, Prommitr branch (Soi Phrom Mit)', src: 'visual estimate, Street View Aug 2024, north face from Soi Phrom Mit; open ground floor, a tall blank level, four window rows; ±1 level, medium-low confidence' },
  // The Manor (340477772): not set. The building could not be identified on street imagery. Stays assumed.
};
// Kept at the OSM tag on purpose, with the disagreeing source noted.
const NOTES = {
  1230362479: 'OSM building:levels=36 kept; CondoDee lists 38 floors',
};
const PER_LEVEL = 3.0, DEFAULT_H = 6.0;
const num = (s) => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null; };

const buildings = [], roads = [];
let nB = 0, nH = 0, nL = 0, nM = 0;
const HW_SKIP = new Set(['footway', 'steps', 'path', 'corridor', 'elevator', 'platform', 'pedestrian', 'cycleway', 'construction', 'proposed', 'bridleway', 'track']);
for (const w of ways) {
  const t = w.tags;
  if (t.building && w.refs.length >= 4 && w.refs[0] === w.refs[w.refs.length - 1]) {
    nB++;
    let h = null, src = 'assumed';
    const man = MANUAL[w.id];
    if (man && (man.override || !(num(t.height) || num(t['building:levels'])))) { h = man.floors * PER_LEVEL; src = man.kind; nM++; }
    else if (num(t.height)) { h = num(t.height); src = 'height'; nH++; }
    else if (num(t['building:levels'])) { h = num(t['building:levels']) * PER_LEVEL; src = 'levels'; nL++; }
    else h = DEFAULT_H;
    const p = { id: w.id, h: Math.round(h * 10) / 10, src };
    if (t.name) p.name = t.name;
    if (t['building:levels']) p.levels = t['building:levels'];
    if (src === 'listing' || src === 'visual') { p.floors = MANUAL[w.id].floors; p.manual = MANUAL[w.id].src; }
    if (NOTES[w.id]) p.note = NOTES[w.id];
    buildings.push({ type: 'Feature', properties: p, geometry: { type: 'Polygon', coordinates: [w.coords] } });
  } else if (t.highway && !HW_SKIP.has(t.highway)) {
    const p = { id: w.id, highway: t.highway };
    for (const k of ['name', 'name:en', 'lanes', 'width', 'sidewalk', 'sidewalk:both', 'sidewalk:left', 'sidewalk:right', 'oneway']) if (t[k]) p[k] = t[k];
    roads.push({ type: 'Feature', properties: p, geometry: { type: 'LineString', coordinates: w.coords } });
  }
}

const pct = (x) => Math.round((1000 * x) / nB) / 10;
const meta = {
  extracted: '2026-11-20',
  osm: { source: 'OSM API 0.6 map call', bbox: [100.5635, 13.7285, 100.5775, 13.7405], buildings: nB, withHeight: nH, withLevels: nL, withEither: nH + nL, sharePctHeight: pct(nH), sharePctLevels: pct(nL), sharePctEither: pct(nH + nL), manual: nM, assumedDefault: nB - nH - nL - nM, roads: roads.length, perLevelM: PER_LEVEL, defaultHeightM: DEFAULT_H },
  zones: { source: 'Kanesuan/KNS.MAP public/data/bkk-zoning-current.geojson', inputFeatures: zin.features.length, slivers, shippedFeatures: zonesOut.features.length, brown: shipped.filter((f) => BROWN.has(f.zone)).length },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'zones.json'), JSON.stringify(zonesOut));
fs.writeFileSync(path.join(outDir, 'buildings.json'), JSON.stringify({ type: 'FeatureCollection', features: buildings }));
fs.writeFileSync(path.join(outDir, 'roads.json'), JSON.stringify({ type: 'FeatureCollection', features: roads }));
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
