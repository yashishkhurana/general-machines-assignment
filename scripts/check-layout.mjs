// Layout check in real Chrome (DevTools protocol):
//   node scripts/check-layout.mjs [url]
// Desktop (several window sizes): the page itself must not scroll: document scrollHeight == innerHeight and
// scrollWidth == innerWidth, and the results panel does scroll (only the panels scroll). Phone (390 × 844, mobile): no horizontal scroll, and the
// page does scroll vertically (the results are the page body). Exits 1 on any failure.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] ?? 'http://localhost:4173/';
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9340 + Math.floor(Math.random() * 50);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-'));
const ch = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 80 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;

const cases = [
  { name: 'desktop 1440×900', w: 1440, h: 900, mobile: false },
  { name: 'desktop 1280×720', w: 1280, h: 720, mobile: false },
  { name: 'desktop 1920×1080', w: 1920, h: 1080, mobile: false },
  { name: 'desktop 1024×1366', w: 1024, h: 1366, mobile: false },
  { name: 'phone 390×844', w: 390, h: 844, mobile: true },
];
let failed = 0;
await send('Page.enable');
for (const c of cases) {
  await send('Emulation.setDeviceMetricsOverride', { width: c.w, height: c.h, deviceScaleFactor: c.mobile ? 3 : 1, mobile: c.mobile });
  await send('Page.navigate', { url });
  await sleep(6000);
  // open the longest content too: every check shown
  await ev(`(() => { const b = [...document.querySelectorAll('.checks .more')][0]; if (b) b.click(); })()`);
  await sleep(400);
  const m = await ev(`(async () => {
    const d = document.documentElement;
    const before = scrollY; scrollTo(0, 10000); await new Promise(r => setTimeout(r, 100)); const after = scrollY; scrollTo(0, 0);
    const r = document.querySelector('section.results');
    const r0 = r.scrollTop; r.scrollTop = 100000; const panel = r.scrollTop - r0; r.scrollTop = 0;
    return { iw: innerWidth, ih: innerHeight, sh: d.scrollHeight, sw: d.scrollWidth, scrolled: after - before, panel };
  })()`);
  let ok, why;
  if (!c.mobile) { ok = m.sh === m.ih && m.sw === m.iw && m.scrolled === 0 && m.panel > 0; why = `scrollHeight ${m.sh} vs innerHeight ${m.ih}, scrollWidth ${m.sw} vs ${m.iw}, page scroll ${m.scrolled}px, results panel scrolls ${m.panel}px`; }
  else { ok = m.sw === m.iw && m.sh > m.ih && m.scrolled > 0; why = `scrollWidth ${m.sw} vs ${m.iw}, scrollHeight ${m.sh} > innerHeight ${m.ih}, page scrolls ${m.scrolled}px`; }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: ${why}`);
  if (!ok) failed++;
}
ws.close(); ch.kill();
process.exit(failed ? 1 : 0);
