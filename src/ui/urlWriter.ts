// Keeps the share link (URL hash) in step with the inputs.
//
// A reload picks its URL before `pagehide` fires, so a save on pagehide alone is too late: an edit followed
// at once by a refresh came back with the old value. Discrete edits (typing, picking) are therefore written
// immediately. Continuous edits (dragging a corner) are throttled, because browsers limit history calls
// (Safari: 100 per 30 s, then it throws). `flush()` writes whatever is pending, from the latest value.

export interface UrlWriterOpts {
  write: (hash: string) => void; // e.g. (h) => history.replaceState(null, '', h)
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  throttleMs?: number; // spacing for continuous edits
  budget?: number; // max immediate writes per window, before falling back to throttling
  windowMs?: number;
}

export function createUrlWriter(o: UrlWriterOpts) {
  const now = o.now ?? (() => Date.now());
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const throttleMs = o.throttleMs ?? 400;
  const budget = o.budget ?? 60;
  const windowMs = o.windowMs ?? 30000;
  let latest: string | null = null; // the newest hash, written or not
  let written: string | null = null;
  let timer: unknown = null;
  let lastWrite = -Infinity;
  const stamps: number[] = [];

  const doWrite = () => {
    if (timer !== null) { clearTimer(timer); timer = null; }
    if (latest === null || latest === written) return;
    try { o.write(latest); written = latest; } catch { /* throttled by the browser: the next write retries */ }
    const t = now();
    lastWrite = t;
    stamps.push(t);
    while (stamps.length && t - stamps[0] > windowMs) stamps.shift();
  };
  const schedule = (ms: number) => { if (timer === null) timer = setTimer(() => { timer = null; doWrite(); }, ms); };

  return {
    /** Record the newest state. `continuous` = part of a drag; otherwise it is written at once. */
    update(hash: string, continuous = false) {
      latest = hash;
      if (hash === written) return;
      const t = now();
      while (stamps.length && t - stamps[0] > windowMs) stamps.shift();
      const overBudget = stamps.length >= budget;
      if (!continuous && !overBudget) { doWrite(); return; }
      const wait = Math.max(0, throttleMs - (t - lastWrite));
      if (wait === 0 && !overBudget) doWrite(); else schedule(overBudget ? throttleMs : wait);
    },
    /** Write anything pending now (pagehide, tab hidden, before unload). */
    flush() { doWrite(); },
    get pending() { return latest !== written; },
  };
}
