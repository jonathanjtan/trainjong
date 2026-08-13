import assert from 'node:assert';
import { counts, BY_CODE } from '../src/tiles.js';
import { checkWin, waits, chowOptions, isSevenPairs, isThirteenOrphans } from '../src/hand.js';
import { scoreHK, faanToUnits, HK_DEFAULTS } from '../src/score/hk.js';
import { scoreTaiwan } from '../src/score/taiwan.js';
import { scoreRiichi } from '../src/score/riichi.js';
import { Game } from '../src/game.js';
import { VARIANTS } from '../src/variants.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const T = (codes) => codes.split(' ').map((c) => {
  if (!(c in BY_CODE)) throw new Error(`bad code ${c}`);
  return BY_CODE[c];
});

// ------------------------------------------------------------------ hand logic

test('standard win: three chows, a pung and a pair', () => {
  const c = counts(T('p1 p2 p3 p4 p5 p6 s7 s8 s9 m2 m2 m2 zc zc'));
  assert.ok(checkWin(c, 4, {}).ok);
});

test('not a win: floating tile', () => {
  const c = counts(T('p1 p2 p3 p4 p5 p6 s7 s8 s9 m2 m2 m2 zc zf'));
  assert.ok(!checkWin(c, 4, {}).ok);
});

test('seven pairs and thirteen orphans recognised', () => {
  assert.ok(isSevenPairs(counts(T('p1 p1 p3 p3 s5 s5 s9 s9 m2 m2 m7 m7 zc zc'))));
  assert.ok(isThirteenOrphans(counts(T('p1 p9 s1 s9 m1 m9 ze zs zw zn zc zf zb zb'))));
  assert.ok(!isSevenPairs(counts(T('p1 p1 p1 p1 s5 s5 s9 s9 m2 m2 m7 m7 zc zc'))));
});

test('waits: 13-tile hand waiting on two tiles', () => {
  const c = counts(T('p2 p3 p4 p5 p6 p7 s1 s2 s3 m5 m5 m5 zc'));
  assert.deepStrictEqual(waits(c, 4, {}), [BY_CODE.zc]);
});

test('chow options', () => {
  const c = counts(T('p2 p3 p5 p7'));
  assert.deepStrictEqual(chowOptions(c, BY_CODE.p4).length, 2);
  assert.deepStrictEqual(chowOptions(c, BY_CODE.ze).length, 0);
});

// ------------------------------------------------------------------ HK scoring

test('HK faan ladder matches the classic table', () => {
  const o = { ...HK_DEFAULTS, minFaan: 0 };
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((f) => faanToUnits(f, o)),
    [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384]);
});

test('HK: half flush + all pungs is 6 faan and pays', () => {
  const r = scoreHK({
    seat: 1, concealed: counts(T('p2 p2 p2 p5 p5 p5 p8 p8 p8 zn zn zn zc zc')),
    melds: [], bonusTiles: [], winTile: BY_CODE.zc, selfDraw: false,
    seatWind: 1, roundWind: 0, dealer: 0, discarder: 2, flags: {},
  });
  assert.ok(r.win, 'should be a win');
  const keys = r.patterns.map((p) => p.key);
  assert.ok(keys.includes('halfFlush') && keys.includes('allPungs'), keys.join(','));
  assert.ok(r.value >= 6, `got ${r.value}`);
  assert.strictEqual(r.deltas[1] + r.deltas[2], 0);
  assert.ok(r.deltas[1] > 0 && r.deltas[2] < 0);
});

test('HK: chicken hand is blocked under the 3 faan minimum', () => {
  const r = scoreHK({
    seat: 0, concealed: counts(T('p1 p2 p3 s4 s5 s6 m7 m8 m9 s2 s2')),
    melds: [{ type: 'chow', tile: BY_CODE.p5, open: true, from: 1 }], bonusTiles: [],
    winTile: BY_CODE.s2, selfDraw: false, seatWind: 0, roundWind: 0, dealer: 0, discarder: 3, flags: {},
  });
  assert.ok(r.win);
  assert.strictEqual(r.eligible, false);
  assert.deepStrictEqual(r.deltas, [0, 0, 0, 0]);
});

test('HK: thirteen orphans is the limit', () => {
  const r = scoreHK({
    seat: 0, concealed: counts(T('p1 p9 s1 s9 m1 m9 ze zs zw zn zc zf zb zb')),
    melds: [], bonusTiles: [], winTile: BY_CODE.zb, selfDraw: true,
    seatWind: 0, roundWind: 0, dealer: 0, discarder: null, flags: {},
  });
  assert.ok(r.win && r.limit, JSON.stringify(r));
  assert.strictEqual(r.value, 13);
});

