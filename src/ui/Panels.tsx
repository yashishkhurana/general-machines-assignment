// Presentation only: every figure here comes from compute() unchanged.
import { useState, type ReactNode } from 'react';
import type { CheckItem } from '../core/checklist';
import { lowRiseMargins } from '../core/checklist';
import type { Candidate, Results } from '../core/compute';
import { isTower, type Concept } from '../core/concepts';
import { planeRange } from '../core/envelope';
import { parseDecimal, refusedText } from '../core/format';
import { parkingAreaPerSpace } from '../core/metrics';
import { RULES, SUPPORTED_ZONES, rule, zoneFar, zoneOsr, type Rule, type Zone } from '../core/rules';
import type { RoadEdgeInput, Settings } from '../core/types';
import { BUILDINGS, META } from '../geo/data';
import type { FrontageEstimate } from '../geo/roadWidth';
import { ESRI_ATTR } from './MapView';
import type { AppState, Tool, ViewState } from './state';

export const n0 = (x: number) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—');
export const n1 = (x: number) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '—');
const trim = (x: number, d = 2) => String(+x.toFixed(d));
const pct = (x: number) => `${trim(x * 100, 1)}%`;

// ---- small controls --------------------------------------------------------------------------------

/** Number field with strict parsing: a value that doesn't parse shows a message and is not applied. */
function Num(p: { label: string; value: number; onChange: (v: number) => void; unit?: string; hint?: ReactNode; id: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <label className="field" htmlFor={p.id}>
      <span>{p.label}</span>
      <span className="inp">
        <input id={p.id} type="text" inputMode="decimal" aria-invalid={!!err} aria-describedby={err ? `${p.id}-err` : undefined}
          value={txt ?? (Number.isFinite(p.value) ? String(p.value) : '')}
          onChange={(e) => {
            setTxt(e.target.value);
            const r = parseDecimal(e.target.value);
            if (r.ok) { setErr(null); p.onChange(r.value); } else setErr(r.incomplete ? null : r.error);
          }}
          onBlur={() => { if (!err) setTxt(null); }} />
        {p.unit && <em>{p.unit}</em>}
      </span>
      {err ? <small id={`${p.id}-err`} className="field-err" role="status">{refusedText(err, p.value, p.unit)}</small> : p.hint ? <small>{p.hint}</small> : null}
    </label>
  );
}

type Slot = 'type' | 'plot' | 'zone' | 'road' | 'current' | 'planned' | null;

function Val({ id, open, setOpen, children, label }: { id: Exclude<Slot, null>; open: Slot; setOpen: (s: Slot) => void; children: ReactNode; label: string }) {
  return (
    <button type="button" className={`val${open === id ? ' on' : ''}`} aria-expanded={open === id} aria-label={label} onClick={() => setOpen(open === id ? null : id)}>
      {children}
    </button>
  );
}

// ---- left panel: the setup as a sentence ------------------------------------------------------------

export interface SetupProps {
  state: AppState; results: Results; estimates: (FrontageEstimate | null)[]; measured: number | null; tool: Tool;
  setTool: (t: Tool) => void; setRoads: (r: RoadEdgeInput[]) => void; setSettings: (s: Settings) => void; setZone: (z: Zone | null) => void; setView: (v: Partial<ViewState>) => void;
  openRules: (anchor: string) => void;
}

