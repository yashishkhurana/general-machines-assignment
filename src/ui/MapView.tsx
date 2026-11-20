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

export const COLORS = {
  plot: '#1d1f22', road: '#d1352b', strip: '#d1352b', fpHigh: '#2f6fdf', fpLow: '#1f9e8f',
  envHigh: '#2f6fdf', envLow: '#1f9e8f', residential: '#e8833a', parking: '#7a64b8', fire: '#9aa3ad',
  bldKnown: '#8a9099', bldAssumed: '#cfd3d8', rays: '#7b3fbf', measure: '#e0a100',
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
        container: el.current, style, center: c as LL, zoom: 17.3, pitch: 55, bearing: -20, maxPitch: 75,
        attributionControl: false, canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      } as any);
      mapRef.current = map;
      (window as any).__map = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: ['© OpenStreetMap contributors', 'Zones: Kanesuan/KNS.MAP extract of the 2556 plan map'] }), 'bottom-right');
      map.on('load', () => {
        if (cancelled) return;
        // basemap building layers would double up with ours
        for (const l of (map.getStyle().layers ?? []) as { id: string }[]) if (/building/i.test(l.id)) map.setLayoutProperty(l.id, 'visibility', 'none');
        const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
        map.addSource('esri', { type: 'raster', tiles: [ESRI], tileSize: 256, maxzoom: 19, attribution: ESRI_ATTR });
        map.addLayer({ id: 'esri', type: 'raster', source: 'esri', layout: { visibility: 'none' } }, firstSymbol);
        map.addSource('zones', { type: 'geojson', data: ZONES as any });
        map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['match', ['get', 'category'], ...Object.entries(ZONE_FILL).flat(), '#bbbbbb'] as any, 'fill-opacity': 0.16 } }, firstSymbol);
        map.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': ['match', ['get', 'category'], ...Object.entries(ZONE_FILL).flat(), '#999'] as any, 'line-width': 1.2, 'line-dasharray': [3, 2] } }, firstSymbol);
        map.addLayer({ id: 'zones-label', type: 'symbol', source: 'zones', layout: { 'text-field': ['get', 'zone'], 'text-size': 13, 'text-font': ['Noto Sans Regular'], 'symbol-placement': 'point' }, paint: { 'text-color': '#5a3a1a', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
        for (const id of ['plot', 'strip', 'fpHigh', 'fpLow', 'fire', 'roadEdges', 'rays', 'measure', 'floors', 'demolished']) map.addSource(id, { type: 'geojson', data: fc([]) });
        map.addSource('buildings', { type: 'geojson', data: BUILDINGS as any });
        const notDemolished: any = ['!', ['in', ['get', 'id'], ['literal', []]]];
        map.addLayer({ id: 'bld-assumed', type: 'fill-extrusion', source: 'buildings', filter: ['all', ['==', ['get', 'src'], 'assumed'], notDemolished], paint: { 'fill-extrusion-color': COLORS.bldAssumed, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.55 } });
        map.addLayer({ id: 'bld-known', type: 'fill-extrusion', source: 'buildings', filter: ['all', ['!=', ['get', 'src'], 'assumed'], notDemolished], paint: { 'fill-extrusion-color': COLORS.bldKnown, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.85 } });
        map.addLayer({ id: 'demolished', type: 'line', source: 'demolished', paint: { 'line-color': '#8a9099', 'line-width': 1, 'line-dasharray': [1, 2] } });
        map.addLayer({ id: 'strip', type: 'fill', source: 'strip', paint: { 'fill-color': COLORS.strip, 'fill-opacity': 0.35 } });
        map.addLayer({ id: 'fire', type: 'fill', source: 'fire', paint: { 'fill-color': COLORS.fire, 'fill-opacity': 0.35 } });
        map.addLayer({ id: 'fpHigh', type: 'line', source: 'fpHigh', paint: { 'line-color': COLORS.fpHigh, 'line-width': 2, 'line-dasharray': [2, 1.5] } });
        map.addLayer({ id: 'fpLow', type: 'line', source: 'fpLow', paint: { 'line-color': COLORS.fpLow, 'line-width': 2, 'line-dasharray': [1, 1.5] } });
        map.addLayer({ id: 'plot-fill', type: 'fill', source: 'plot', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.12 } });
        map.addLayer({ id: 'plot-line', type: 'line', source: 'plot', paint: { 'line-color': COLORS.plot, 'line-width': 2.5 } });
        map.addLayer({ id: 'roadEdges', type: 'line', source: 'roadEdges', paint: { 'line-color': COLORS.road, 'line-width': 6, 'line-opacity': 0.9 } });
        map.addLayer({ id: 'rays', type: 'line', source: 'rays', paint: { 'line-color': COLORS.rays, 'line-width': 1.5, 'line-opacity': 0.8 } });
        map.addLayer({ id: 'measure', type: 'line', source: 'measure', paint: { 'line-color': COLORS.measure, 'line-width': 3 } });
        map.addLayer({ id: 'floors', type: 'fill-extrusion', source: 'floors', paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-opacity': 0.92 } });
        const env = new EnvelopeLayer();
        envRef.current = env;
        map.addLayer(env);

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
    set('fpHigh', fc(fps && v.envelope !== 'lowRise' ? mpToLL(frame, fps.highRise.mp) : []));
    set('fpLow', fc(fps && v.envelope !== 'highRise' ? mpToLL(frame, fps.lowRise.mp) : []));
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
    // envelope
    const env = envRef.current;
    if (env) {
      if (!site || !fps || v.envelope === 'none') env.set(null, []);
      else if (v.envelope === 'highRise') env.set(frame, fps.highRise.area > 0 ? [{ mesh: envelopeMesh(site, fps.highRise.mp), color: COLORS.envHigh, opacity: 0.16 }] : []);
      else env.set(frame, fps.lowRise.area > 0 ? [{ mesh: envelopeMesh(site, fps.lowRise.mp, 23), color: COLORS.envLow, opacity: 0.18 }] : []);
    }
  }

  useEffect(syncPlot, [p.state.ring]);
  useEffect(syncTool, [p.tool]);
  useEffect(syncData, [p.results, p.state.view, p.rays, p.measure, p.demolished, p.frame]);
  useEffect(() => {
    const map = mapRef.current, ring = p.state.ring;
    if (!map || ring.length < 3) return;
    const b = ring.reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])], [Infinity, Infinity, -Infinity, -Infinity]);
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 160, maxZoom: 18, pitch: 55, bearing: -20, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitKey]);

  return <div ref={el} className="map" aria-label="Map: draw the plot, pick the road edge" />;
}
