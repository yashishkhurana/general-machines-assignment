import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compute } from '../core/compute';
import { isTower } from '../core/concepts';
import { fmtVs } from '../core/format';
import { pointInRing, type Pt } from '../core/geom';
import { rule, type Zone } from '../core/rules';
import type { RoadEdgeInput, Settings } from '../core/types';
import { BUILDINGS, bboxLL, bboxOverlap, featureBBox, type LL } from '../geo/data';
import { soi39Example } from '../geo/example';
import { estimateFrontage } from '../geo/roadWidth';
import { toSiteInput } from '../geo/siteInput';
import { MapView } from './MapView';
import { AlsoConsidered, Checks, ConceptSwitch, Credits, Floors, Limits, Notices, RulesView, Setup, ToolHint, Verdict, n0, n1 } from './Panels';
import { encodeState, exampleState, isExample, readLink, remapRoads, type AppState, type Tool, type ViewState } from './state';
import { createUrlWriter } from './urlWriter';

const initial = (() => {
  const link = readLink(location.hash);
  return { state: link.status === 'ok' ? link.state : exampleState(), badLink: link.status === 'invalid' };
})();

export function App() {
  const [state, setState] = useState<AppState>(initial.state);
  const [badLink, setBadLink] = useState(initial.badLink);
  const [tool, setTool] = useState<Tool>('edit');
  const [measure, setMeasure] = useState<LL[]>([]);
  const [fitKey, setFitKey] = useState('init');
  const [copied, setCopied] = useState(false);
  const [rules, setRules] = useState<string | null>(null); // null = result; else the anchor to show
  const [editing, setEditing] = useState(false); // phone: setup shown
  const ringRef = useRef(state.ring);
  ringRef.current = state.ring;
  const stateRef = useRef(state);
  stateRef.current = state;

  const { input, frame } = useMemo(() => toSiteInput(state), [state.ring, state.roads, state.zoneOverride, state.settings]);
  const results = useMemo(() => compute(input), [input]);

  const estimates = useMemo(() => state.roads.map((r) => {
    const n = input.plot.length;
    if (r.edge < 0 || r.edge >= n) return null;
    try { return estimateFrontage(frame, input.plot[r.edge], input.plot[(r.edge + 1) % n]); } catch { return null; }
  }), [input, frame, state.roads]);
  const rays = useMemo(() => estimates.flatMap((e) => e?.gap?.rayLines ?? []), [estimates]);
  const measured = useMemo(() => (measure.length === 2 ? Math.hypot(...((a: Pt, b: Pt) => [a[0] - b[0], a[1] - b[1]])(frame.toM(measure[0]), frame.toM(measure[1]))) : null), [measure, frame]);

  const demolished = useMemo(() => {
    const out = new Set<number>();
    if (state.ring.length < 3) return out;
    const box = bboxLL(state.ring);
    for (const b of BUILDINGS.features) {
      if (!bboxOverlap(featureBBox(b), box)) continue;
      const r = b.geometry.coordinates[0];
      const c: LL = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
      if (pointInRing(c, state.ring)) out.add(b.properties.id);
    }
    return out;
  }, [state.ring]);

  // share links: a pasted link replaces the case; an unreadable one says so
  useEffect(() => {
    const onHash = () => {
      const link = readLink(location.hash);
      if (link.status === 'ok') { setState(link.state); setBadLink(false); setMeasure([]); setFitKey(String(Date.now())); }
      else if (link.status === 'invalid') { setState(exampleState()); setBadLink(true); setFitKey(String(Date.now())); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // inputs live in the URL: written at once on every discrete edit (a reload picks its URL before
  // pagehide fires), throttled only while a corner is being dragged, and flushed when the page is hidden
  const urlWriter = useMemo(() => createUrlWriter({ write: (h) => history.replaceState(null, '', h) }), []);
  const dragging = useRef(false);
  useEffect(() => {
    urlWriter.update('#' + encodeState(state), dragging.current);
    dragging.current = false;
  }, [state, urlWriter]);
  useEffect(() => {
    const flush = () => { urlWriter.update('#' + encodeState(stateRef.current)); urlWriter.flush(); };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush); document.removeEventListener('visibilitychange', onVis); };
  }, [urlWriter]);
  useEffect(() => {
    if (!rules) return;
    const el = document.getElementById(rules === 'limits' || rules === 'road-width' ? rules : `rule-${rules}`);
    el?.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [rules]);

  const onRing = useCallback((ring: LL[], final: boolean, isNew?: boolean) => {
    if (isNew) { setMeasure([]); setTool('pickRoad'); }
    dragging.current = !final && !isNew; // mid-drag updates are throttled; the final one is written at once
    setState((s) => ({ ...s, ring, roads: isNew ? [] : remapRoads(ringRef.current, ring, s.roads) }));
  }, []);
  const onPickEdge = useCallback((edge: number) => {
    setState((s) => {
      if (s.roads.some((r) => r.edge === edge)) return { ...s, roads: s.roads.filter((r) => r.edge !== edge) };
      const { input: inp, frame: fr } = toSiteInput(s);
      const est = estimateFrontage(fr, inp.plot[edge], inp.plot[(edge + 1) % inp.plot.length]);
      const name = `${est.road?.properties.name ?? ''} ${est.road?.properties['name:en'] ?? ''}`;
      const isSoi39 = /สุขุมวิท 39|Sukhumvit 39/.test(name);
      const gap = est.gap?.value != null ? Math.round(est.gap.value * 10) / 10 : null;
      const width = isSoi39 ? soi39Example().planned : gap ?? 10;
      const current = gap !== null ? Math.min(gap, Math.max(width, gap)) : width;
      return { ...s, roads: [...s.roads, { edge, width, current }] };
    });
  }, []);

  const setRoads = (roads: RoadEdgeInput[]) => setState((s) => ({ ...s, roads }));
  const setSettings = (settings: Settings) => setState((s) => ({ ...s, settings }));
  const setZone = (zoneOverride: Zone | null) => setState((s) => ({ ...s, zoneOverride }));
  const setView = (v: Partial<ViewState>) => setState((s) => ({ ...s, view: { ...s.view, ...v } }));
  // resets the plot, road, zone and every setting (keeps nothing from the edited case)
  const reset = () => { setState(exampleState()); setBadLink(false); setMeasure([]); setTool('edit'); setRules(null); setFitKey(String(Date.now())); };
  const copy = async () => {
    const url = location.origin + location.pathname + '#' + encodeState(state);
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { history.replaceState(null, '', url); }
  };
  const chooseTool = (t: Tool) => { setTool(t); if (t === 'measure') { setMeasure([]); setView({ satellite: true }); } if (t !== 'edit') setEditing(false); };
  const which: 'A' | 'B' = state.view.concept === 'B' ? 'B' : 'A';
  const chooseConcept = (c: 'A' | 'B') => { const k = results.concepts.find((x) => x.concept.id === c)?.concept; setView({ concept: c, envelope: state.view.envelope === 'none' ? 'none' : k && !isTower(k) ? 'lowRise' : 'highRise' }); };
  const openRules = (a: string) => setRules(a || 'top');

  const sel = results.concepts.find((c) => c.concept.id === which) ?? results.concepts[0];
  // the ranking can swap A and B when the plot or a setting changes: keep the same layout selected if still shown
  const lastSel = useRef<{ results: typeof results; key: string | null } | null>(null);
  useEffect(() => {
    const prev = lastSel.current;
    if (prev && prev.results !== results && prev.key) {
      const keep = results.concepts.find((c) => c.key === prev.key);
      if (keep && keep.concept.id !== which) { lastSel.current = { results, key: prev.key }; setView({ concept: keep.concept.id }); return; }
    }
    lastSel.current = { results, key: results.concepts.find((c) => c.concept.id === which)?.key ?? null };
  }, [results, which]);
  const atExample = isExample(state);
  // the road-width caveat, as one line
  const r0 = state.roads[0], est = estimates[0];
  const roadNote = r0 && est?.gap?.value != null && Number.isFinite(r0.current) ? (() => {
    const lo = est.lane.value, hi = est.gap.median ?? est.gap.value;
    const t = rule('access.road');
    const near = Math.abs(r0.current - t) < 3;
    return { text: `From the gaps between buildings${lo != null ? `; somewhere between ${n1(lo)} and ${n1(hi)} m` : ''}.${near ? ` Under ${t} m only a low-rise is allowed, and ${fmtVs(r0.current, t)} m is ${fmtVs(Math.abs(r0.current - t), 0)} m ${r0.current >= t ? 'above' : 'below'} that.` : ''}` };
  })() : null;
  const roadName = est?.road?.properties['name:en'] ?? est?.road?.properties.name;
  const err = results.messages.find((m) => m.level === 'error');
  const summary = !err && results.far && sel?.concept.ok
    ? `${isTower(sel.concept) ? `${sel.concept.storeys}-storey tower` : `${sel.concept.storeys}-storey block`}: ${n0(sel.concept.total)} of ${n0(results.far.permitted)} m² allowed`
    : (err ? 'No result: see below' : 'Draw a plot to start');

  return (
    <div className={`app${editing ? ' editing' : ''}`}>
      <header className="top">
        <div className="brand">Bangkok plot envelope</div>
        <p className="sum fig" aria-live="polite">{summary}</p>
        <nav className="topnav">
          <button type="button" className="edit-btn" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
          <button type="button" onClick={() => chooseTool('draw')}>Draw a new plot</button>
          <button type="button" onClick={reset} disabled={atExample} title={atExample ? 'Showing the example' : 'Back to the Soi 39 example, with default settings'}>Reset to example</button>
          <button type="button" onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>
          <button type="button" onClick={() => { (window as any).__snapMap?.(); window.print(); }}>Print report</button>
        </nav>
      </header>
      <aside className="inputs" aria-label="Setup">
        <Setup state={state} results={results} estimates={estimates} measured={measured} tool={tool} setTool={chooseTool} setRoads={setRoads} setSettings={setSettings} setZone={setZone} setView={setView} openRules={openRules} />
      </aside>
      <main className="center">
        <MapView state={state} results={results} frame={frame} tool={tool} rays={state.view.rays ? rays : []} measure={measure} demolished={demolished}
          onRing={onRing} onPickEdge={onPickEdge} onMeasure={setMeasure} onToolDone={() => setTool((t) => (t === 'draw' ? 'edit' : t))} fitKey={fitKey} roadName={roadName} />
        <ToolHint tool={tool} measure={measured} />
      </main>
      <section className="results" aria-label="Result">
        {rules ? (
          <RulesView results={results} estimates={estimates} focus={rules} onBack={() => setRules(null)} />
        ) : (
          <>
            {badLink && <p className="banner" role="alert">This link couldn't be read, so you're seeing the example. <button type="button" className="link" onClick={() => setBadLink(false)}>Dismiss</button></p>}
            {atExample && !badLink && <p className="intro">Example: a 2,000 m² plot on Sukhumvit Soi 39, 1,910 m² once the road is widened. A is a tower on a podium, B a low-rise block. Draw your own plot, or drag the corners.</p>}
            <Verdict results={results} which={which} />
            {results.concepts.length > 0 && !err && <ConceptSwitch results={results} value={which} onChange={chooseConcept} />}
            {!err && <AlsoConsidered results={results} />}
            <Notices results={results} />
            {!err && sel?.concept.ok && results.far && <Limits c={sel.concept} results={results} />}
            {!err && sel && <Checks items={sel.checks} roadNote={roadNote} openRules={openRules} />}
            {!err && sel?.concept.ok && <Floors c={sel.concept} />}
            <p className="foot"><button type="button" className="link" onClick={() => openRules('top')}>All rules and sources</button></p>
            <Credits satellite={state.view.satellite} />
          </>
        )}
      </section>
    </div>
  );
}
