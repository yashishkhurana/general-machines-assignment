import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compute } from '../core/compute';
import { pointInRing, type Pt } from '../core/geom';
import type { Zone } from '../core/rules';
import type { RoadEdgeInput, Settings } from '../core/types';
import { BUILDINGS, bboxLL, bboxOverlap, featureBBox, type LL } from '../geo/data';
import { estimateFrontage } from '../geo/roadWidth';
import { toSiteInput } from '../geo/siteInput';
import { MapView } from './MapView';
import { ConceptCard, Credits, InputsPanel, Legend, Limits, Messages, RulesPanel, Summary, ToolHint, Toolbar, ruleIdsUsed } from './Panels';
import { decodeState, encodeState, exampleState, isExample, remapRoads, type AppState, type Tool, type ViewState } from './state';
import { soi39Example } from '../geo/example';

type Tab = 'summary' | 'A' | 'B' | 'rules' | 'limits';

export function App() {
  const [state, setState] = useState<AppState>(() => decodeState(location.hash) ?? exampleState());
  const [tool, setTool] = useState<Tool>('edit');
  const [tab, setTab] = useState<Tab>('summary');
  const [measure, setMeasure] = useState<LL[]>([]);
  const [fitKey, setFitKey] = useState('init');
  const [copied, setCopied] = useState(false);
  const ringRef = useRef(state.ring);
  ringRef.current = state.ring;

  const { input, frame } = useMemo(() => toSiteInput(state), [state.ring, state.roads, state.zoneOverride, state.settings]);
  const results = useMemo(() => compute(input), [input]);

  const estimates = useMemo(() => state.roads.map((r) => {
    const n = input.plot.length;
    if (r.edge < 0 || r.edge >= n) return null;
    try { return estimateFrontage(frame, input.plot[r.edge], input.plot[(r.edge + 1) % n]); } catch { return null; }
  }), [input, frame, state.roads]);
  const rays = useMemo(() => estimates.flatMap((e) => e?.gap?.rayLines ?? []), [estimates]);
  const measured = useMemo(() => (measure.length === 2 ? Math.hypot(...((a: Pt, b: Pt) => [a[0] - b[0], a[1] - b[1]])(frame.toM(measure[0]), frame.toM(measure[1]))) : null), [measure, frame]);

  // existing buildings on the plot are taken as demolished (drawn as outlines)
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

  // a pasted share link (hash change without reload) replaces the case
  useEffect(() => {
    const onHash = () => {
      const next = decodeState(location.hash);
      if (next) { setState(next); setMeasure([]); setFitKey(String(Date.now())); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // inputs live in the URL
  useEffect(() => {
    const t = setTimeout(() => history.replaceState(null, '', '#' + encodeState(state)), 250);
    return () => clearTimeout(t);
  }, [state]);

  const onRing = useCallback((ring: LL[], _final: boolean, isNew?: boolean) => {
    if (isNew) { setMeasure([]); setTool('pickRoad'); }
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
  const reset = () => { setState(exampleState()); setMeasure([]); setTool('edit'); setFitKey(String(Date.now())); };
  const copy = async () => {
    const url = location.origin + location.pathname + '#' + encodeState(state);
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { history.replaceState(null, '', url); }
  };
  const chooseTool = (t: Tool) => { setTool(t); if (t === 'measure') { setMeasure([]); setView({ satellite: true }); } };

  const used = useMemo(() => ruleIdsUsed(results), [results]);
  const A = results.concepts.find((c) => c.concept.id === 'A');
  const B = results.concepts.find((c) => c.concept.id === 'B');
  const stop = results.messages.find((m) => m.level === 'error');

  return (
    <div className="app">
      <header>
        <div className="title">
          <h1>Bangkok plot envelope</h1>
          <p>Condo feasibility under the B.E. 2556 plan, zones ย.8–ย.10</p>
        </div>
        <Toolbar tool={tool} setTool={chooseTool} onReset={reset} onPrint={() => { (window as any).__snapMap?.(); window.print(); }} onCopy={copy} copied={copied} isExample={isExample(state)} />
      </header>
      <aside className="left">
        <InputsPanel state={state} results={results} estimates={estimates} measured={measured} setRoads={setRoads} setSettings={setSettings} setZone={setZone} setView={setView} />
      </aside>
      <main className="center">
        <MapView state={state} results={results} frame={frame} tool={tool} rays={state.view.rays ? rays : []} measure={measure} demolished={demolished}
          onRing={onRing} onPickEdge={onPickEdge} onMeasure={setMeasure} onToolDone={() => setTool((t) => (t === 'draw' ? 'edit' : t))} fitKey={fitKey} />
        <ToolHint tool={tool} measure={measured} />
        <Legend view={state.view} />
      </main>
      <aside className="right">
        <div className="headline">
          {stop ? <p className="err"><b>No result.</b> {stop.text}</p> : results.far ? (
            <p><b>{results.far.permitted.toLocaleString('en-US', { maximumFractionDigits: 0 })} m²</b> permitted · A {A?.concept.ok ? `${A.concept.total.toLocaleString('en-US', { maximumFractionDigits: 0 })} m²` : '—'} · B {B?.concept.ok ? `${B.concept.total.toLocaleString('en-US', { maximumFractionDigits: 0 })} m²` : '—'}</p>
          ) : null}
        </div>
        <nav className="tabs" role="tablist">
          {([['summary', 'Summary'], ['A', 'Concept A'], ['B', 'Concept B'], ['rules', 'Rules'], ['limits', 'Limits']] as [Tab, string][]).map(([t, l]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); if (t === 'A' || t === 'B') setView({ concept: t }); }}>{l}</button>
          ))}
        </nav>
        <div className={`tabbody tab-${tab}`}>
          <div className="pane pane-summary"><Messages results={results} /><Summary results={results} /></div>
          <div className="pane pane-A">{A && <ConceptCard c={A.concept} checks={A.checks} />}</div>
          <div className="pane pane-B">{B && <ConceptCard c={B.concept} checks={B.checks} />}</div>
          <div className="pane pane-rules"><RulesPanel used={used} /></div>
          <div className="pane pane-limits"><Limits /></div>
        </div>
        <Credits satellite={state.view.satellite} />
      </aside>
    </div>
  );
}