export function Setup(p: SetupProps) {
  const { state, results } = p;
  const s = state.settings;
  const set = (patch: Partial<Settings>) => p.setSettings({ ...s, ...patch, bonus: { ...s.bonus, ...(patch.bonus ?? {}) } });
  const [open, setOpen] = useState<Slot>(null);
  const site = results.site;
  const r0 = state.roads[0];
  const est = p.estimates[0];
  const roadName = est?.road?.properties['name:en'] ?? est?.road?.properties.name;
  const zoneShown = state.zoneOverride ?? (results.zone?.parts.map((x) => x.zone).join(' + ') || results.zone?.detected.map((x) => x.zone).join(' + ') || 'none found');
  const updRoad = (patch: Partial<RoadEdgeInput>) => p.setRoads(state.roads.map((x, j) => (j === 0 ? { ...x, ...patch } : x)));
  const aps = parkingAreaPerSpace(s);
  const widened = r0 && Math.abs(r0.width - r0.current) > 1e-9;

  const typeVal = <Val id="type" open={open} setOpen={setOpen} label="Building type: change">condo</Val>;

  return (
    <div className="setup">
      {state.ring.length < 3 ? (
        <p className="sentence">A {typeVal}. Draw a plot on the map to start.</p>
      ) : (
        <p className="sentence">
          A {typeVal} on a <Val id="plot" open={open} setOpen={setOpen} label="Plot area: change the plot">{site ? `${n0(site.netArea)} m²` : '—'}</Val> plot in zone{' '}
          <Val id="zone" open={open} setOpen={setOpen} label="Zone: change">{zoneShown}</Val>
          {r0 ? (
            <>, facing <Val id="road" open={open} setOpen={setOpen} label="Road: change the road edge">{roadName ?? `edge ${r0.edge + 1}`}</Val>
              {state.roads.length > 1 ? ` and ${state.roads.length - 1} more road${state.roads.length > 2 ? 's' : ''}` : ''}. The road is{' '}
              <Val id="current" open={open} setOpen={setOpen} label="Road width today: change">{Number.isFinite(r0.current) ? `${trim(r0.current, 2)} m` : '—'}</Val> wide today
              {widened ? <> and planned at <Val id="planned" open={open} setOpen={setOpen} label="Planned road width: change">{Number.isFinite(r0.width) ? `${trim(r0.width, 2)} m` : '—'}</Val></> : <>, with <Val id="planned" open={open} setOpen={setOpen} label="Planned road width: change">no widening planned</Val></>}.</>
          ) : (
            <>. <Val id="road" open={open} setOpen={setOpen} label="Pick the road edge">Pick the edge that faces the road</Val>.</>
          )}
        </p>
      )}

      {open === 'type' && (
        <div className="editor">
          <fieldset className="types">
            <legend>Building type</legend>
            <label className="check"><input type="radio" name="btype" value="condo" checked readOnly /> Condominium</label>
            <label className="check off"><input type="radio" name="btype" value="office" disabled aria-describedby="btype-office" /> Office</label>
            <small id="btype-office">Not modelled: ย.10 cl. 17 limits offices over 10,000 m² by location, and Reg. 7 sets a different parking rate.</small>
            <label className="check off"><input type="radio" name="btype" value="hotel" disabled aria-describedby="btype-hotel" /> Hotel</label>
            <small id="btype-hotel">Not modelled: ย.10 cl. 17 limits hotels over 80 rooms by location, the Hotel Act adds its own rules, and the cl. 53/54 bonuses may apply.</small>
          </fieldset>
        </div>
      )}
      {open === 'plot' && (
        <div className="editor">
          <p>Drag the corners on the map to change the plot, or draw a new one.</p>
          {site && site.stripArea > 0 && <p className="muted">{n0(site.grossArea)} m² drawn, less {n0(site.stripArea)} m² that the road widening takes (red on the map).</p>}
          <div className="row"><button type="button" onClick={() => { p.setTool('draw'); setOpen(null); }}>Draw a new plot</button></div>
        </div>
      )}
      {open === 'zone' && (
        <div className="editor">
          <label className="field" htmlFor="zone"><span>Zone</span>
            <select id="zone" value={state.zoneOverride ?? ''} onChange={(e) => p.setZone((e.target.value || null) as Zone | null)}>
              <option value="">From the zone map{results.zone?.detected.length ? ` (${results.zone.detected.map((d) => d.zone).join(' + ')})` : ''}</option>
              {SUPPORTED_ZONES.map((z) => <option key={z} value={z}>{z}: {zoneFar(z)} × plot area, {pct(zoneOsr(z))} open space</option>)}
            </select>
          </label>
          <p className="muted">Zone boundaries here are approximate, from a simplified copy of the 2556 plan map. Check the official BMA map.</p>
        </div>
      )}
      {open === 'road' && (
        <div className="editor">
          <p>Click the plot edge that faces the road. Click it again to remove it. A corner plot can have two.</p>
          <div className="row"><button type="button" onClick={() => p.setTool(p.tool === 'pickRoad' ? 'edit' : 'pickRoad')} aria-pressed={p.tool === 'pickRoad'}>{p.tool === 'pickRoad' ? 'Done' : 'Choose the road edge'}</button></div>
          {state.roads.length > 1 && <p className="muted">With two roads, the height limit takes the stricter road at every point.</p>}
        </div>
      )}
      {open === 'current' && r0 && (
        <div className="editor">
          <Num id="cur" label="Road width today" unit="m" value={r0.current} onChange={(v) => updRoad({ current: v })} />
          <ul className="estimates">
            {est?.lane.value != null && <li><span className="fig">At least {n1(est.lane.value)} m</span><small>lanes mapped in OpenStreetMap</small><button type="button" className="link" onClick={() => updRoad({ current: Math.round(est.lane.value! * 10) / 10 })}>Use</button></li>}
            {est?.gap?.value != null && <li><span className="fig">At most {n1(est.gap.value)} m</span><small>gap between buildings across the road</small><button type="button" className="link" onClick={() => updRoad({ current: Math.round(est.gap!.value! * 10) / 10 })}>Use</button></li>}
            {p.measured !== null && <li><span className="fig">{n1(p.measured)} m</span><small>your measurement</small><button type="button" className="link" onClick={() => updRoad({ current: Math.round(p.measured! * 10) / 10 })}>Use</button></li>}
          </ul>
          <div className="row"><button type="button" onClick={() => p.setTool(p.tool === 'measure' ? 'edit' : 'measure')} aria-pressed={p.tool === 'measure'}>{p.tool === 'measure' ? 'Stop measuring' : 'Measure it on the photo'}</button></div>
          <p className="muted">Estimates only; the legal width needs the land-office map or a survey. <button type="button" className="link" onClick={() => p.openRules('road-width')}>How they're made</button></p>
        </div>
      )}
      {open === 'planned' && r0 && (
        <div className="editor">
          <Num id="plan" label="Planned road width" unit="m" value={r0.width} onChange={(v) => updRoad({ width: v })} hint="Soi 39 is to be widened to 16 m (road ข 38 in the plan). Make it equal to today's width if no widening is planned." />
          <label className="field" htmlFor="heightTo"><span>Measure the height limit to</span>
            <select id="heightTo" value={s.heightTo} onChange={(e) => set({ heightTo: e.target.value as Settings['heightTo'] })}>
              <option value="current">The far side of the road as it is today</option>
              <option value="planned">The far side of the planned road (art. 36 ¶2)</option>
            </select>
          </label>
        </div>
      )}

      <div className="actions">
        <button type="button" className="primary" onClick={() => p.setTool('draw')} aria-pressed={p.tool === 'draw'}>Draw a new plot</button>
        <button type="button" onClick={() => { setOpen('road'); p.setTool(p.tool === 'pickRoad' ? 'edit' : 'pickRoad'); }} aria-pressed={p.tool === 'pickRoad'}>Change road edge</button>
      </div>

      <section>
        <h3>Extra floor area</h3>
        <p className="muted">Each adds floor area, up to 20% in total.</p>
        <Num id="aff" label="Affordable housing provided" unit="m²" value={s.bonus.affordableArea} onChange={(v) => set({ bonus: { ...s.bonus, affordableArea: v } })} hint="Adds up to 4 times this area." />
        <Num id="rain" label="Rainwater storage on site" unit="m³" value={s.bonus.rainwaterM3} onChange={(v) => set({ bonus: { ...s.bonus, rainwaterM3: v } })} hint="Adds 5% for every 1 m³ per 50 m² of land." />
        <label className="field" htmlFor="energy"><span>Energy-efficiency certificate</span>
          <select id="energy" value={s.bonus.energyLevel} onChange={(e) => set({ bonus: { ...s.bonus, energyLevel: Number(e.target.value) } })}>
            {[0, 1, 2, 3, 4].map((l) => <option key={l} value={l}>{l === 0 ? 'None' : `Level ${l}: adds ${l * 5}%`}</option>)}
          </select>
        </label>
        {results.far && results.far.bonusPct.applied > 0 && <p className="muted">Adding {pct(results.far.bonusPct.applied)}{results.far.bonusPct.clamped ? ` (capped from ${pct(results.far.bonusPct.requested)})` : ''}.</p>}
      </section>

      <details className="assume">
        <summary>Building assumptions</summary>
        <div className="two">
          <Num id="g" label="Ground floor height" unit="m" value={s.groundFloor} onChange={(v) => set({ groundFloor: v })} />
          <Num id="f" label="Other floors" unit="m" value={s.floorToFloor} onChange={(v) => set({ floorToFloor: v })} />
        </div>
        <Num id="aps" label="Parking area per car" unit="m²" value={s.parkingAreaPerSpace ?? Math.round(aps * 100) / 100} onChange={(v) => set({ parkingAreaPerSpace: Number.isFinite(v) && Math.abs(v - aps) > 1e-6 ? v : null })} hint="A 2.4 × 5 m bay plus half a 6 m aisle, and 40% for ramps and cores." />
        <div className="two">
          <Num id="avg" label="Average flat" unit="m²" value={s.avgUnitArea} onChange={(v) => set({ avgUnitArea: v })} />
          <Num id="mix" label="Flats over 60 m²" unit="%" value={Math.round(s.shareOver60 * 1000) / 10} onChange={(v) => set({ shareOver60: v / 100 })} />
        </div>
        <label className="check"><input type="checkbox" checked={s.roadContinuity} onChange={(e) => set({ roadContinuity: e.target.checked })} /> The road runs at this width through to another public road</label>
      </details>

      <details className="assume">
        <summary>Map</summary>
        <label className="check"><input type="checkbox" checked={state.view.envelope !== 'none'} onChange={(e) => p.setView({ envelope: e.target.checked ? (state.view.concept === 'B' ? 'lowRise' : 'highRise') : 'none' })} /> Show the permitted shape</label>
        <label className="check"><input type="checkbox" checked={state.view.satellite} onChange={(e) => p.setView({ satellite: e.target.checked })} /> Satellite photo</label>
        <label className="check"><input type="checkbox" checked={state.view.buildings} onChange={(e) => p.setView({ buildings: e.target.checked })} /> Neighbouring buildings</label>
        <label className="check"><input type="checkbox" checked={state.view.zones} onChange={(e) => p.setView({ zones: e.target.checked })} /> Zone boundaries</label>
        <label className="check"><input type="checkbox" checked={state.view.rays} onChange={(e) => p.setView({ rays: e.target.checked })} /> Road-width gap lines</label>
      </details>

      <p className="foot">Built on the Bangkok Comprehensive Plan B.E. 2556. A feasibility sketch, not a permit check. <button type="button" className="link" onClick={() => p.openRules('limits')}>What this tool leaves out</button></p>
    </div>
  );
}