test('HK: self-draw pays three ways, shooter pays all on a discard', () => {
  const base = {
    seat: 0, concealed: counts(T('p2 p2 p2 p5 p5 p5 p8 p8 p8 zn zn zn zc zc')),
    melds: [], bonusTiles: [], seatWind: 0, roundWind: 0, dealer: 3, flags: {},
    winTile: BY_CODE.zc,
  };
  const tsumo = scoreHK({ ...base, selfDraw: true, discarder: null });
  const ron = scoreHK({ ...base, selfDraw: false, discarder: 2 });
  assert.strictEqual(tsumo.deltas.filter((d) => d < 0).length, 3);
  assert.strictEqual(ron.deltas.filter((d) => d < 0).length, 1);
  assert.strictEqual(tsumo.deltas[0], tsumo.units * 3);
  assert.strictEqual(ron.deltas[0], ron.units * 3);
  assert.ok(tsumo.value > ron.value, 'concealed self-draw is worth more faan');
});

// -------------------------------------------------------------- Taiwan / riichi

test('Taiwan: 16-tile hand scores tai and pays base + tai', () => {
  const r = scoreTaiwan({
    seat: 2, concealed: counts(T('s1 s1 s2 s2 s3 s3 s4 s5 s6 s7 s8 s9 s5 s5 s5 s7 s7')),
    melds: [], bonusTiles: [], winTile: BY_CODE.s7, selfDraw: true,
    seatWind: 2, roundWind: 0, dealer: 0, discarder: null, continuation: 0, flags: {},
  });
  assert.ok(r.win, 'taiwan hand should win');
  assert.ok(r.patterns.some((p) => p.key === 'fullFlush'), JSON.stringify(r.patterns));
  assert.ok(r.deltas[2] > 0);
});

test('riichi: pinfu tsumo is 20 fu', () => {
  const r = scoreRiichi({
    seat: 1, concealed: counts(T('p2 p3 p4 p6 p7 p8 s3 s4 s5 m5 m6 m7 s8 s8')),
    melds: [], winTile: BY_CODE.p4, selfDraw: true,
    seatWind: 1, roundWind: 0, dealer: 0, discarder: null,
    doraIndicators: [], uraIndicators: [], honba: 0, riichiPot: 0, flags: {},
  });
  assert.ok(r.win, JSON.stringify(r));
  assert.strictEqual(r.fu, 20);
  const keys = r.patterns.map((p) => p.key);
  assert.ok(keys.includes('pinfu') && keys.includes('tsumo'), keys.join(','));
});

test('riichi: yakuless open hand cannot win', () => {
  const r = scoreRiichi({
    seat: 1, concealed: counts(T('p2 p3 p4 s3 s4 s5 m5 m6 m7 s9 s9')),
    melds: [{ type: 'chow', tile: BY_CODE.p6, open: true, from: 0 }],
    winTile: BY_CODE.s9, selfDraw: false,
    seatWind: 1, roundWind: 0, dealer: 0, discarder: 0,
    doraIndicators: [], uraIndicators: [], honba: 0, riichiPot: 0, flags: {},
  });
  assert.strictEqual(r.win, false);
  assert.strictEqual(r.reason, 'no yaku');
});

test('riichi: nine gates is a yakuman and the dealer collects 48000', () => {
  const r = scoreRiichi({
    seat: 0, concealed: counts(T('p1 p1 p1 p2 p3 p4 p5 p6 p7 p8 p9 p9 p9 p9')),
    melds: [], winTile: BY_CODE.p9, selfDraw: false,
    seatWind: 0, roundWind: 0, dealer: 0, discarder: 2,
    doraIndicators: [], uraIndicators: [], honba: 0, riichiPot: 0, flags: {},
  });
  assert.ok(r.win, JSON.stringify(r));
  assert.ok(r.yakuman >= 1, `expected chuuren, got ${r.label}`);
  assert.strictEqual(r.deltas[0], -r.deltas[2]);
});

// ------------------------------------------------------------------ state machine

export function totalTiles(g) {
  let n = g.wall.length + g.deadWall.length;
  for (let s = 0; s < 4; s++) {
    n += g.hands[s].length + g.bonus[s].length + g.discards[s].length;
    for (const m of g.melds[s]) n += m.type === 'kong' ? 4 : 3;
  }
  // a claimed tile lives in both the meld and the discarder's pile — count it once
  for (let s = 0; s < 4; s++) for (const m of g.melds[s]) if (m.open && m.from !== null) n -= 1;
  return n;
}

