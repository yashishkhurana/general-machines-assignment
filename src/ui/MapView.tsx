import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef } from 'react';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Results } from '../core/compute';
import { envelopeMesh } from '../core/envelope';
import { pointSegDist, type MultiPoly, type Pt } from '../core/geom';
import { BUILDINGS, ZONES, type LL } from '../geo/data';
import type { Frame } from '../geo/project';
import { EnvelopeLayer } from './envelopeLayer';
import type { AppState, Tool } from './state';

maplibregl.setWorkerUrl(workerUrl);

// Opening camera: from across Soi 39, looking at the plot's road side (west-south-west), so no tower stands
// between the camera and the Soi 39 example. Chosen by comparing bearings at phone and desktop sizes.
const DEFAULT_BEARING = -110;
const DEFAULT_PITCH = 55;

// Colour by meaning only: neutral context, drafting blue for the permitted envelope, the plan's brown for
// residential, pale tan for parking, red for the road edge.
export const COLORS = {
  plot: '#17242D', road: '#B93A2B', strip: '#B93A2B', fpHigh: '#56646D', fpLow: '#56646D',
  envHigh: '#1F55C8', envLow: '#1F55C8', residential: '#9A6A4B', parking: '#D8C7B6', fire: '#C9CEC6',
  building: '#F7F8F5', ground: '#EEF0EC', rays: '#7b3fbf', measure: '#C27A00',
};
const ZONE_FILL: Record<string, string> = {
  residential_low: '#f3dc6b', residential_medium: '#f0a35b', residential_high: '#a86f3d', commercial: '#d9484a',
  industrial: '#b48ed1', warehouse: '#b48ed1', agriculture: '#9cc98a', conservation: '#7fb7d9',
};

const OFM_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const FALLBACK_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef0ec' } }] };
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const ESRI_ATTR = 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

const fc = (features: any[]) => ({ type: 'FeatureCollection', features }) as any;
const polyF = (rings: LL[][], props: Record<string, unknown> = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } });

function mpToLL(frame: Frame, mp: MultiPoly, props: (i: number) => Record<string, unknown> = () => ({})) {
  return mp.map((poly, i) => polyF(poly.map((ring) => ring.map((p) => frame.toLL(p))), props(i)));
}

export interface MapProps {
  state: AppState;
  results: Results;
  frame: Frame;
  tool: Tool;
  rays: { a: Pt; b: Pt; gap: number }[];
  measure: LL[];
  demolished: Set<number>;
  onRing: (ring: LL[], final: boolean, isNew?: boolean) => void;
  onPickEdge: (edge: number) => void;
  onMeasure: (pts: LL[]) => void;
  onToolDone: () => void;
  fitKey: string;
  roadName?: string;
}

