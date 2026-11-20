// Fixes from the headless break-test run of the live site (items 1–6).
import { describe, expect, it } from 'vitest';
import { availability } from '../src/core/classify';
import { compute } from '../src/core/compute';
import { fmtVs, parseDecimal, refusedText } from '../src/core/format';
import type { Ring } from '../src/core/geom';
import { buildSite } from '../src/core/site';
import { DEFAULT_SETTINGS, type Settings, type SiteInput, type ZonePoly } from '../src/core/types';
import { encodeState, exampleState, isExample, readLink } from '../src/ui/state';
import { createUrlWriter } from '../src/ui/urlWriter';

const RECT: Ring = [[0, 0], [40, 0], [40, 50], [0, 50]];
const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...o, bonus: { ...DEFAULT_SETTINGS.bonus, ...(o.bonus ?? {}) } });
const all = (zone: string): ZonePoly[] => [{ zone, poly: [[[[-999, -999], [999, -999], [999, 999], [-999, 999], [-999, -999]]]] }];
const input = (o: Partial<SiteInput> = {}): SiteInput => ({ plot: RECT, roads: [{ edge: 0, width: 16, current: 16 }], zones: all('ย.10'), zoneOverride: null, settings: S(), ...o });

describe('1. "Reset to example" follows every input, not just the plot', () => {
  it('the example is the example', () => expect(isExample(exampleState())).toBe(true));
  it('a changed setting with the same plot is not the example', () => {
    const s = exampleState();
    expect(isExample({ ...s, settings: { ...s.settings, floorToFloor: 3.5 } })).toBe(false);
    expect(isExample({ ...s, settings: { ...s.settings, bonus: { ...s.settings.bonus, energyLevel: 2 } } })).toBe(false);
    expect(isExample({ ...s, settings: { ...s.settings, heightTo: 'planned' } })).toBe(false);
  });
  it('a changed road width or zone override is not the example; the view alone is', () => {
    const s = exampleState();
    expect(isExample({ ...s, roads: [{ ...s.roads[0], current: 12 }] })).toBe(false);
    expect(isExample({ ...s, zoneOverride: 'ย.9' })).toBe(false);
    expect(isExample({ ...s, view: { ...s.view, satellite: true, concept: 'B' } })).toBe(true);
  });
  it('the example survives a share-link round trip (so a shared example still counts as one)', () => {
    const r = readLink('#' + encodeState(exampleState()));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(isExample(r.state)).toBe(true);
  });
});

describe('2. displayed rounding never contradicts the comparison', () => {
  it('fmtVs adds decimals until the shown value is on the right side', () => {
    expect(fmtVs(9.99, 10)).toBe('9.99');
    expect(fmtVs(9.96, 10)).toBe('9.96');
    expect(fmtVs(10.04, 10)).toBe('10.04');
    expect(fmtVs(9.5, 10)).toBe('9.5');
    expect(fmtVs(99.6, 100, 0)).toBe('99.6');
    expect(fmtVs(10, 10)).toBe('10.0');
  });
  it('a 9.99 m road reads "9.99 m … under 10 m", not "10.0 m is under 10 m"', () => {
    const a = availability(buildSite(RECT, [{ edge: 0, width: 16, current: 9.99 }]), S());
    expect(a.highRise).toBe(false);
    expect(a.reasons.join(' ')).toContain('9.99 m (current) is under 10 m');
    expect(a.reasons.join(' ')).not.toContain('10.0 m');
  });
  it('an 11.96 m frontage reads "11.96 m is under 12 m"', () => {
    const r = compute(input({ plot: [[0, 0], [11.96, 0], [11.96, 60], [0, 60]] }));
    const m = r.messages.find((x) => x.code === 'shortFrontage')!;
    expect(m.text).toContain('11.96 m is under 12 m');
  });
});