// ---- right panel: verdict first --------------------------------------------------------------------

function verdict(c: Concept, permitted: number): { title: string; why: string } {
  const b = c.binding;
  if (!c.ok) return { title: isTower(c) ? 'No tower fits here' : 'No low-rise block fits here', why: c.reason ?? '' };
  if (isTower(c)) {
    const title = `A ${c.storeys}-storey tower fits here${c.basements ? `, over ${c.basements} basement${c.basements > 1 ? 's' : ''}` : ''}`;
    let why = `It uses ${n0(c.total)} m² of the ${n0(permitted)} m² this plot allows.`;
    if (/permitted floor area/.test(b)) why += ' Floor area is what stops it: one more floor would go over the limit. The height limit from the road shapes the top.';
    else if (/Reg\. 33 cl\. 2 cap/.test(b)) why += ' It stops at the 30,000 m² cap for roads under 18 m.';
    else if (/Reg\. 33 cl\. 5/.test(b)) why += ' It stops at 10 times the plot area, the cap for tall buildings.';
    else if (/height plane/.test(b)) why += ' The height limit from the road stops it going higher.';
    else if (/open space/.test(b)) why += ' Open space stops it: a bigger tower would leave too little open ground.';
    else if (/parking/.test(b)) why += ' Parking stops it: there is no room for the spaces another floor would need.';
    return { title, why };
  }
  const title = `A ${c.storeys}-storey block fits here${c.basements ? `, over ${c.basements} basement${c.basements > 1 ? 's' : ''}` : ''}`;
  const parts: string[] = [];
  if (/roof deck at most 15 m/.test(b)) parts.push(`It stops at ${c.storeys} floors to keep the roof deck at or under 15 m, so 1 m of clear space is enough beside the windowless side walls.`);
  else if (/roof deck under 23 m/.test(b)) parts.push(`It stops at ${c.storeys} floors to stay under 23 m, the line for a high-rise.`);
  else if (/height plane/.test(b)) parts.push('The height limit from the road stops it going higher.');
  if (/under 10,000/.test(b)) parts.push('The floor plate is sized to keep the total under 10,000 m², basements included, so it stays a low-rise building.');
  else if (/parking/.test(b)) parts.push('The floor plate is sized so the basements can hold the parking it needs.');
  else if (/open space/.test(b)) parts.push('The floor plate is as large as the open-space rules allow.');
  else if (/permitted floor area/.test(b)) parts.push('The floor plate is sized to the floor area the plot allows.');
  return { title, why: parts.join(' ') };
}

