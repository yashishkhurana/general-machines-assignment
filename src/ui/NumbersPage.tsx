// Milestone page: the rules table and the §8 fixture results, before any map work.
import { compute } from '../core/compute';
import { RULES } from '../core/rules';
import { DEFAULT_SETTINGS } from '../core/types';

const fixture = compute({
  plot: [[0, 0], [40, 0], [40, 50], [0, 50]],
  roads: [{ edge: 0, width: 16, current: 16 }],
  zones: [{ zone: 'ย.10', poly: [[[[-999, -999], [999, -999], [999, 999], [-999, 999], [-999, -999]]]] }],
  zoneOverride: null,
  settings: DEFAULT_SETTINGS,
});

export function NumbersPage() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <h1>Bangkok plot envelope: numbers milestone</h1>
      <p>Fixture: 40 × 50 m, 40 m side on a 16 m road, ย.10. The map comes next.</p>
      {fixture.concepts.map(({ concept: c, checks }) => (
        <section key={c.id}>
          <h2>Concept {c.id}: {c.title}</h2>
          <p>{c.storeys} floors{c.basements ? ` + ${c.basements} basements` : ''}, {c.total.toFixed(0)} m² total, {c.parking.needed} spaces needed, {c.parking.provided} provided. Stopped by: {c.binding}.</p>
          <ul>{checks.map((k) => <li key={k.id}>[{k.status}] {k.label}: {k.required} / {k.provided} ({k.clause})</li>)}</ul>
        </section>
      ))}
      <h2>Rules table</h2>
      <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr><th align="left">Rule</th><th align="right">Value</th><th align="left">Clause</th><th align="left">Source</th></tr></thead>
        <tbody>{Object.values(RULES).map((r) => (
          <tr key={r.id}><td>{r.label}</td><td align="right">{+r.value.toFixed(4)} {r.unit}</td><td>{r.clause}</td><td>{r.source}{'verified' in r && r.verified === false ? ' [unverified]' : ''}</td></tr>
        ))}</tbody>
      </table>
    </main>
  );
}