describe('3. values under a legal minimum stop the result', () => {
  it('floor-to-floor 2.5 m (under 2.60 m, Reg. 55 cl. 22) gives no result', () => {
    const r = compute(input({ settings: S({ floorToFloor: 2.5 }) }));
    expect(r.ok).toBe(false);
    expect(r.messages.find((m) => m.code === 'f2f')?.level).toBe('error');
  });
  it('a 2.59 m ground floor also stops it, and says 2.59, not 2.6', () => {
    const r = compute(input({ settings: S({ groundFloor: 2.59 }) }));
    expect(r.ok).toBe(false);
    expect(r.messages.find((m) => m.code === 'f2f')!.text).toContain('2.59 m');
  });
  it('an average flat under 20 m² (Reg. 55 cl. 19) gives no result', () => {
    const r = compute(input({ settings: S({ avgUnitArea: 15 }) }));
    expect(r.ok).toBe(false);
    expect(r.messages.find((m) => m.code === 'unit')?.level).toBe('error');
  });
  it('exactly at the minimum is fine', () => expect(compute(input({ settings: S({ floorToFloor: 2.6, groundFloor: 2.6 }) })).ok).toBe(true));
});

describe('4. share links that fail to decode are reported', () => {
  const good = '#' + encodeState(exampleState());
  it('no link: none; a good link: ok', () => {
    expect(readLink('').status).toBe('none');
    expect(readLink(good).status).toBe('ok');
  });
  it('truncated, garbage, non-numeric corners and too few corners: invalid', () => {
    expect(readLink(good.slice(0, 60)).status).toBe('invalid');
    expect(readLink('#c=%%%garbage').status).toBe('invalid');
    expect(readLink('#c=' + encodeURIComponent(JSON.stringify({ p: [100.57, 'x', 100.571, 13.73, 100.572, 13.735] }))).status).toBe('invalid');
    expect(readLink('#c=' + encodeURIComponent(JSON.stringify({ p: [100.57, 13.73, 100.571, 13.73] }))).status).toBe('invalid');
    expect(readLink('#c=' + encodeURIComponent(JSON.stringify({ p: [100.57, 13.73, 100.571, 13.73, 100.572, 13.735], e: [[0, 'wide', 10]] }))).status).toBe('invalid');
  });
});

describe('5. strict decimal parsing', () => {
  const ok = (s: string, v: number) => expect(parseDecimal(s)).toEqual({ ok: true, value: v });
  const bad = (s: string, msg: RegExp) => { const r = parseDecimal(s); expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(msg); };
  it('accepts plain numbers and a single decimal comma', () => {
    ok('12', 12); ok('12.5', 12.5); ok(' 3.25 ', 3.25); ok('-3', -3); ok('12,5', 12.5); ok('0,25', 0.25);
  });
  it('rejects hex and exponent forms', () => {
    bad('0x10', /Hexadecimal/); bad('1e3', /exponent/); bad('2E-1', /exponent/);
  });
  it('rejects thousands separators with a message', () => {
    bad('1,000', /thousands/); bad('12,345.6', /thousands/); bad('1 000', /thousands/);
  });
  it('rejects other junk; empty is flagged separately', () => {
    bad('12..5', /Not a number/); bad('abc', /Not a number/); bad('1.2.3', /Not a number/);
    const e = parseDecimal('  ');
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.empty).toBe(true);
  });
});

describe('6. plots mostly outside any zone polygon', () => {
  it('a plot with only 4% inside a zone says 96% is outside any zone, and mentions canals', () => {
    // zone covers only the strip y < 2 of the 50 m deep plot (2/50 = 4%)
    const zones: ZonePoly[] = [{ zone: 'ย.10', poly: [[[[-10, -10], [50, -10], [50, 2], [-10, 2], [-10, -10]]]] }];
    const r = compute(input({ zones }));
    expect(r.ok).toBe(false);
    const m = r.messages.find((x) => x.code === 'zoneMostlyNone')!;
    expect(m.text).toContain('96% of the plot is outside any zone');
    expect(m.text).toMatch(/canal/);
  });
  it('a plot with no zone at all says 100%', () => {
    const r = compute(input({ zones: [] }));
    expect(r.messages.find((x) => x.code === 'zoneNone')!.text).toContain('100% of the plot is outside any zone');
  });
  it('a small gap (10%) still computes, with the canal caveat', () => {
    const zones: ZonePoly[] = [{ zone: 'ย.10', poly: [[[[-10, -10], [50, -10], [50, 45], [-10, 45], [-10, -10]]]] }];
    const r = compute(input({ zones }));
    expect(r.ok).toBe(true);
    expect(r.messages.find((x) => x.code === 'zoneGap')!.text).toMatch(/canal/);
  });
});