function Bar({ label, value, frac, note, tone }: { label: string; value: string; frac: number; note: ReactNode; tone: 'res' | 'env' | 'open' }) {
  return (
    <div className="bar">
      <div className="bar-head"><span>{label}</span><b className="fig">{value}</b></div>
      <div className="bar-track" aria-hidden="true"><div className={`bar-fill ${tone}`} style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} /></div>
      <div className="bar-note">{note}</div>
    </div>
  );
}

function firstSteppedFloor(c: Concept) {
  const above = c.floors.filter((f) => !f.level.startsWith('B'));
  if (!above.length) return null;
  const base = above[0].area;
  return above.find((f) => f.area < base - 1)?.level ?? null;
}

export function Limits({ c, results }: { c: Concept; results: Results }) {
  const far = results.far!, site = results.site!;
  const zone = results.zone?.parts.map((p) => p.zone).join(' + ') ?? '';
  const os = c.openSpace;
  const bonus = far.bonusPct.applied;
  const tower = isTower(c);
  const step = firstSteppedFloor(c);
  const top = os.groundPlate.length ? planeRange(site, os.groundPlate) : null;
  const m = lowRiseMargins(c);
  const fragile = m.area / rule('class.extralarge.area') < rule('class.extralarge.margin');
  const cap = tower ? far.permitted : Math.min(far.permitted, rule('class.extralarge.area'));
  const osNote = os.req.binding === 'plan'
    ? `${pct(far.osrWeighted)} of the floor area, which is more than the ${n0(os.req.ord52)} m² the 30% rule asks for.`
    : os.req.binding === 'reg55' ? '30% of the largest floor.' : '30% of the plot, which is more than the plan\'s share of floor area.';
  const alt = results.plane && Math.abs(results.plane.atHighRiseFrontAlt - results.plane.atHighRiseFront) > 0.05
    ? ` Measured to the far side of the road ${results.plane.heightTo === 'current' ? 'as it is today; to the planned road it would be' : 'as planned; to the road as it is today it would be'} ${n1(results.plane.atHighRiseFrontAlt)} m.` : '';
  return (
    <div className="limits">
      <Bar label="Floor area" value={`${n0(c.total)} of ${n0(cap)} m²`} frac={c.total / cap} tone="res"
        note={tower
          ? <>{trim(far.baseRatio, 2)} times the plot area is allowed in {zone}{bonus ? `, plus ${pct(bonus)} in bonuses` : ''}.</>
          : <>A low-rise building must stay under 10,000 m², basements included. <span className={fragile ? 'amber' : ''}>{n0(m.area)} m² to spare{fragile ? ': a small survey difference would tip it over.' : '.'}</span></>} />
      {tower ? (
        <Bar label="Height" value={`${n1(c.roofDeck)} m to the roof`} frac={top ? c.roofDeck / top.max : 0} tone="env"
          note={<>The limit is {n1(results.plane!.atHighRiseFront)} m at the front line and rises 2 m for every metre back{step ? `, so floors step back from floor ${step}` : ''}.{alt}</>} />
      ) : c.kind === 'low-rise blank' ? (
        <Bar label="Height" value={`${n1(c.roofDeck)} of 15 m`} frac={c.roofDeck / rule('clear.height')} tone="env"
          note={<>Blank side walls need only 1 m clear while the roof deck stays at or under 15 m: {n1(rule('clear.height') - c.roofDeck)} m to spare.</>} />
      ) : (
        <Bar label="Height" value={`${n1(c.roofDeck)} of 23 m`} frac={c.roofDeck / rule('class.highrise.height')} tone="env"
          note={<>Under 23 m to the roof keeps it a low-rise building: {n1(m.height)} m to spare.</>} />
      )}
      <Bar label="Open space" value={`${n0(os.req.governing)} m² needed, ${n0(os.provided)} m² left`} frac={os.req.governing / Math.max(1, os.provided)} tone="open"
        note={<>{osNote} Half of it, {n0(os.req.plantedB)} m², must be planted ground{tower ? ' outside the 6 m fire road' : ''}; {n0(os.plantedCapacity)} m² is available.</>} />
    </div>
  );
}