export function MapView(p: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const envRef = useRef<EnvelopeLayer | null>(null);
  const ready = useRef(false);
  const plotId = useRef<string | number | null>(null);
  const suppress = useRef(false);
  const props = useRef(p);
  props.current = p;
  const callouts = useRef<Record<'height' | 'road' | 'clear', maplibregl.Marker> | null>(null);

  // ---- init once -------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let style: StyleSpecification | string = FALLBACK_STYLE;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(OFM_STYLE, { signal: ctl.signal });
        clearTimeout(t);
        if (r.ok) style = await r.json();
      } catch { /* basemap unavailable: static layers still draw */ }
      if (cancelled || !el.current) return;
      const ring = props.current.state.ring;
      const c = ring.length ? ring.reduce((a, b) => [a[0] + b[0] / ring.length, a[1] + b[1] / ring.length], [0, 0]) : [100.5711, 13.7338];
      const map = new maplibregl.Map({
        container: el.current, style, center: c as LL, zoom: el.current.clientWidth < 600 ? 16.7 : 17.9, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING, maxPitch: 75,
        attributionControl: false, canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      } as any);
      mapRef.current = map;
      (window as any).__map = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: false }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ['© OpenStreetMap contributors', 'Zones: Kanesuan/KNS.MAP extract of the 2556 plan map'] }), 'bottom-right');
      map.on('load', () => {
        if (cancelled) return;
        // basemap building layers would double up with ours
        for (const l of (map.getStyle().layers ?? []) as { id: string; type: string }[]) {
          if (/building|poi|aeroway|housenumber/i.test(l.id)) map.setLayoutProperty(l.id, 'visibility', 'none');
          if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', COLORS.ground);
        }
        const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
        map.addSource('esri', { type: 'raster', tiles: [ESRI], tileSize: 256, maxzoom: 19, attribution: ESRI_ATTR });
        map.addLayer({ id: 'esri', type: 'raster', source: 'esri', layout: { visibility: 'none' } }, firstSymbol);
        map.addSource('zones', { type: 'geojson', data: ZONES as any });
        map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['match', ['get', 'category'], ...Object.entries(ZONE_FILL).flat(), '#bbbbbb'] as any, 'fill-opacity': 0.12 } }, firstSymbol);
        map.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': ['match', ['get', 'category'], ...Object.entries(ZONE_FILL).flat(), '#999'] as any, 'line-width': 1.2, 'line-dasharray': [3, 2] } }, firstSymbol);
        map.addLayer({ id: 'zones-label', type: 'symbol', source: 'zones', layout: { 'text-field': ['get', 'zone'], 'text-size': 13, 'text-font': ['Noto Sans Regular'], 'symbol-placement': 'point' }, paint: { 'text-color': '#5a3a1a', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
        for (const id of ['plot', 'strip', 'fpHigh', 'fpLow', 'fire', 'roadEdges', 'rays', 'measure', 'floors', 'demolished']) map.addSource(id, { type: 'geojson', data: fc([]) });
        map.addSource('buildings', { type: 'geojson', data: BUILDINGS as any });
        const notDemolished: any = ['!', ['in', ['get', 'id'], ['literal', []]]];
        map.addLayer({ id: 'bld-assumed', type: 'fill-extrusion', source: 'buildings', filter: ['all', ['==', ['get', 'src'], 'assumed'], notDemolished], paint: { 'fill-extrusion-color': COLORS.building, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.9 } });
        map.addLayer({ id: 'bld-known', type: 'fill-extrusion', source: 'buildings', filter: ['all', ['!=', ['get', 'src'], 'assumed'], notDemolished], paint: { 'fill-extrusion-color': COLORS.building, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.9 } });
        map.addLayer({ id: 'demolished', type: 'line', source: 'demolished', paint: { 'line-color': '#8a9099', 'line-width': 1, 'line-dasharray': [1, 2] } });
        map.addLayer({ id: 'strip', type: 'fill', source: 'strip', paint: { 'fill-color': COLORS.strip, 'fill-opacity': 0.18 } });
        map.addLayer({ id: 'fire', type: 'fill', source: 'fire', paint: { 'fill-color': COLORS.fire, 'fill-opacity': 0.35 } });
        map.addLayer({ id: 'fpHigh', type: 'line', source: 'fpHigh', paint: { 'line-color': COLORS.fpHigh, 'line-width': 1.2, 'line-dasharray': [3, 2] } });
        map.addLayer({ id: 'fpLow', type: 'line', source: 'fpLow', paint: { 'line-color': COLORS.fpLow, 'line-width': 1.2, 'line-dasharray': [3, 2] } });
        map.addLayer({ id: 'plot-fill', type: 'fill', source: 'plot', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.55 } });
        map.addLayer({ id: 'plot-line', type: 'line', source: 'plot', paint: { 'line-color': COLORS.plot, 'line-width': 2.5 } });
        map.addLayer({ id: 'roadEdges', type: 'line', source: 'roadEdges', paint: { 'line-color': COLORS.road, 'line-width': 4, 'line-opacity': 1 } });
        map.addLayer({ id: 'rays', type: 'line', source: 'rays', paint: { 'line-color': COLORS.rays, 'line-width': 1.5, 'line-opacity': 0.8 } });
        map.addLayer({ id: 'measure', type: 'line', source: 'measure', paint: { 'line-color': COLORS.measure, 'line-width': 3 } });
        map.addLayer({ id: 'floors', type: 'fill-extrusion', source: 'floors', paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-opacity': 0.97 } });
        const env = new EnvelopeLayer();
        envRef.current = env;
        map.addLayer(env);

        // hover (or tap) a neighbouring building: its name and where its height comes from
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'bld-pop', offset: 8 });
        const SRC: Record<string, string> = { height: 'OSM height tag', levels: 'OSM levels tag', listing: 'sourced listing', visual: 'visual estimate', assumed: 'unknown, 6 m assumed' };
        const show = (e: any) => {
          const f = e.features?.[0];
          if (!f || props.current.tool !== 'edit') return;
          const pp = f.properties as Record<string, any>;
          const floors = pp.levels ?? pp.floors;
          const text = `${pp.name ? pp.name + ' · ' : ''}${Math.round(pp.h)} m${floors ? ` (${floors} floors)` : ''} · ${SRC[pp.src] ?? pp.src}`;
          popup.setLngLat(e.lngLat).setText(text).addTo(map);
        };
        for (const l of ['bld-known', 'bld-assumed']) {
          map.on('mousemove', l, show);
          map.on('mouseleave', l, () => popup.remove());
        }

        // three callouts on the model, instead of a legend
        // each callout has its own side of its point, so the three don't pile up at the plot's front corner
        const mk = (cls: string, anchor: 'bottom' | 'top' | 'right', offset: [number, number]) => {
          const d = document.createElement('div');
          d.className = `callout ${cls}`;
          return new maplibregl.Marker({ element: d, anchor, offset });
        };
        callouts.current = { height: mk('c-height', 'bottom', [0, -14]), road: mk('c-road', 'top', [0, 12]), clear: mk('c-clear', 'right', [-12, 0]) };
        // attribution starts collapsed (the (i) button opens it)
        const collapse = () => el.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
        collapse();
        map.once('idle', collapse);

        const draw = new TerraDraw({
          adapter: new TerraDrawMapLibreGLAdapter({ map }),
          modes: [
            new TerraDrawPolygonMode({ styles: { fillColor: '#2f6fdf', fillOpacity: 0.15, outlineColor: '#2f6fdf', outlineWidth: 2 } } as any),
            new TerraDrawSelectMode({
              flags: { polygon: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } } },
              styles: { selectedPolygonColor: '#2f6fdf', selectedPolygonFillOpacity: 0.06, selectedPolygonOutlineColor: '#1d1f22', selectedPolygonOutlineWidth: 2, selectionPointColor: '#1d1f22', selectionPointWidth: 5, midPointColor: '#2f6fdf', midPointWidth: 3 },
            } as any),
          ],
        });
        draw.start();
        drawRef.current = draw;
        (window as any).__draw = draw;
        let raf = 0;
        const readRing = (): LL[] | null => {
          if (plotId.current === null) return null;
          const f = draw.getSnapshotFeature(plotId.current);
          if (!f || f.geometry.type !== 'Polygon') return null;
          const r = (f.geometry.coordinates[0] as LL[]).slice(0, -1);
          return r.map((c) => [c[0], c[1]] as LL);
        };
        draw.on('change', (ids, type) => {
          if (suppress.current || plotId.current === null || !ids.includes(plotId.current) || type === 'delete') return;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => { const r = readRing(); if (r) props.current.onRing(r, false); });
        });
        draw.on('finish', (id, ctx: any) => {
          const f = draw.getSnapshotFeature(id);
          if (!f) return;
          if (ctx?.mode === 'polygon' || draw.getMode() === 'polygon') {
            // a new plot replaces the old one
            const old = plotId.current;
            plotId.current = id;
            if (old !== null && old !== id) { suppress.current = true; try { draw.removeFeatures([old]); } catch { /* gone */ } suppress.current = false; }
            const r = readRing();
            if (r) props.current.onRing(r, true, true);
            props.current.onToolDone();
            return;
          }
          const r = readRing();
          if (r) props.current.onRing(r, true);
        });
        ready.current = true;
        syncPlot();
        syncTool();
        syncData();
      });
      map.on('click', (e: maplibregl.MapMouseEvent) => {
        const pr = props.current;
        if (pr.tool === 'pickRoad') {
          const pt = pr.frame.toM([e.lngLat.lng, e.lngLat.lat]);
          const ring = pr.state.ring.map((c) => pr.frame.toM(c));
          let best = -1, bd = Infinity;
          for (let i = 0; i < ring.length; i++) {
            const d = pointSegDist(pt, ring[i], ring[(i + 1) % ring.length]);
            if (d < bd) { bd = d; best = i; }
          }
          if (best >= 0 && bd < 25) pr.onPickEdge(best);
        } else if (pr.tool === 'measure') {
          const pts = pr.measure.length >= 2 ? [] : [...pr.measure];
          pts.push([e.lngLat.lng, e.lngLat.lat]);
          pr.onMeasure(pts);
        }
      });
    })();
    return () => { cancelled = true; drawRef.current?.stop(); mapRef.current?.remove(); mapRef.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- keep terra-draw's plot in step with app state (reset, URL) --------------------------------
  function syncPlot() {
    const draw = drawRef.current;
    if (!draw || !ready.current) return;
    const ring = props.current.state.ring;
    const cur = plotId.current !== null ? draw.getSnapshotFeature(plotId.current) : undefined;
    const curRing = cur && cur.geometry.type === 'Polygon' ? (cur.geometry.coordinates[0] as LL[]).slice(0, -1) : null;
    const same = curRing && curRing.length === ring.length && curRing.every((c, i) => Math.abs(c[0] - ring[i][0]) < 1e-10 && Math.abs(c[1] - ring[i][1]) < 1e-10);
    if (same) return;
    suppress.current = true;
    try {
      if (plotId.current !== null && cur) draw.removeFeatures([plotId.current]);
      plotId.current = null;
      if (ring.length >= 3) {
        const id = crypto.randomUUID();
        const res = draw.addFeatures([{ id, type: 'Feature', properties: { mode: 'polygon' }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } } as any]);
        if (res[0]?.valid !== false) plotId.current = id;
      }
    } finally { suppress.current = false; }
    syncTool();
  }

  function syncTool() {
    const draw = drawRef.current, map = mapRef.current;
    if (!draw || !map || !ready.current) return;
    const tool = props.current.tool;
    if (tool === 'draw') draw.setMode('polygon');
    else {
      draw.setMode('select');
      if (tool === 'edit' && plotId.current !== null) { try { draw.selectFeature(plotId.current); } catch { /* not selectable */ } }
      else if (plotId.current !== null) { try { draw.deselectFeature(plotId.current); } catch { /* fine */ } }
    }
    map.getCanvas().style.cursor = tool === 'pickRoad' || tool === 'measure' ? 'crosshair' : '';
  }

  // ---- results -> map --------------------------------------------------------------------------
  function syncData() {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const { results: r, frame, state, rays, measure, demolished } = props.current;
    const set = (id: string, data: any) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
    const v = state.view;
    map.setLayoutProperty('esri', 'visibility', v.satellite ? 'visible' : 'none');
    for (const id of ['zones-fill', 'zones-line', 'zones-label']) map.setLayoutProperty(id, 'visibility', v.zones ? 'visible' : 'none');
    for (const id of ['bld-assumed', 'bld-known']) map.setLayoutProperty(id, 'visibility', v.buildings ? 'visible' : 'none');
    map.setLayoutProperty('rays', 'visibility', v.rays ? 'visible' : 'none');
    const ring = state.ring;
    set('plot', fc(ring.length >= 3 ? [polyF([[...ring, ring[0]]])] : []));
    const ids = [...demolished];
    const filt = (extra: any) => ['all', extra, ['!', ['in', ['get', 'id'], ['literal', ids]]]];
    map.setFilter('bld-assumed', filt(['==', ['get', 'src'], 'assumed']) as any);
    map.setFilter('bld-known', filt(['!=', ['get', 'src'], 'assumed']) as any);
    set('demolished', fc(BUILDINGS.features.filter((b) => demolished.has(b.properties.id))));
    set('rays', fc(rays.map((x) => ({ type: 'Feature', properties: { gap: x.gap }, geometry: { type: 'LineString', coordinates: [frame.toLL(x.a), frame.toLL(x.b)] } }))));
    set('measure', fc(measure.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: measure.length === 1 ? [measure[0], measure[0]] : measure } }] : []));
    const site = r.site;
    set('strip', fc(site ? mpToLL(frame, site.stripMP) : []));
    set('roadEdges', fc(site ? site.roads.map((rd) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [frame.toLL(rd.a), frame.toLL(rd.b)] } })) : []));
    const fps = r.footprints;
    // the envelope follows the selected option: the tower's, or the low-rise one (when A is a low-rise too)
    const sel = r.concepts.find((c) => c.concept.id === v.concept)?.concept ?? r.concepts[0]?.concept;
    const envKind: 'highRise' | 'lowRise' | 'none' = v.envelope === 'none' ? 'none' : sel?.kind === 'tower' ? 'highRise' : sel ? 'lowRise' : v.envelope;
    set('fpHigh', fc(fps && envKind === 'highRise' ? mpToLL(frame, fps.highRise.mp) : []));
    set('fpLow', fc(fps && envKind === 'lowRise' ? mpToLL(frame, fps.lowRise.mp) : []));
    const concept = r.concepts.find((c) => c.concept.id === v.concept)?.concept;
    set('fire', fc(concept?.openSpace.fireRing ? mpToLL(frame, concept.openSpace.fireRing) : []));
    const floors: any[] = [];
    if (concept?.ok) {
      for (const f of concept.floors) {
        if (f.z1 <= 0) continue; // basements are listed, not drawn
        const color = f.use === 'residential' ? COLORS.residential : COLORS.parking;
        floors.push(...mpToLL(frame, f.plate, () => ({ base: f.z0, top: Math.max(f.z0 + 0.3, f.z1 - 0.35), color })));
      }
    }
    set('floors', fc(floors));
    // callouts
    const co = callouts.current;
    if (co) {
      const put = (m: maplibregl.Marker, at: LL | null, text: string) => {
        const e = m.getElement();
        if (!at) { m.remove(); return; }
        e.textContent = text;
        m.setLngLat(at);
        if (!(m as any)._map) m.addTo(map);
      };
      const road = site?.roads[0];
      const small = map.getContainer().clientWidth < 600;
      put(co.road, road ? frame.toLL([(road.a[0] + road.b[0]) / 2, (road.a[1] + road.b[1]) / 2]) : null, small || !props.current.roadName ? 'Road edge' : `Road edge, ${props.current.roadName}`);
      const fpShown = envKind !== 'lowRise' ? fps?.highRise : fps?.lowRise;
      const h = r.plane ? (envKind !== 'lowRise' ? r.plane.atHighRiseFront : r.plane.atLowRiseFront) : null;
      let front: LL | null = null;
      if (site && fpShown && fpShown.area > 0 && road) {
        // middle of the footprint's road-side line: where the height limit is lowest
        const pts = fpShown.mp.flatMap((poly) => poly[0].slice(0, -1)).map((q) => ({ q, d: pointSegDist(q, road.nearA, road.nearB) })).sort((x, y) => x.d - y.d);
        if (pts.length >= 2) front = frame.toLL([(pts[0].q[0] + pts[1].q[0]) / 2, (pts[0].q[1] + pts[1].q[1]) / 2]);
      }
      const hr = envKind !== 'lowRise';
      put(co.height, front && h ? front : null, h ? (hr ? (small ? `Height limit ${h.toFixed(1)} m` : `Height limit at the front line: ${h.toFixed(1)} m`) : 'Low-rise: under 23 m') : '');
      let clearAt: LL | null = null, clearText = '';
      if (site && fpShown && site.ring.length >= 3) {
        const side = fpShown.setbacks.find((x) => !x.road);
        if (side) {
          const i = side.edge, a = site.ring[i], b = site.ring[(i + 1) % site.ring.length];
          clearAt = frame.toLL([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
          clearText = hr ? (small ? '6 m clear' : '6 m clear all round') : small ? `${side.setback.toFixed(0)} m clear` : `${side.setback.toFixed(0)} m from the side boundaries`;
        }
      }
      put(co.clear, clearAt, clearText);
    }
    // envelope
    const env = envRef.current;
    if (env) {
      if (!site || !fps || envKind === 'none') env.set(null, []);
      else if (envKind === 'highRise') env.set(frame, fps.highRise.area > 0 ? [{ mesh: envelopeMesh(site, fps.highRise.mp), color: COLORS.envHigh, opacity: 0.1 }] : []);
      else env.set(frame, fps.lowRise.area > 0 ? [{ mesh: envelopeMesh(site, fps.lowRise.mp, 23), color: COLORS.envLow, opacity: 0.12 }] : []);
    }
  }

  useEffect(syncPlot, [p.state.ring]);
  useEffect(syncTool, [p.tool]);
  useEffect(syncData, [p.results, p.state.view, p.rays, p.measure, p.demolished, p.frame]);
  useEffect(() => {
    const map = mapRef.current, ring = p.state.ring;
    if (!map || ring.length < 3) return;
    const b = ring.reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])], [Infinity, Infinity, -Infinity, -Infinity]);
    const el2 = map.getContainer();
    const padding = Math.round(Math.max(20, Math.min(160, 0.2 * Math.min(el2.clientWidth, el2.clientHeight))));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, maxZoom: 18, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING, duration: reduce ? 0 : 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitKey]);

  // print: WebGL canvases often print blank, so render one frame now and print an image of it instead
  const printImg = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const snap = () => {
      const map = mapRef.current, img = printImg.current;
      if (!map || !img) return;
      try {
        (map as any).redraw?.();
        img.src = map.getCanvas().toDataURL('image/png');
      } catch { /* keep the previous snapshot */ }
    };
    (window as any).__snapMap = snap;
    window.addEventListener('beforeprint', snap);
    return () => window.removeEventListener('beforeprint', snap);
  }, []);

  return (
    <>
      <div ref={el} className="map" aria-label="Map: draw the plot, pick the road edge" />
      <img ref={printImg} className="map-print" alt="Map snapshot for printing" />
    </>
  );
}