describe('refresh right after an edit keeps it (share link written at once)', () => {
  const setup = () => {
    let t = 0;
    const writes: string[] = [];
    const timers: { at: number; fn: () => void }[] = [];
    const w = createUrlWriter({ write: (h) => writes.push(h), now: () => t, setTimer: (fn, ms) => { const x = { at: t + ms, fn }; timers.push(x); return x; }, clearTimer: (x) => { const i = timers.indexOf(x as never); if (i >= 0) timers.splice(i, 1); } });
    const advance = (ms: number) => { t += ms; for (const x of [...timers].filter((y) => y.at <= t)) { timers.splice(timers.indexOf(x), 1); x.fn(); } };
    return { w, writes, advance };
  };
  it('a typed value is in the URL immediately, before any timer runs (a reload reads it)', () => {
    const { w, writes } = setup();
    w.update('#a');
    w.update('#c=road-9');
    w.update('#c=road-9.5');
    expect(writes[writes.length - 1]).toBe('#c=road-9.5');
    expect(w.pending).toBe(false);
  });
  it('a corner drag is throttled, but the latest position is written on the trailing edge and on flush', () => {
    const { w, writes, advance } = setup();
    w.update('#d0', true);
    for (let i = 1; i <= 10; i++) { advance(16); w.update(`#d${i}`, true); }
    expect(writes.length).toBeLessThan(5);
    expect(w.pending).toBe(true);
    w.flush(); // pagehide / tab hidden
    expect(writes[writes.length - 1]).toBe('#d10');
    advance(1000);
    w.update('#d10', true);
    expect(writes[writes.length - 1]).toBe('#d10');
  });
  it('the end of a drag (a discrete update) is written at once', () => {
    const { w, writes, advance } = setup();
    w.update('#d0', true); advance(10); w.update('#d1', true); advance(10);
    w.update('#final');
    expect(writes[writes.length - 1]).toBe('#final');
  });
  it('over the browser budget it falls back to throttling instead of throwing', () => {
    let t = 0;
    const writes: string[] = [];
    const w = createUrlWriter({ write: (h) => writes.push(h), now: () => t, setTimer: () => 1, clearTimer: () => {}, budget: 5 });
    for (let i = 0; i < 20; i++) { t += 10; w.update(`#e${i}`); }
    expect(writes.length).toBe(5);
    expect(w.pending).toBe(true);
    w.flush();
    expect(writes[writes.length - 1]).toBe('#e19');
  });
  it('a failing write (browser refusal) is retried on the next update', () => {
    let fail = true;
    const writes: string[] = [];
    const w = createUrlWriter({ write: (h) => { if (fail) throw new Error('SecurityError'); writes.push(h); } });
    w.update('#x');
    expect(writes).toEqual([]);
    fail = false;
    w.update('#y');
    expect(writes).toEqual(['#y']);
  });
});

describe('a refused value says which value is still in use', () => {
  it('unfinished input ("9.", "12,", "-") is not an error and not applied', () => {
    for (const x of ['9.', '12,', '-']) {
      const r = parseDecimal(x);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.incomplete).toBe(true);
    }
  });
  it('"Not a number. … Still using 12.5 m."', () => {
    const r = parseDecimal('abc');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(refusedText(r.error, 12.5, 'm')).toMatch(/^Not a number\..*Still using 12\.5 m\.$/);
    expect(refusedText('Leave out thousands separators: type 1000, not 1,000.', 1000, 'm²')).toBe('Leave out thousands separators: type 1000, not 1,000. Still using 1000 m².');
    expect(refusedText('Enter a number.', NaN, 'm')).toBe('Enter a number. No value in use yet.');
    expect(refusedText('Not a number.', 25, '%')).toBe('Not a number. Still using 25%.');
  });
});