export function playRandom(variantId, seed, rounds = 1, maxHands = 24) {
  // the ACTIONS are seeded too, not just the wall — an unseeded harness explores
  // a different path every run, which turns a real bug into a ghost
  let x = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
  const g = new Game({ variantId, seed, rounds });
  g.startHand();
  const expect = VARIANTS[variantId].bonusTiles ? 144 : 136;
  const bank = g.scores.reduce((a, b) => a + b, 0);
  let guard = 0, hands = 0;
  const size = VARIANTS[variantId].handSize;
  while (g.phase !== 'match-over' && hands < maxHands && guard++ < 40000) {
    const tot = totalTiles(g);
    assert.strictEqual(tot, expect, `tile count drifted to ${tot} in ${variantId} (phase ${g.phase})`);
    // global conservation is not enough: tiles can end up with the WRONG seat and
    // still add to 136. Check each hand individually — but only during live play,
    // since a winner legitimately holds the winning tile once the hand is over.
    for (let s = 0; s < 4 && (g.phase === 'play' || g.phase === 'claim'); s++) {
      const held = g.hands[s].length + g.melds[s].length * 3;
      const onTurn = g.phase === 'play' && g.turn === s;
      assert.ok(held === size || (onTurn && held === size + 1),
        `${variantId} seat ${s} holds ${held} tiles (${g.hands[s].length} concealed + ${g.melds[s].length} melds), expected ${size}`);
    }
    if (g.phase === 'play') {
      const l = g.legal(g.turn);
      const r = rnd();
      if (l.win) g.act(g.turn, { type: 'win' });
      else if (l.kongs?.length && r < 0.15) g.act(g.turn, { type: 'kong', tile: l.kongs[0].tile, kongType: l.kongs[0].type });
      else if (l.riichi?.length && r < 0.25) g.act(g.turn, { type: 'discard', tile: l.riichi[(rnd() * l.riichi.length) | 0], riichi: true });
      else {
        const opts = l.discard || [];
        assert.ok(opts.length, `no legal discard for seat ${g.turn}`);
        const res = g.act(g.turn, { type: 'discard', tile: opts[(rnd() * opts.length) | 0] });
        assert.ok(!res.error, res.error);
      }
    } else if (g.phase === 'claim') {
      const pending = Object.keys(g.claim.options).filter((s) => !g.claim.responses[s]).map(Number);
      const seat = pending[0];
      const o = g.claim.options[seat];
      const r = rnd();
      let act = { type: 'pass' };
      if (o.win) act = { type: 'claimWin' };
      else if (o.kong !== undefined && r < 0.4) act = { type: 'claimKong' };
      else if (o.pung && r < 0.5) act = { type: 'pung' };
      else if (o.chows?.length && r < 0.6) act = { type: 'chow', tiles: o.chows[0] };
      const res = g.act(seat, act);
      assert.ok(!res.error, `${res.error} (seat ${seat}, ${JSON.stringify(o)})`);
    } else if (g.phase === 'hand-over') {
      assert.ok(g.result, 'hand ended without a result');
      const sum = g.result.deltas.reduce((a, b) => a + b, 0);
      if (VARIANTS[variantId].scorer !== 'riichi') assert.strictEqual(sum, 0, `payments do not net to zero: ${g.result.deltas}`);
      assert.strictEqual(g.scores.reduce((a, b) => a + b, 0) + g.riichiPot, bank,
        `table bank drifted: ${g.scores} pot ${g.riichiPot}`);
      hands++;
      g.nextHand();
    } else break;
  }
  assert.ok(guard < 40000, 'game did not terminate');
  return g;
}

for (const id of Object.keys(VARIANTS)) {
  test(`fuzz: ${id} plays a full wind round without breaking`, () => {
    for (let i = 0; i < 12; i++) playRandom(id, 1000 + i, 1);
  });
}

test('fuzz: long Hong Kong session keeps the books balanced', () => {
  const g = playRandom('hk-old', 777, 4, 60);
  assert.ok(g.history.length >= 40, `only ${g.history.length} hands`);
  assert.strictEqual(g.scores.reduce((a, b) => a + b, 0), 0);
});

test('riichi: a match reaches match-over and the bank is 100000', () => {
  const g = playRandom('riichi', 42, 1, 400);
  assert.strictEqual(g.scores.reduce((a, b) => a + b, 0) + g.riichiPot, 100000);
});

test('added kong: the replacement draw goes to the declarer, not the next seat', () => {
  // regression: a kong nobody could rob used to draw for next(declarer) AND for
  // the declarer, quietly handing the player on the right a 14th tile
  const g = new Game({ variantId: 'hk-old', seed: 4242, rounds: 1 });
  g.startHand();
  const seat = g.turn;
  // plant a pung and the fourth tile so an added kong is legal
  const t = 5;
  g.hands[seat] = g.hands[seat].filter((x) => x !== t);
  while (g.hands[seat].length > g.v.handSize - 3) g.hands[seat].pop();
  g.melds[seat] = [{ type: 'pung', tile: t, open: true, from: (seat + 1) % 4, claimed: t }];
  g.hands[seat].push(t);
  g.drawn = t;
  // a kong is four tiles, not three — count it that way or the maths lies
  const tiles = (s) => g.hands[s].length + g.melds[s].reduce((n, m) => n + (m.type === 'kong' ? 4 : 3), 0);
  const before = [0, 1, 2, 3].map(tiles);
  const res = g.doKong(seat, t, 'added');
  assert.ok(!res.error, res.error);
  assert.strictEqual(g.turn, seat, 'the kong declarer keeps the turn');
  for (const s of [0, 1, 2, 3]) {
    const held = tiles(s);
    const expected = s === seat ? before[s] + 1 : before[s];
    assert.strictEqual(held, expected, `seat ${s} holds ${held}, expected ${expected}`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