// plain-language checks
const PLAIN: Record<string, (k: CheckItem) => { title: string; detail: string }> = {
  far: (k) => ({ title: k.status === 'pass' ? 'Floor area is within the limit' : 'Floor area is over the limit', detail: `${k.provided.replace(' (parking', ', parking').replace(' included)', ' included')}, against ${k.required.replace('≤ ', '')} allowed.` }),
  access: (k) => ({ title: k.status === 'pass' ? 'The road is wide enough for a tower' : 'The road is too narrow for a tower', detail: k.status === 'pass' ? `${k.provided}. A tower needs a 12 m frontage on a road at least 10 m wide.` : k.provided }),
  access18: (k) => ({ title: 'Over 30,000 m² needs an 18 m road', detail: `${k.provided} today.` }),
  fireStrip: () => ({ title: 'A 12 m way in for fire engines', detail: 'The frontage stays open up to the building.' }),
  setback6: () => ({ title: '6 m clear from every boundary', detail: 'Above and below ground, measured from the planned road line.' }),
  fireRing: () => ({ title: 'A 6 m fire road all round', detail: 'Kept clear and paved at ground level.' }),
  lowrise: (k) => ({ title: k.status === 'pass' ? 'Stays a low-rise building' : 'Would no longer be low-rise', detail: `${k.provided}: under 23 m to the roof and under 10,000 m² in total.` }),
  xlMargin: (k) => ({ title: k.status === 'pass' ? 'Comfortably under the low-rise limits' : 'Very close to the 10,000 m² line', detail: k.provided.replace(': fragile, a survey difference of a fraction of a percent tips it over', '. A small survey difference would make it extra-large.') }),
  front: (k) => ({ title: 'Set back from the road', detail: `${k.required.replace(' (max of cl. 50 and cl. 55)', '')} from the planned road line.` }),
  side: (k) => (k.label.startsWith('Walls with openings (road and rear')
    ? { title: 'Set back from the rear neighbour', detail: `${k.required} from the rear boundary, where the windows are.` }
    : { title: 'Set back from the neighbours', detail: `${k.required} from the side and rear boundaries, assuming windows on every side.` }),
  blankSides: (k) => ({ title: 'Side walls without windows', detail: `A design condition: windows only on the road and rear faces. ${k.provided.replace('; a design condition, not checked', '')} (1 m is enough up to a 15 m roof deck).` }),
  plane: () => ({ title: 'Fits under the height limit', detail: 'Every floor and its parapet stay under the sloped limit from the road.' }),
  roofPlant: (k) => ({ title: k.status === 'pass' ? 'Room for the lift overrun on the roof' : 'No room for the lift overrun on the roof', detail: k.status === 'pass' ? 'A 4 m lift and stair head fits under the height limit.' : 'Move the plant back or drop a floor.' }),
  plantedB: (k) => ({ title: k.status === 'pass' ? 'Enough planted ground' : 'Not enough planted ground', detail: `${k.required} needed, ${k.provided.replace(' available', '')} available.` }),
  plantedC: (k) => ({ title: k.status === 'pass' ? 'Planted ground also meets the stricter reading' : 'Planted ground is short on the stricter reading', detail: `Half of all the open space left would be ${k.required}.` }),
  parking: (k) => ({ title: k.status === 'pass' ? 'Parking fits' : 'Not enough parking', detail: `${k.provided.split(' at ')[0]} for ${k.required.split(' (')[0]} needed.` }),
  face: (k) => ({ title: k.status === 'pass' ? 'Faces the road' : 'Not enough of the building faces the road', detail: `${k.provided} of wall faces the road within 20 m; more than ${k.required.replace('> ', '')} is needed.` }),
  f2f: () => ({ title: 'Floor heights meet the minimum', detail: 'At least 2.60 m floor to floor.' }),
  unit: () => ({ title: 'Flats meet the minimum size', detail: 'At least 20 m² each.' }),
  eia: (k) => ({ title: 'Environmental review', detail: `${k.provided}. A flag only.` }),
};
const plainOf = (k: CheckItem) => {
  if (k.id.startsWith('os')) return { title: `Open space: ${k.label.replace('Open space: ', '').replace(' (binding)', '').replace(/^\w/, (x) => x.toLowerCase())}`, detail: `${k.required} needed, ${k.provided} left open.` };
  return (PLAIN[k.id] ?? ((x: CheckItem) => ({ title: x.label, detail: `${x.required} / ${x.provided}` })))(k);
};

