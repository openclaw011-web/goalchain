// GoalChain demo-video scene recorder.
// Records each scene as its own webm via Playwright's built-in video capture.
// All app footage is the real product (local prod build + live Devnet data);
// terminal scenes replay REAL command output captured in out-*.txt.
//
// Prereqs: backend on :3001, frontend on :3000, `npm install` in demo/.
// Usage:   node record.mjs [sceneName]   (no arg = all scenes)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, renameSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'scenes');
mkdirSync(OUT, { recursive: true });

const APP = 'http://localhost:3000';
const only = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();

async function record(name, fn, { width = 1920, height = 1080 } = {}) {
  if (only && name !== only) return;
  const ctx = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: OUT, size: { width, height } },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  try {
    await fn(page);
  } finally {
    const video = page.video();
    await ctx.close();
    const path = await video.path();
    renameSync(path, join(OUT, `${name}.webm`));
    console.log(`✔ ${name}`);
  }
}

async function smoothScroll(page, to, ms = 2200) {
  await page.evaluate(async ({ to, ms }) => {
    const start = window.scrollY, delta = to - start, t0 = performance.now();
    await new Promise((done) => {
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        window.scrollTo(0, start + delta * e);
        k < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
  }, { to, ms });
}

async function playTerminal(page, title, lines, settle = 2500) {
  await page.goto('file://' + join(__dirname, 'terminal.html'));
  await sleep(600);
  await page.evaluate(({ title, lines }) => window.playScript(title, lines), { title, lines });
  await page.waitForFunction(() => window.__done, null, { timeout: 90000 });
  await sleep(settle);
}

const termLines = (file) =>
  readFileSync(join(__dirname, file), 'utf8').trimEnd().split('\n').map((text) => ({
    t: 'out',
    text,
    cls: text.includes('✔') || text.includes('✅') || text.includes('SUCCEEDED') || text.includes('passing') ? 'ok'
      : text.startsWith('tx:') || text.includes('explorer.solana.com') ? 'accent'
      : undefined,
    delay: 90,
  }));

// ── Scene 1: opening card ────────────────────────────────────────────────────
await record('01-opening', async (page) => {
  await page.goto('file://' + join(__dirname, 'opening.html'));
  await sleep(500);
  await page.evaluate(() => window.reveal());
  await page.waitForFunction(() => window.__done, null, { timeout: 30000 });
  await sleep(3200);
});

// ── Scene 2: homepage ────────────────────────────────────────────────────────
await record('02-home', async (page) => {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await sleep(3500);
  await smoothScroll(page, 700, 2600);
  await sleep(2000);
  await smoothScroll(page, 0, 1600);
  await sleep(1500);
});

// ── Scene 3: markets page (real TxLINE fixtures) ────────────────────────────
await record('03-markets', async (page) => {
  await page.goto(`${APP}/markets`, { waitUntil: 'networkidle' });
  await sleep(4500);
  // Only the two live semi-final markets — they sit above the fold, so keep a
  // small settle-scroll that holds them in frame instead of scrolling down
  // into the empty space below the cards.
  await smoothScroll(page, 120, 1500);
  await sleep(3200);
});

// ── Scene 4: France–Spain market detail (live fixture, on-chain market) ─────
const markets = await (await fetch('http://localhost:3001/api/markets')).json();
const fs = markets.data.find((m) => m.homeTeam === 'France' && m.awayTeam === 'Spain') ?? markets.data[0];
console.log('market detail:', fs.id, fs.homeTeam, 'vs', fs.awayTeam);
await record('04-detail', async (page) => {
  await page.goto(`${APP}/markets/${fs.id}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Pool Distribution', { timeout: 30000 });
  await sleep(3500);
  await smoothScroll(page, 500, 2200);
  await sleep(2600);
  await smoothScroll(page, 1000, 2000);
  await sleep(2400);
});

// ── Scene 5: real bet — terminal replay of genuine output ───────────────────
await record('05-bet-terminal', async (page) => {
  await playTerminal(page, 'goalchain — real 0.01 SOL bet on the live France–Spain market (Solana Devnet)', [
    { t: 'cmd', text: 'node smoke-test-bet.mjs CqFHm4vQRpwdkFjDoZ2edFNsLcwvaknsrxFdaQzd7L4f 1 0.01', delay: 500 },
    ...termLines('out-bet.txt'),
  ], 3200);
});

// ── Scene 6: the bet on Solana Explorer (real tx) ────────────────────────────
await record('06-explorer-bet', async (page) => {
  await page.goto(
    'https://explorer.solana.com/tx/2YLXyAidD1Do1M8QanHHk3uC7z8bfR19gyK39ras52xtbxVs56XR88vFXJpHk5FuVUNV4Hi6J1UDbbBtJGWwjVDQ?cluster=devnet',
    { waitUntil: 'domcontentloaded' },
  );
  await sleep(6500);
  await smoothScroll(page, 600, 2400);
  await sleep(2600);
});

// ── Scene 7: live TxLINE backend (real health output) ───────────────────────
const health = await (await fetch('http://localhost:3001/health')).json();
await record('07-backend', async (page) => {
  await playTerminal(page, 'goalchain backend — LIVE TxLINE oracle connection (real subscription)', [
    { t: 'cmd', text: 'curl -s http://localhost:3001/health | jq', delay: 500 },
    ...JSON.stringify(health, null, 2).split('\n').map((text) => ({
      t: 'out',
      text,
      cls: text.includes('true') ? 'ok' : text.includes('"txline"') || text.includes('"keeper"') ? 'accent' : 'dim',
      delay: 55,
    })),
    { t: 'out', text: '', delay: 700 },
    { t: 'out', text: '→ scoresConnected + oddsConnected: REAL TxLINE SSE streams (on-chain subscription)', cls: 'ok', delay: 300 },
    { t: 'out', text: '→ keeper.running: auto-settles markets on-chain the moment results land', cls: 'ok', delay: 300 },
  ], 3200);
});

// ── Scene 8: settle_market CPI code ──────────────────────────────────────────
await record('08-code', async (page) => {
  await page.goto('file://' + join(__dirname, 'code.html'));
  await sleep(12000);
});

// ── Scene 9: the on-chain test suite (real fresh run) ───────────────────────
await record('09-tests', async (page) => {
  const lines = termLines('out-tests.txt').filter((l) => !l.text.startsWith('(node:') && !l.text.includes('MODULE_TYPELESS'));
  await playTerminal(page, 'anchor test — full lifecycle vs the TxLINE CPI (local validator)', [
    { t: 'cmd', text: 'anchor test --skip-build --provider.cluster localnet', delay: 400 },
    ...lines.map((l) => ({ ...l, delay: 42 })),
  ], 3000);
});

// ── Scene 10: payout verified on the DEPLOYED binary (real run) ─────────────
await record('10-payout', async (page) => {
  await playTerminal(page, 'verify-payout-devnet — escrow payout on the DEPLOYED Devnet program', [
    { t: 'cmd', text: 'node verify-payout-devnet.mjs', delay: 500 },
    ...termLines('out-payout.txt'),
  ], 3200);
});

// ── Scene 11: proof verifier page ────────────────────────────────────────────
await record('11-verify', async (page) => {
  await page.goto(`${APP}/verify/${fs.fixtureId ?? 'demo'}`, { waitUntil: 'networkidle' });
  await sleep(3500);
  await smoothScroll(page, 600, 2400);
  await sleep(2800);
});

// ── Scene 12: closing card ───────────────────────────────────────────────────
await record('12-closing', async (page) => {
  await page.goto('file://' + join(__dirname, 'closing.html'));
  await sleep(600);
  await page.evaluate(() => window.reveal());
  await page.waitForFunction(() => window.__done, null, { timeout: 30000 });
  await sleep(6000);
});

await browser.close();
console.log('\nScenes:', readdirSync(OUT).filter((f) => f.endsWith('.webm')).sort().join(', '));
