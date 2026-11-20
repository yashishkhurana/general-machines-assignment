import { Fragment, useState, type ReactNode } from 'react';
import { lowRiseMargins, type CheckItem } from '../core/checklist';
import type { Results } from '../core/compute';
import type { Concept } from '../core/concepts';
import { parkingAreaPerSpace } from '../core/metrics';
import { RULES, SUPPORTED_ZONES, rule, zoneFar, zoneOsr, type Rule, type Zone } from '../core/rules';
import type { RoadEdgeInput, Settings } from '../core/types';
import { META } from '../geo/data';
import type { FrontageEstimate } from '../geo/roadWidth';
import { COLORS, ESRI_ATTR } from './MapView';
import type { AppState, Tool, ViewState } from './state';

const n0 = (x: number) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—');
const n1 = (x: number) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '—');
const pc = (x: number) => `${n1(x * 100)}%`;

function Num(p: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; hint?: ReactNode; id: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <label className="field" htmlFor={p.id}>
      <span>{p.label}</span>
      <span className="inp">
        <input id={p.id} type="text" inputMode="decimal" value={txt ?? (Number.isFinite(p.value) ? String(p.value) : '')}
          onChange={(e) => { setTxt(e.target.value); const v = e.target.value.trim() === '' ? NaN : Number(e.target.value.replace(',', '.')); p.onChange(v); }}
          onBlur={() => setTxt(null)} />
        {p.unit && <em>{p.unit}</em>}
      </span>
      {p.hint && <small>{p.hint}</small>}
    </label>
  );
}

export function Toolbar(p: { tool: Tool; setTool: (t: Tool) => void; onReset: () => void; onPrint: () => void; onCopy: () => void; copied: boolean; isExample: boolean }) {
  const b = (t: Tool, label: string, title: string) => (
    <button className={p.tool === t ? 'on' : ''} aria-pressed={p.tool === t} title={title} onClick={() => p.setTool(p.tool === t ? 'edit' : t)}>{label}</button>
  );
  return (
    <div className="toolbar" role="toolbar">
      {b('draw', 'Draw plot', 'Click corners, click the first corner (or double-click) to close')}
      {b('pickRoad', 'Pick road edge', 'Click a plot edge to mark or unmark it as facing a road')}
      {b('measure', 'Measure across road', 'Click both road boundaries over the satellite layer')}
      <span className="sep" />
      <button onClick={p.onReset} disabled={p.isExample} title="Load the Soi 39 example parcel">Reset to example</button>
      <button onClick={p.onCopy} title="Copy a link to this case">{p.copied ? 'Link copied' : 'Share link'}</button>
      <button onClick={p.onPrint}>Print</button>
    </div>
  );
}

export function ToolHint({ tool, measure }: { tool: Tool; measure: number | null }) {
  const t: Record<Tool, string> = {
    edit: 'Drag corners to edit the plot; drag the small midpoints to add a corner.',
    draw: 'Click each corner of the plot. Click the first corner to close it.',
    pickRoad: 'Click a plot edge to mark it as facing a road (click again to unmark). Easier with the map flat: right-drag or use the compass to reset tilt.',
    measure: measure !== null ? `Measured ${n1(measure)} m. Click again to start a new measurement.` : 'Click one road boundary, then the other (turn on the satellite layer first).',
  };
  return <div className="hint" role="status">{t[tool]}</div>;
}

/** Next to the current-width input: what the estimate rests on, its spread, and how close it sits to a
 *  Reg. 33 cl. 2 access threshold (10 m for high-rise / extra-large, 18 m above 30,000 m²). */