const ORDER: Record<CheckItem['status'], number> = { fail: 0, warn: 1, pass: 2, info: 3 };

function Icon({ status }: { status: CheckItem['status'] }) {
  if (status === 'pass') return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="ico"><circle cx="9" cy="9" r="9" fill="var(--pass)" /><path d="M5 9.5l3 3 5.5-6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (status === 'fail') return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="ico"><circle cx="9" cy="9" r="9" fill="var(--fail)" /><path d="M6 6l6 6M12 6l-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>;
  if (status === 'warn') return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="ico"><circle cx="9" cy="9" r="9" fill="var(--warn)" /><path d="M9 5v5M9 13v.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>;
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="ico"><circle cx="9" cy="9" r="8" fill="none" stroke="var(--muted)" strokeWidth="1.5" /><path d="M9 8v5M9 5.5v.5" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

const STATUS_WORD: Record<CheckItem['status'], string> = { pass: 'Pass', fail: 'Fail', warn: 'Check', info: 'Note' };

export function Checks({ items, roadNote, openRules }: { items: CheckItem[]; roadNote: { text: string } | null; openRules: (anchor: string) => void }) {
  const [all, setAll] = useState(false);
  const sorted = [...items].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const main = sorted.filter((k) => k.status !== 'info' && !(k.id.startsWith('os') && k.status === 'pass'));
  const rest = sorted.filter((k) => !main.includes(k));
  const fails = items.filter((k) => k.status === 'fail').length;
  const row = (k: CheckItem) => {
    const t = plainOf(k);
    return (
      <li key={k.id} className={k.status}>
        <Icon status={k.status} /><span className="sr">{STATUS_WORD[k.status]}: </span>
        <div className="ck"><b>{t.title}</b><span>{t.detail}</span></div>
        <button type="button" className="link clause" onClick={() => openRules(k.rules[0] ?? '')}>{k.clause.split(';')[0].replace(/ \((reading b|reading c, warning only|assumed allowance|old English translation only)\)/, '')}</button>
      </li>
    );
  };
  return (
    <div className="checks">
      <div className="checks-head"><h2>Checks</h2><span className={fails ? 'bad' : 'good'}>{fails ? `${fails} fail${fails > 1 ? 's' : ''}` : 'All pass'}</span></div>
      <ul>
        {roadNote && (
          <li className="warn"><Icon status="warn" /><span className="sr">Check: </span><div className="ck"><b>Road width is an estimate</b><span>{roadNote.text}</span></div><button type="button" className="link clause" onClick={() => openRules('road-width')}>How it's measured</button></li>
        )}
        {main.map(row)}
        {all && rest.map(row)}
      </ul>
      {rest.length > 0 && <button type="button" className="link more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show ${rest.length} more`}</button>}
    </div>
  );
}

export function Floors({ c }: { c: Concept }) {
  const order = [...c.floors].reverse();
  return (
    <details className="floors-d">
      <summary>Floor by floor</summary>
      <table className="floors">
        <thead><tr><th>Floor</th><th>Use</th><th className="r">Area m²</th><th className="r">Cars</th><th className="r">Total m²</th></tr></thead>
        <tbody>{order.map((f) => (
          <tr key={f.level} className={f.use === 'residential' ? '' : 'park'}><td>{f.level}</td><td>{f.use === 'residential' ? 'Flats' : f.use === 'parking' ? 'Parking' : 'Basement parking'}</td><td className="r fig">{n0(f.area)}</td><td className="r fig">{f.spaces || ''}</td><td className="r fig">{n0(f.running)}</td></tr>
        ))}</tbody>
      </table>
    </details>
  );
}

export function ConceptSwitch({ results, value, onChange }: { results: Results; value: 'A' | 'B'; onChange: (v: 'A' | 'B') => void }) {
  return (
    <div className="switch" role="group" aria-label="Design option">
      {results.concepts.map(({ concept: c, title, fit, passes }) => (
        <button key={c.id} type="button" aria-pressed={value === c.id} className={value === c.id ? 'on' : ''} onClick={() => onChange(c.id)}>
          <b>{c.id}. {title}</b>
          <span className="fig">{c.ok ? `${c.storeys} floors${c.basements ? ` over ${c.basements} basement${c.basements > 1 ? 's' : ''}` : ''}, ${n0(c.residential)} m² of flats` : 'Does not fit'}</span>
          <small className="fit">{passes ? fit : 'Shown because fewer than two options pass every check.'}</small>
        </button>
      ))}
    </div>
  );
}

/** One line on why a candidate isn't one of the two shown. */
function consideredWhy(k: Candidate, results: Results): string {
  if (k.skipped) return `Not possible here: ${k.skipped}`;
  const c = k.concept!;
  if (!c.ok) return `Does not fit: ${c.reason ?? 'no floor fits.'}`;
  const fails = k.checks.filter((x) => x.status === 'fail');
  if (fails.length) return `Fails: ${fails.map((x) => plainOf(x).title.replace(/^\w/, (ch) => ch.toLowerCase())).join('; ')}.`;
  const last = results.concepts[results.concepts.length - 1];
  const d = last.concept.residential - c.residential;
  if (d > 0.5) return `${n0(d)} m² less floor area for flats than ${last.concept.id}.`;
  const g = last.concept.openSpace.plantedCapacity - c.openSpace.plantedCapacity;
  if (g > 0.5) return `About the same floor area for flats as ${last.concept.id}, with ${n0(g)} m² less planted ground.`;
  return `Ties with ${last.concept.id}; listed after it.`;
}

export function AlsoConsidered({ results }: { results: Results }) {
  if (!results.considered.length) return null;
  return (
    <div className="considered">
      <h2>Also considered</h2>
      <ul>
        {results.considered.map((k) => (
          <li key={k.key}>
            <div className="considered-head"><b>{k.title}</b><span className="fig">{k.concept?.ok ? `${n0(k.concept.residential)} m² of flats` : '—'}</span></div>
            <span>{consideredWhy(k, results)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Verdict({ results, which }: { results: Results; which: 'A' | 'B' }) {
  const err = results.messages.find((m) => m.level === 'error');
  if (!err && results.noFit) {
    return (<div className="verdict"><h1>No condo fits this plot.</h1><p>{results.noFit.reason}</p>{results.noFit.suggestion && <p className="muted">{results.noFit.suggestion}</p>}</div>);
  }
  if (err || !results.far || !results.concepts.length) {
    const unsupported = results.zone && ['unsupported', 'none'].includes(results.zone.status);
    return (<div className="verdict"><h1>{unsupported ? 'Zone not supported' : 'No result yet'}</h1><p>{err?.text ?? 'Draw a plot and pick its road edge.'}</p></div>);
  }
  const c = results.concepts.find((x) => x.concept.id === which)?.concept ?? results.concepts[0].concept;
  const v = verdict(c, results.far.permitted);
  return (<div className="verdict"><h1>{v.title}</h1><p>{v.why}</p></div>);
}

export function Notices({ results }: { results: Results }) {
  const ms = results.messages.filter((m) => m.level === 'warn');
  if (!ms.length) return null;
  return <ul className="notices">{ms.map((m, i) => <li key={i}>{m.text}</li>)}</ul>;
}

// ---- Rules view -------------------------------------------------------------------------------------

export function RulesView({ results, estimates, onBack, focus }: { results: Results; estimates: (FrontageEstimate | null)[]; onBack: () => void; focus: string | null }) {
  const all = Object.values(RULES) as Rule[];
  const groups: [string, (r: Rule) => boolean][] = [
    ['City plan', (r) => r.clause.startsWith('Plan')],
    ['Building law', (r) => /Reg\.|Ordinance/.test(r.clause) && r.source !== 'assumed'],
    ['Tool assumptions', (r) => r.source === 'assumed'],
  ];
  const est = estimates[0];
  const counts = BUILDINGS.features.reduce<Record<string, number>>((a, b) => { const k = b.properties.src === 'height' || b.properties.src === 'levels' ? 'osm' : b.properties.src; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const notes = results.messages.filter((m) => m.level === 'info');
  return (
    <div className="rulesview">
      <button type="button" className="back" onClick={onBack}>← Back to the result</button>
      <h1>Rules and sources</h1>
      <p className="muted">Every rule was read through a third-party copy. <b>gazette</b>: the Thai text in the Association of Siamese Architects' PDF copies (the plan, the Ordinance, and consolidated texts of Reg. 33 and Reg. 55). <b>Reg. translation</b>: only an old English translation (IIBH). The parking rules (Reg. 7, Reg. 41) are the only ones resting on that translation alone. <b>assumed</b>: this tool's own assumption.</p>
      {groups.map(([g, f]) => (
        <section key={g}>
          <h2>{g}</h2>
          <table className="rules">
            <tbody>{all.filter(f).map((r) => (
              <tr key={r.id} id={`rule-${r.id}`} className={focus === r.id ? 'focus' : ''}>
                <td>{r.label}{r.note ? <small className="muted">{r.note}</small> : null}</td>
                <td className="fig r">{+r.value.toFixed(4)} {r.unit}</td>
                <td>{r.clause}<br /><span className={`src ${r.source.replace(/\W/g, '')}`}>{r.source}</span>{r.verified === false ? <span className="src unverified">unverified</span> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ))}
      <section id="road-width" className={focus === 'road-width' ? 'focus' : ''}>
        <h2>How the road width is estimated</h2>
        <p>OpenStreetMap has no width for Soi 39, so the tool gives three estimates of the width today:</p>
        <ul>
          <li><b>Lower bound</b>: the number of lanes × 3.25 m, plus 1.5 m per mapped pavement. {est?.lane.text ? `Here: ${est.lane.text}.` : ''}</li>
          <li><b>Upper bound</b>: lines are drawn across the road every 2 m along the plot's frontage, and the gap to the first building on each side is measured. Buildings sit back from the road edge, so the road is no wider than the narrowest gap. {est?.gap?.value != null ? `Here ${est.gap.rays} of ${est.gap.total} lines hit a building on both sides; the narrowest gap is ${n1(est.gap.value)} m and the median ${n1(est.gap.median ?? NaN)} m.` : ''}</li>
          <li><b>Your measurement</b>: click both edges of the road on the satellite photo.</li>
        </ul>
        <p className="muted">None of these is the legal width; that needs the land-office parcel map or a survey. Turn on "Road-width gap lines" under Map to see the lines.</p>
      </section>
      <section id="heights">
        <h2>Neighbouring building heights</h2>
        <p>{counts.osm ?? 0} of the {n0(META.osm.buildings)} buildings around the site ({META.osm.sharePctEither}%) have a height in OpenStreetMap. {counts.listing ?? 0} are set from a sourced listing and {counts.visual ?? 0} from a visual estimate; the other {counts.assumed ?? 0} are drawn at an assumed 6 m. Hover over a building to see its source. Data extracted {META.extracted}.</p>
      </section>
      <section id="limits" className={focus === 'limits' ? 'focus' : ''}>
        <h2>What the tool leaves out</h2>
        <ul>
          <li>Condominiums only, in zones ย.8–ย.10. Hotels and offices are not modelled.</li>
          <li>Bonuses for public open space and public parking (arts. 53, 54) are not offered: both are for public buildings.</li>
          <li>On corner plots the height limit takes the stricter road at every point; it doesn't claim the wider-road allowance (Reg. 55 cl. 45–46).</li>
          <li>Zone boundaries are approximate. A plot across two zones is split by the tool's own rule, not by a clause.</li>
          <li>Canal and river setbacks (Reg. 55 cl. 42) are not modelled, and waterways aren't mapped in the tool: a plot that falls outside every zone may be over a khlong. Road continuity is a tick-box.</li>
          <li>The low-rise generator keeps one plate size for every floor rather than redesigning floor by floor.</li>
          <li>The environmental-review trigger is a flag only; its wording is unverified.</li>
          <li>The parking rules rest only on an old English translation of Reg. 7 and Reg. 41.</li>
          <li>Each edit replaces the current browser history entry rather than adding one, so Back leaves the tool. Use Copy link to keep a case.</li>
        </ul>
      </section>
      {notes.length > 0 && <section><h2>Notes on this plot</h2><ul>{notes.map((m, i) => <li key={i}>{m.text}</li>)}</ul></section>}
      <Credits satellite={false} />
    </div>
  );
}

export function Credits({ satellite }: { satellite: boolean }) {
  return (
    <footer className="credits">
      Map data © OpenStreetMap contributors (ODbL), extract of {META.extracted}. Basemap: OpenFreeMap. Zones: extraction by Kanesuan/KNS.MAP of the B.E. 2556 Bangkok Comprehensive Plan map; approximate boundaries, verify against BMA. {satellite ? ESRI_ATTR + '.' : ''} Not legal advice.
    </footer>
  );
}

export function ToolHint({ tool, measure }: { tool: Tool; measure: number | null }) {
  const t: Partial<Record<Tool, string>> = {
    draw: 'Click to add corners. Double-click, press Enter or click the first corner to finish. Esc cancels.',
    pickRoad: 'Click the plot edge that faces the road.',
    measure: measure !== null ? `${n1(measure)} m. Click again to measure another line.` : 'Click one edge of the road, then the other.',
  };
  if (!t[tool]) return null;
  return <div className="hint" role="status">{t[tool]}</div>;
}
