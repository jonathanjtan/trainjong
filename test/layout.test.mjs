/* The table's geometry, checked without a browser.

   The arena is drawn as a regular N-gon: bands spun about the centre by a whole
   turn divided by the seat count, positioned off the apothem. Four seats is the
   case where the apothem is half the side and the box is the side — so the
   square has to keep coming out of the general formula unchanged, and that is
   what most of this file is for. */
import assert from 'node:assert';
import fs from 'node:fs';
import { Game } from '../src/game.js';
import { botAction } from '../src/bot.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

// ------------------------------------------------- just enough of a browser

const el = () => ({
  innerHTML: '', className: '', style: { setProperty() {}, getPropertyValue: () => '' },
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  getBoundingClientRect: () => ({ width: 400, height: 400 }),
  clientWidth: 800, clientHeight: 600, offsetWidth: 400, focus() {}, blur() {},
  appendChild() {}, remove() {}, closest: () => null, dataset: {},
});
const board = el();
globalThis.document = {
  getElementById: (id) => (id === 'board' ? board : el()),
  addEventListener() {}, createElement: el, body: el(), documentElement: el(),
  querySelector: () => null, querySelectorAll: () => [], hidden: false,
};
globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), devicePixelRatio: 1 };
globalThis.location = { search: '?room=t', href: '', protocol: 'http:', host: 'x' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {} }, configurable: true });
globalThis.requestAnimationFrame = (f) => f();
globalThis.getComputedStyle = () => ({ paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px' });
globalThis.AudioContext = class { createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: {} }; } };

// app.js keeps its renderer private, which is right — reach in through a copy
// that re-exports the handful of things this file has to see.
const here = new URL('.', import.meta.url).pathname;
const probe = `${here}../public/__layout_probe.js`;
fs.writeFileSync(probe, fs.readFileSync(`${here}../public/app.js`, 'utf8')
  + '\nexport { renderTable, polygon, seatRot, outward };'
  + '\nexport function __setSync(v) { sync = v; }\n');
const app = await import(probe);
fs.unlinkSync(probe);

function draw(variantId, n, seed = 7) {
  const game = new Game({ variantId, seed });
  game.startHand();
  for (let i = 0; i < 140 && game.phase !== 'hand-over'; i++) {
    if (game.phase === 'play') {
      const a = botAction(game.view(game.turn), 'normal');
      if (!a || game.act(game.turn, a)?.error) break;
    } else if (game.phase === 'claim') {
      for (const s of Object.keys(game.claim.options).map(Number)) {
        if (game.phase !== 'claim' || game.claim.responses[s]) continue;
        game.act(s, botAction(game.view(s), 'normal') || { type: 'pass' });
      }
      if (game.phase === 'claim') game.forceResolveClaims();
    } else break;
  }
  app.__setSync({ room: { faces: [], seats: Array.from({ length: n }, (_, i) => (
    { name: `P${i + 1}`, avatar: '', bot: i > 0, connected: true, ready: true })) } });
  app.renderTable(game.view(0));
  return board.innerHTML;
}
const all = (html, re) => html.match(re) || [];

// ------------------------------------------------------------- the geometry

test('polygon: the square falls out of the general formula', () => {
  const p = app.polygon(4);
  assert.ok(Math.abs(p.apof - 0.5) < 1e-12, 'apothem is half the side');
  assert.ok(Math.abs(p.boxf - 1) < 1e-12, 'the box is the side');
  assert.strictEqual(p.step, 90);
});

test('polygon: five seats give a pentagon', () => {
  const p = app.polygon(5);
  assert.ok(Math.abs(p.apof - 0.688191) < 1e-5, `apothem ${p.apof}`);
  assert.ok(Math.abs(p.boxf - 1.618034) < 1e-5, `box ${p.boxf}`);   // the golden ratio, as it happens
  assert.strictEqual(p.step, 72);
});

test('polygon: apothem and box grow with the seat count', () => {
  let lastA = 0, lastB = 0;
  for (const n of [3, 4, 5, 6, 7]) {
    const p = app.polygon(n);
    assert.ok(p.apof > lastA, `apothem should grow at N=${n}`);
    assert.ok(p.boxf >= lastB, `box should not shrink at N=${n}`);
    lastA = p.apof; lastB = p.boxf;
  }
});