function SensitivityNote({ current, est }: { current: number; est: FrontageEstimate | null }) {
  if (!Number.isFinite(current)) return null;
  const gap = est?.gap;
  const lo = est?.lane.value ?? null;
  const parts: string[] = [];
  if (gap?.value != null) {
    parts.push(`The building-gap bound rests on ${gap.rays} of ${gap.total} rays across the frontage${lo != null && gap.median != null ? `; estimates range ${n1(lo)}–${n1(gap.median)} m (lanes lower bound to median gap)` : ''}.`);
  }
  const near = [rule('access.road'), rule('access.road.big')].map((t) => ({ t, d: current - t })).filter((x) => Math.abs(x.d) < 3);
  for (const { t, d } of near) {
    parts.push(`${n1(current)} m is ${n1(Math.abs(d))} m ${d >= 0 ? 'above' : 'below'} the ${t} m access threshold (Reg. 33 cl. 2)${t === rule('access.road') ? ', which decides whether a high-rise is allowed at all' : ', above which floor area is capped at 30,000 m²'}: the result is sensitive to this value.`);
  }
  if (!parts.length) return null;
  return <p className={`sens${near.length ? ' warn' : ''}`} role="note">{parts.join(' ')}</p>;
}

export function InputsPanel(p: {
  state: AppState; results: Results; estimates: (FrontageEstimate | null)[]; measured: number | null;
  setRoads: (r: RoadEdgeInput[]) => void; setSettings: (s: Settings) => void; setZone: (z: Zone | null) => void; setView: (v: Partial<ViewState>) => void;
}) {
  const { state, results } = p;
  const s = state.settings;
  const set = (patch: Partial<Settings>) => p.setSettings({ ...s, ...patch, bonus: { ...s.bonus, ...(patch.bonus ?? {}) } });
  const detected = results.zone?.detected ?? [];
  const aps = parkingAreaPerSpace(s);
  return (
    <div className="panel inputs">
      <section>
        <h3>Zone</h3>
        <p className="zoneline">
          Layer says: <b>{detected.length ? detected.map((d) => `${d.zone}${detected.length > 1 ? ` (${n0(d.area)} m²)` : ''}`).join(' + ') : 'none'}</b>
        </p>
        <label className="field" htmlFor="zone">
          <span>Use zone</span>
          <select id="zone" value={state.zoneOverride ?? ''} onChange={(e) => p.setZone((e.target.value || null) as Zone | null)}>
            <option value="">From the zone layer</option>
            {SUPPORTED_ZONES.map((z) => <option key={z} value={z}>{z} (typed: FAR {zoneFar(z)}, OSR {pc(zoneOsr(z))})</option>)}
          </select>
        </label>
        <small className="muted">Approximate boundaries (simplified extract of the 2556 plan map): verify against BMA.</small>
      </section>

      <section>
        <h3>Road edges</h3>
        {!state.roads.length && <p className="muted">None yet. Use “Pick road edge”.</p>}
        {state.roads.map((r, i) => {
          const est = p.estimates[i];
          const upd = (patch: Partial<RoadEdgeInput>) => p.setRoads(state.roads.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          const roadName = est?.road?.properties['name:en'] ?? est?.road?.properties.name;
          return (
            <div key={i} className="roadcard">
              <div className="roadhead">
                <b>Edge {r.edge >= 0 ? r.edge + 1 : '?'}</b>{roadName ? <span className="muted"> · {roadName}</span> : null}
                <button className="link" onClick={() => p.setRoads(state.roads.filter((_, j) => j !== i))}>remove</button>
              </div>
              <div className="two">
                <Num id={`w${i}`} label="Planned / legal ROW" unit="m" value={r.width} onChange={(v) => upd({ width: v })} />
                <Num id={`c${i}`} label="Current ROW" unit="m" value={r.current} onChange={(v) => upd({ current: v })} />
              </div>
              <SensitivityNote current={r.current} est={est} />
              <table className="est">
                <thead><tr><th>Current-width estimate</th><th>m</th><th /></tr></thead>
                <tbody>
                  <tr>
                    <td>(a) Lower bound: {est?.lane.text ?? '—'}</td><td>{est?.lane.value != null ? n1(est.lane.value) : '—'}</td>
                    <td>{est?.lane.value != null && <button className="link" onClick={() => upd({ current: Math.round(est.lane.value! * 10) / 10 })}>use</button>}</td>
                  </tr>
                  <tr>
                    <td>(b) Upper bound from building gap, not a survey: {est?.gap?.text ?? 'no OSM data here'}</td><td>{est?.gap?.value != null ? n1(est.gap.value) : '—'}</td>
                    <td>{est?.gap?.value != null && <button className="link" onClick={() => upd({ current: Math.round(est.gap!.value! * 10) / 10 })}>use</button>}</td>
                  </tr>
                  <tr>
                    <td>(c) Measured by you over imagery</td><td>{p.measured !== null ? n1(p.measured) : '—'}</td>
                    <td>{p.measured !== null && <button className="link" onClick={() => upd({ current: Math.round(p.measured! * 10) / 10 })}>use</button>}</td>
                  </tr>
                </tbody>
              </table>
              <small className="muted">None of these is the legal right-of-way: that needs the land-office parcel map or a survey. Under the planned width, the widening strip (red) comes out of the plot, assumed symmetric about the centreline.</small>
            </div>
          );
        })}
        <label className="check"><input type="checkbox" checked={s.roadContinuity} onChange={(e) => set({ roadContinuity: e.target.checked })} /> Road continues at this width to another public road (Reg. 33 cl. 2)</label>
        <label className="field" htmlFor="heightTo">
          <span>Measure the height plane to</span>
          <select id="heightTo" value={s.heightTo} onChange={(e) => set({ heightTo: e.target.value as Settings['heightTo'] })}>
            <option value="current">Current far boundary of the road (strict, default)</option>
            <option value="planned">Planned far line under art. 36 ¶2</option>
          </select>
          <small>Only matters where the road is to be widened. Art. 36 ¶2 may extend the planned line to "the various distances", but its reach for a ย.10 condo isn't certain, and the road isn't widened yet. The summary shows both figures.</small>
        </label>
      </section>

      <section>
        <h3>Bonuses <small className="muted">(art. 52, 55, 56; ≤ 20% combined)</small></h3>
        <Num id="aff" label="Affordable housing provided" unit="m²" value={s.bonus.affordableArea} onChange={(v) => set({ bonus: { ...s.bonus, affordableArea: v } })} hint="Extra floor area ≤ 4 × this area" />
        <Num id="rain" label="Rainwater storage" unit="m³" value={s.bonus.rainwaterM3} onChange={(v) => set({ bonus: { ...s.bonus, rainwaterM3: v } })} hint="+5% per 1 m³ per 50 m² of land, in proportion" />
        <label className="field" htmlFor="energy"><span>Energy certification level</span>
          <select id="energy" value={s.bonus.energyLevel} onChange={(e) => set({ bonus: { ...s.bonus, energyLevel: Number(e.target.value) } })}>
            {[0, 1, 2, 3, 4].map((l) => <option key={l} value={l}>{l === 0 ? 'None' : `Level ${l} (+${l * 5}%)`}</option>)}
          </select>
        </label>
        {results.far && <small className="muted">Applied: {pc(results.far.bonusPct.applied)}{results.far.bonusPct.clamped ? ` (clamped from ${pc(results.far.bonusPct.requested)})` : ''}</small>}
      </section>

      <section>
        <h3>Building assumptions</h3>
        <div className="two">
          <Num id="g" label="Ground floor height" unit="m" value={s.groundFloor} onChange={(v) => set({ groundFloor: v })} />
          <Num id="f" label="Typical floor-to-floor" unit="m" value={s.floorToFloor} onChange={(v) => set({ floorToFloor: v })} />
        </div>
        <Num id="aps" label="Parking area per space" unit="m²" value={s.parkingAreaPerSpace ?? Math.round(aps * 100) / 100} onChange={(v) => set({ parkingAreaPerSpace: Number.isFinite(v) && Math.abs(v - aps) > 1e-6 ? v : null })}
          hint={<>Default {n1(aps)} m²: stall 2.4 × 5.0 m (Reg. 41) + half a 6 m aisle (Reg. 7 cl. 8), × 1.4 for ramps and cores (assumed).</>} />
        <div className="two">
          <Num id="avg" label="Average unit" unit="m²" value={s.avgUnitArea} onChange={(v) => set({ avgUnitArea: v })} />
          <Num id="mix" label="Units over 60 m²" unit="%" value={Math.round(s.shareOver60 * 1000) / 10} onChange={(v) => set({ shareOver60: v / 100 })} />
        </div>
        <small className="muted">Unit mix sets the per-unit parking count (Reg. 7 cl. 3(1)(C), units over 60 m² only); 75% of residential floor area assumed saleable.</small>
      </section>

      <section>
        <h3>View</h3>
        <div className="seg" role="group" aria-label="Envelope">
          {(['highRise', 'lowRise', 'none'] as const).map((e) => <button key={e} className={state.view.envelope === e ? 'on' : ''} onClick={() => p.setView({ envelope: e })}>{e === 'highRise' ? 'High-rise envelope' : e === 'lowRise' ? 'Low-rise envelope' : 'No envelope'}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Concept">
          {(['A', 'B', 'none'] as const).map((c) => <button key={c} className={state.view.concept === c ? 'on' : ''} onClick={() => p.setView({ concept: c })}>{c === 'none' ? 'No concept' : `Concept ${c}`}</button>)}
        </div>
        <label className="check"><input type="checkbox" checked={state.view.satellite} onChange={(e) => p.setView({ satellite: e.target.checked })} /> Satellite imagery (Esri)</label>
        <label className="check"><input type="checkbox" checked={state.view.buildings} onChange={(e) => p.setView({ buildings: e.target.checked })} /> Neighbouring buildings</label>
        <label className="check"><input type="checkbox" checked={state.view.zones} onChange={(e) => p.setView({ zones: e.target.checked })} /> Zone layer</label>
        <label className="check"><input type="checkbox" checked={state.view.rays} onChange={(e) => p.setView({ rays: e.target.checked })} /> Building-gap rays</label>
      </section>
    </div>
  );
}

export function Legend({ view }: { view: ViewState }) {
  const sw = (c: string, o = 1, dashed = false) => <i className="sw" style={{ background: dashed ? 'transparent' : c, opacity: o, borderColor: c, borderStyle: dashed ? 'dashed' : 'solid' }} />;
  return (
    <div className="legend" aria-label="Legend">
      <span>{sw(COLORS.road)}Road edge</span>
      <span>{sw(COLORS.strip, 0.5)}Widening strip</span>
      <span>{sw(view.envelope === 'lowRise' ? COLORS.envLow : COLORS.envHigh, 0.4)}Envelope ({view.envelope === 'lowRise' ? 'low-rise, < 23 m' : 'high-rise, height plane'})</span>
      <span>{sw(COLORS.fpHigh, 1, true)}High-rise footprint</span>
      <span>{sw(COLORS.fpLow, 1, true)}Low-rise footprint</span>
      <span>{sw(COLORS.residential)}Concept: residential</span>
      <span>{sw(COLORS.parking)}Concept: parking</span>
      <span>{sw(COLORS.fire, 0.6)}6 m fire ring</span>
      <span>{sw(COLORS.bldKnown)}Height: OSM tag</span>
      <span>{sw(COLORS.bldListing)}Height: sourced listing</span>
      <span>{sw(COLORS.bldVisual)}Height: visual estimate</span>
      <span>{sw(COLORS.bldAssumed)}Height unknown: 6 m assumed</span>
      <span>{sw(COLORS.rays)}Building-gap rays</span>
    </div>
  );
}

const STATUS: Record<CheckItem['status'], string> = { pass: 'Pass', fail: 'Fail', warn: 'Warning', info: 'Note' };

function Checklist({ items }: { items: CheckItem[] }) {
  return (
    <table className="checks">
      <thead><tr><th /><th>Rule</th><th>Required</th><th>Provided</th><th>Clause</th></tr></thead>
      <tbody>
        {items.map((c) => (
          <tr key={c.id} className={c.status}>
            <td><span className={`badge ${c.status}`}>{STATUS[c.status]}</span></td>
            <td>{c.label}</td><td>{c.required}</td><td>{c.provided}</td><td className="clause">{c.clause}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FloorTable({ c }: { c: Concept }) {
  const order = [...c.floors].reverse();
  return (
    <table className="floors">
      <thead><tr><th>Level</th><th>Use</th><th>Plate m²</th><th>Spaces</th><th>Running total m²</th><th>of cap</th></tr></thead>
      <tbody>
        {order.map((f) => (
          <tr key={f.level} className={f.use === 'residential' ? '' : 'park'}>
            <td>{f.level}</td><td>{f.use}</td><td>{n0(f.area)}</td><td>{f.spaces || ''}</td><td>{n0(f.running)}</td><td>{c.cap ? pc(f.running / c.cap) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ConceptCard({ c, checks }: { c: Concept; checks: CheckItem[] }) {
  const fails = checks.filter((x) => x.status === 'fail').length;
  return (
    <section className="concept">
      <h3>Concept {c.id}: {c.title}</h3>
      {!c.ok ? <p className="err">{c.reason}</p> : (
        <>
          <div className="kpis">
            <div><b>{c.storeys}{c.basements ? ` + ${c.basements}B` : ''}</b><span>floors</span></div>
            <div><b>{n0(c.total)}</b><span>m² total</span></div>
            <div><b>{n0(c.residential)}</b><span>m² residential</span></div>
            <div><b>{n1(c.roofDeck)}</b><span>m roof deck</span></div>
            <div><b>{c.parking.provided}/{c.parking.needed}</b><span>spaces</span></div>
            <div><b className={fails ? 'bad' : 'good'}>{fails ? `${fails} fail` : 'all pass'}</b><span>checklist</span></div>
          </div>
          <p className="muted">Class: {c.cls.label}. Stopped by: <b>{c.binding}</b>. Cap {n0(c.cap)} m² ({c.capLabel}).</p>
          {c.kind !== 'tower' && c.cls.lowRise && (() => {
            const m = lowRiseMargins(c);
            const pct = (100 * m.area) / ruleValue('class.extralarge.area');
            const fragile = m.area / ruleValue('class.extralarge.area') < ruleValue('class.extralarge.margin');
            return <p className={`margin${fragile ? ' warn' : ''}`}><b>{n0(m.area)} m²</b> ({pct.toFixed(2)}%) under the 10,000 m² extra-large line, <b>{n1(m.height)} m</b> under the 23 m high-rise line.{fragile ? ' Fragile: a survey or measurement difference of a fraction of a percent would make it extra-large and lose the low-rise envelope.' : ''}</p>;
          })()}
          {c.notes.map((n, i) => <p key={i} className="note">{n}</p>)}
          <details open><summary>Floor table</summary><FloorTable c={c} /></details>
          <details open><summary>Checklist</summary><Checklist items={checks} /></details>
        </>
      )}
    </section>
  );
}

export function Messages({ results }: { results: Results }) {
  const ms = results.messages;
  if (!ms.length) return null;
  return (
    <ul className="msgs" aria-live="polite">
      {ms.map((m, i) => <li key={i} className={m.level}><b>{m.level === 'error' ? 'Stop' : m.level === 'warn' ? 'Check' : 'Note'}</b> {m.text}</li>)}
    </ul>
  );
}

const trimNum = (x: number, d: number) => String(+x.toFixed(d));

/** "area × ratio" for each zone part, shown so the displayed numbers multiply out to the displayed total:
 *  areas are shown to whole m² unless that rounding would change the product's last digit. */
function farSum(zone: Results['zone'], bonus: number, permitted: number): string {
  const parts = (zone?.parts ?? []).filter((p) => isZone(p.zone));
  if (!parts.length) return '';
  const ratio = (z: Zone) => +(zoneFar(z) * (1 + bonus)).toFixed(4);
  for (const d of [0, 1, 2]) {
    const shown = parts.map((p) => +p.area.toFixed(d));
    const total = shown.reduce((s, a, i) => s + a * ratio(parts[i].zone as Zone), 0);
    if (Math.round(total) === Math.round(permitted) || d === 2) {
      return parts.map((p, i) => `${shown[i].toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })} m² × ${trimNum(ratio(p.zone as Zone), 3)}`).join(' + ');
    }
  }
  return '';
}
function areaLine(g: number, strip: number, net: number): string {
  if (strip <= 0) return `${n0(g)} m²`;
  for (const d of [0, 1, 2]) {
    const f = (x: number) => +x.toFixed(d);
    if (Math.abs(f(g) - f(strip) - f(net)) < 1e-9 || d === 2) {
      const t = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
      return `${t(g)} m² − ${t(strip)} m² widening strip = ${t(net)} m²`;
    }
  }
  return '';
}
const isZone = (z: string): z is Zone => (SUPPORTED_ZONES as readonly string[]).includes(z);

export function Summary({ results }: { results: Results }) {
  const { site, far, zone, avail, footprints, plane } = results;
  if (!site) return null;
  return (
    <section className="summary">
      <dl>
        <dt>Zone</dt><dd>{zone?.parts.map((p) => p.zone).join(' + ') || '—'} {zone?.status === 'override' ? '(typed)' : zone?.status === 'straddle' ? '(straddles)' : ''}</dd>
        <dt>Plot area</dt><dd>{areaLine(site.grossArea, site.stripArea, site.netArea)}</dd>
        {far && <><dt>Floor area ratio</dt><dd>{n1(far.baseRatio)}:1{far.bonusPct.applied ? ` + ${pc(far.bonusPct.applied)} bonus = ${trimNum(far.ratioWithBonus, 3)}:1` : ''}</dd>
          <dt>Permitted floor area</dt><dd>{farSum(zone, far.bonusPct.applied, far.permitted)} = <b>{n0(far.permitted)} m²</b>{avail?.floorAreaCap ? ` (high-rise capped at ${n0(avail.floorAreaCap)} m², road under 18 m)` : ''}</dd>
          <dt>Plan open space</dt><dd>{pc(far.osrWeighted)} of floor area, half planted</dd></>}
        {avail && <><dt>High-rise / extra-large</dt><dd>{avail.highRise ? 'available' : `unavailable: ${avail.reasons.join(' ')}`}</dd></>}
        {footprints && <><dt>Footprints</dt><dd>high-rise {n0(footprints.highRise.area)} m² · low-rise {n0(footprints.lowRise.area)} m²</dd></>}
        {plane && footprints && footprints.highRise.area > 0 && <><dt>Height plane</dt><dd>{n1(plane.atHighRiseFront)} m at the high-rise front line, rising 2 m per metre back{Math.abs(plane.atHighRiseFrontAlt - plane.atHighRiseFront) > 0.05 ? (plane.heightTo === 'current' ? `. Measured to the road's current far boundary (strict default); to the planned line under art. 36 ¶2 it would be ${n1(plane.atHighRiseFrontAlt)} m` : `. Measured to the planned far line (art. 36 ¶2); to the road's current far boundary it would be ${n1(plane.atHighRiseFrontAlt)} m`) : ''}</dd></>}
        {site.roads.map((r) => <Fragment key={r.edge}><dt>Road, edge {r.inputEdge + 1}</dt><dd>{n1(r.width)} m legal, {n1(r.current)} m current, frontage {n1(r.frontage)} m{r.strip > 0 ? `, strip ${n1(r.strip)} m` : ''}</dd></Fragment>)}
      </dl>
    </section>
  );
}

const VIA: Record<Rule['source'], string> = {
  gazette: 'Third-party copy: ASA PDF of the Thai text',
  'Reg. translation': 'Third-party copy: IIBH English translation',
  assumed: 'Tool assumption, not law',
};

export function RulesPanel({ used }: { used: Set<string> }) {
  const groups: [string, (r: Rule) => boolean][] = [
    ['City plan', (r) => r.clause.startsWith('Plan')],
    ['Building law', (r) => /Reg\.|Ordinance/.test(r.clause) && r.source !== 'assumed'],
    ['Assumptions and tool limits', (r) => r.source === 'assumed'],
  ];
  const all = Object.values(RULES) as Rule[];
  return (
    <div className="rules">
      <p className="muted">Every rule was read through a third-party copy. <b>gazette</b>: the Thai text in the Association of Siamese Architects' (ASA) PDF copies (the plan, the Ordinance, and ASA's consolidated texts of Reg. 33 and Reg. 55 with amendments). <b>Reg. translation</b>: only the IIBH English translation (Reg. 7, Reg. 41), not the Thai text. <b>The parking rules are the only ones still resting on the old translation alone.</b> <b>assumed</b>: this tool's assumption.</p>
      {groups.map(([g, f]) => (
        <details key={g} open={g !== 'Assumptions and tool limits'}>
          <summary>{g}</summary>
          <table>
            <thead><tr><th>Rule</th><th>Value</th><th>Clause</th><th>Source</th></tr></thead>
            <tbody>{all.filter(f).map((r) => (
              <tr key={r.id} className={used.has(r.id) ? 'used' : ''}>
                <td>{r.label}{r.note ? <small className="muted"> {r.note}</small> : null}</td>
                <td className="num">{+r.value.toFixed(4)} {r.unit}</td>
                <td>{r.clause}</td>
                <td><span className={`src ${r.source.replace(/\W/g, '')}`} title={VIA[r.source]}>{r.source}</span>{r.verified === false ? <span className="src unverified">unverified</span> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </details>
      ))}
    </div>
  );
}

export function Limits() {
  return (
    <section className="limits">
      <h3>What the tool does not do</h3>
      <ul>
        <li>Residential condominiums only, in ย.8–ย.10. Hotel and office (allowed in ย.10 with conditions, art. 17) are not modelled.</li>
        <li>Bonus clauses 53 and 54 (public open space, public parking) are not offered: both are for public buildings.</li>
        <li>Corner and two-road plots: the height plane takes the strictest road at every point. Reg. 55 cl. 45–46 may allow more; the tool doesn't claim it.</li>
        <li>Zone boundaries are approximate (simplified extract of the 2556 plan map): verify against BMA. A straddling plot is split per zone by the tool's own rule, not by a clause.</li>
        <li>Road continuity (Reg. 33 cl. 2) is a tick-box. Canal setbacks (Reg. 55 cl. 42) are not modelled.</li>
        <li>The current road width is an estimate; the legal right-of-way needs the land-office parcel map or a survey.</li>
        <li>Simplification: the low-rise generator drops a floor rather than redesigning when the next floor would make it extra-large.</li>
        <li>Environmental review is a flag only; its trigger wording is unverified.</li>
        <li>The parking count (Reg. 7) and stall sizes (Reg. 41) rest only on an old English translation (IIBH); the Thai text hasn't been checked.</li>
        <li>Building heights: {META.osm.sharePctEither}% of the {n0(META.osm.buildings)} OSM buildings here carry a height or levels tag ({META.extracted}); {META.osm.manual} more are hand-set (sourced listing or visual estimate, shown in their own colours); the rest are drawn at an assumed {META.osm.defaultHeightM} m in a lighter tone.</li>
      </ul>
    </section>
  );
}

export function Credits({ satellite }: { satellite: boolean }) {
  return (
    <footer className="credits">
      Map data © OpenStreetMap contributors (ODbL), extract of {META.extracted}. Basemap: OpenFreeMap. Zones: extraction by Kanesuan/KNS.MAP of the B.E. 2556 Bangkok Comprehensive Plan map, approximate boundaries (simplified extract of the 2556 plan map): verify against BMA. {satellite ? ESRI_ATTR + '.' : ''} Rules: Royal Gazette text of the 2556 plan and the Bangkok Building Control Ordinance B.E. 2544; Ministerial Regulations via the IIBH English translation. Not legal advice.
    </footer>
  );
}

export const ruleIdsUsed = (r: Results) => new Set(r.concepts.flatMap((c) => c.checks.flatMap((k) => k.rules as string[])));
export const ruleValue = rule;