test('seatRot: the seat after yours is on your right at any table size', () => {
  for (const n of [4, 5, 6]) {
    assert.strictEqual(app.seatRot(0, n), 0, 'you sit at the bottom');
    assert.strictEqual(app.seatRot(1, n), -(360 / n), 'the next seat turns clockwise off the bottom');
  }
  // the square's four rotations, which used to be named b-bottom/right/top/left
  assert.deepStrictEqual([0, 1, 2, 3].map((k) => app.seatRot(k, 4)), [0, -90, -180, -270]);
});

test('outward: the near seat points straight down, and the ring closes', () => {
  for (const n of [4, 5, 7]) {
    const o0 = app.outward(0, n);
    assert.ok(Math.abs(o0.sx) < 1e-9 && Math.abs(o0.sy - 1) < 1e-9, `N=${n} near seat`);
    let sx = 0, sy = 0;
    for (let k = 0; k < n; k++) { const o = app.outward(k, n); sx += o.sx; sy += o.sy; }
    assert.ok(Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9, `N=${n} vectors should cancel`);
  }
});

// ------------------------------------------------------------- the rendering

test('five seats: five bands, five plates, five readouts, turned 72° apart', () => {
  const html = draw('hk-new-5', 5);
  assert.strictEqual(all(html, /class="band"/g).length, 5);
  assert.strictEqual(all(html, /class="nplate/g).length, 5);
  assert.strictEqual(all(html, /class="sc[ s]/g).length, 5);
  assert.deepStrictEqual(all(html, /--rot:(-?[\d.]+)deg/g),
    ['--rot:0deg', '--rot:-72deg', '--rot:-144deg', '--rot:-216deg', '--rot:-288deg']);
  assert.ok(/--apof:0\.68819;--boxf:1\.61803/.test(html), 'pentagon factors reach the stylesheet');
});

test('five seats: the table is round and the seats are 東南西北中', () => {
  const html = draw('hk-new-5', 5);
  assert.ok(/class="arena poly"/.test(html));
  assert.ok(/class="plates poly"/.test(html));
  assert.ok(/class="chub poly"/.test(html));
  assert.deepStrictEqual(all(html, /class="wind cjk">./g).map((x) => x.slice(-1)),
    ['東', '南', '西', '北', '中']);
});

test('four seats: still the square, down to the grid cells', () => {
  const html = draw('hk-new', 4);
  assert.ok(!/class="arena poly"/.test(html), 'no polygon mode at four seats');
  assert.ok(!/class="chub poly"/.test(html));
  assert.strictEqual(all(html, /class="band"/g).length, 4);
  assert.deepStrictEqual(all(html, /--rot:(-?[\d.]+)deg/g),
    ['--rot:0deg', '--rot:-90deg', '--rot:-180deg', '--rot:-270deg']);
  assert.ok(/--apof:0\.50000;--boxf:1\.00000/.test(html), 'the square is apothem ½, box 1');
  assert.deepStrictEqual(all(html, /class="sc s-\w+/g).map((x) => x.slice(11)),
    ['-bottom', '-right', '-top', '-left'], 'the hub keeps its named grid cells');
});

test('four seats: the arena plates carry no score of their own', () => {
  // regression: the seat count was being passed into plate()'s withScore slot,
  // which put a score on every plate and reset the outward vectors to a square
  const html = draw('hk-new', 4);
  assert.ok(!/nplate[\s\S]{0,400}?class="sc num/.test(html), 'plates should not print scores');
  assert.deepStrictEqual(all(html, /--sx:(-?[\d.]+)/g),
    ['--sx:0.0000', '--sx:1.0000', '--sx:0.0000', '--sx:-1.0000']);
});

test('five seats: the plates ride an ellipse, not a square', () => {
  const html = draw('hk-new-5', 5);
  const sx = all(html, /--sx:(-?[\d.]+)/g).map((s) => parseFloat(s.slice(5)));
  assert.strictEqual(sx.length, 5);
  assert.ok(Math.abs(sx[1] - 0.9511) < 1e-3, `seat 1 x ${sx[1]}`);
  assert.ok(Math.abs(sx[2] - 0.5878) < 1e-3, `seat 2 x ${sx[2]}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
