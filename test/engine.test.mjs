import assert from 'node:assert';
import { counts, BY_CODE, rng, shuffle, fullWall } from '../src/tiles.js';
import { checkWin, waits, chowOptions, isSevenPairs, isThirteenOrphans, isTenpai, shanten, ukeire } from '../src/hand.js';
import { scoreHK, faanToUnits, HK_DEFAULTS } from '../src/score/hk.js';
import { scoreTaiwan } from '../src/score/taiwan.js';
import { scoreRiichi } from '../src/score/riichi.js';
import { Game } from '../src/game.js';
import { VARIANTS } from '../src/variants.js';
import { botAction, LEVELS } from '../src/bot.js';

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

test('claims: a pung settles the tile without waiting on a pending chow', () => {
  // the chow player's prompt has been beaten, so the table must not sit there
  // waiting for them to notice and tap Pass
  const g = new Game({ variantId: 'hk-old', seed: 77, rounds: 1 });
  g.startHand();
  const from = g.turn;
  const t = 4;                       // 5筒: pungable by one seat, chowable by the next
  const punger = (from + 2) % 4;
  const chower = (from + 1) % 4;
  g.hands[punger] = [t, t, ...g.hands[punger]].slice(0, g.v.handSize);
  g.hands[chower] = [t + 1, t + 2, ...g.hands[chower]].slice(0, g.v.handSize);
  g.hands[from] = g.hands[from].filter((x) => x !== t);
  g.hands[from].push(t);
  g.drawn = t;

  const r = g.doDiscard(from, t);
  assert.ok(r.claims, 'the discard should open claims');
  assert.strictEqual(g.phase, 'claim');
  assert.ok(g.claim.options[punger]?.pung, 'the punger can pung');
  assert.ok(g.claim.options[chower]?.chows?.length, 'the chower can chow');

  g.doClaim(punger, { type: 'pung' });
  assert.notStrictEqual(g.phase, 'claim', 'the pung should resolve the claim immediately');
  assert.ok(g.melds[punger].some((m) => m.type === 'pung' && m.tile === t), 'the pung was taken');
  assert.strictEqual(g.turn, punger, 'play continues from the claimer');
});

test('claims: a declared win still waits on another seat that could also win', () => {
  // two ron claims are separated by seat order, not by who tapped first, so an
  // early resolve here would hand the tile to the wrong player
  const g = new Game({ variantId: 'hk-old', seed: 91, rounds: 1 });
  g.startHand();
  const from = g.turn;
  const t = 4;
  const near = (from + 1) % 4, far = (from + 2) % 4;
  // both opponents can win on t; give them the same ready hand
  const ready = [0, 0, 0, 1, 1, 1, 2, 2, 2, 9, 9, 9, t];
  g.hands[near] = ready.slice();
  g.hands[far] = ready.slice();
  g.hands[from] = g.hands[from].filter((x) => x !== t);
  g.hands[from].push(t);
  g.drawn = t;

  g.doDiscard(from, t);
  assert.strictEqual(g.phase, 'claim');
  const bothCanWin = g.claim.options[near]?.win && g.claim.options[far]?.win;
  assert.ok(bothCanWin, 'both opponents should be able to win on the tile');

  g.doClaim(far, { type: 'claimWin' });
  assert.strictEqual(g.phase, 'claim', 'the far seat winning must not end it early');
  g.doClaim(near, { type: 'claimWin' });
  assert.strictEqual(g.result?.seat, near, 'the seat nearer the discarder takes the tile');
});


// ------------------------------------------------------------------- distance

test('shanten: reads a hand’s distance from a win', () => {
  assert.strictEqual(shanten(counts(T('p1 p2 p3 p4 p5 p6 s7 s8 s9 m2 m2 m2 zc zc')), 4), -1);
  assert.strictEqual(shanten(counts(T('p1 p2 p3 p4 p5 p6 s7 s8 s9 m2 m2 m2 zc')), 4), 0);
  assert.strictEqual(shanten(counts(T('p1 p2 p3 p4 p5 p6 s7 s8 s9 m2 m2 zc zf')), 4), 1);
  assert.strictEqual(shanten(counts(T('p1 p4 p7 s2 s5 s8 m3 m6 m9 ze zs zw zn')), 4), 8);
  // five sets plus a pair for the Taiwanese hand, and the melded shorthand
  assert.strictEqual(shanten(counts(T('p1 p2 p3 p4 p5 p6 p7 p8 p9 s1 s2 s3 m2 m2 m2 zc zc')), 5), -1);
  assert.strictEqual(shanten(counts(T('p1 p2 p3 s7 s8 s9 m2 m2 m2 zc')), 3), 0);
});

test('shanten: special hands only count while the hand is closed', () => {
  const seven = counts(T('p1 p1 p3 p3 s5 s5 s9 s9 m2 m2 m7 m7 zc'));
  assert.strictEqual(shanten(seven, 4, { sevenPairs: true }), 0);
  assert.strictEqual(shanten(seven, 4, { sevenPairs: true, closed: false }), 3);
  const orphans = counts(T('p1 p9 s1 s9 m1 m9 ze zs zw zn zc zf zb'));
  assert.strictEqual(shanten(orphans, 4, { thirteen: true }), 0);
  assert.strictEqual(shanten(orphans, 4, {}), 8);
});

test('shanten agrees with the win and wait checks across random hands', () => {
  // one independent implementation checking another: `waits` gets there through
  // checkWin, shanten through block counting, and they must not disagree
  const rnd = rng(9871);
  for (let i = 0; i < 400; i++) {
    for (const need of [4, 3, 5]) {
      const c = counts(shuffle(fullWall({ withBonus: false }), rnd).slice(0, 3 * need + 1));
      const s = shanten(c, need, {});
      assert.strictEqual(s === 0, isTenpai(c, need, {}), `shanten ${s} vs waits, need ${need}`);
      assert.ok(s > 0 || s === 0, 'a 13-tile hand is never complete');
      // and no hand is stuck: some draw always brings it one step closer
      let closer = false, jumped = false;
      for (let t = 0; t < 34; t++) {
        if (c[t] >= 4) continue;
        c[t]++;
        const after = shanten(c, need, {});
        c[t]--;
        if (after === s - 1) closer = true;
        if (after < s - 1) jumped = true;
      }
      assert.ok(closer && !jumped, `no single draw moves a ${s}-shanten hand exactly one step`);
    }
  }
});

test('ukeire: counts the useful draws that are still out there', () => {
  const c = counts(T('p1 p2 p3 p4 p5 p6 s7 s8 s9 m2 m2 m5 m6'));
  const open = ukeire(c, 4, {});
  assert.strictEqual(open.shanten, 0);
  assert.deepStrictEqual(open.kinds, T('m4 m7'), 'waiting on both ends of m5m6');
  assert.strictEqual(open.tiles, 8);
  // three of the four m4s already sitting in the river are three fewer draws
  const seen = new Array(34).fill(0);
  seen[BY_CODE.m4] = 3;
  assert.strictEqual(ukeire(c, 4, {}, seen).tiles, 5);
});

// ------------------------------------------------------------------- the bots

/* The bots only ever see a seat's view, so a test can hand them one directly. */
function botView(over = {}) {
  return {
    phase: 'play', turn: 0, seat: 0, seatWind: 0, roundWind: 0, dealer: 0,
    handSize: 13, setsNeeded: 4, useBonus: true, useRiichi: false,
    useSevenPairs: false, useThirteen: true, needsValue: true,
    wall: 60, melds: [[], [], [], []], discards: [[], [], [], []], river: [],
    riichiSeats: [false, false, false, false], doraIndicators: [],
    hand: [], legal: {}, ...over,
  };
}

test('bot: a thinking discard keeps the shape and throws the loose tile', () => {
  const hand = T('p1 p2 p3 p4 p5 p6 s7 s8 s9 m2 m2 m5 m6 zn');
  const view = botView({ hand, legal: { discard: hand } });
  for (const level of ['normal', 'hard']) {
    // the lone north wind is the only tile that is not doing any work
    assert.deepStrictEqual(botAction(view, level), { type: 'discard', tile: BY_CODE.zn }, level);
  }
});

test('bot: hard folds to a riichi and throws a tile that seat has already passed', () => {
  // p5 is doing real work in this hand, and it is the one tile seat 1 cannot
  // ron — a bot that is defending gives up the shape, a bot that is not keeps it
  const hand = T('p4 p5 p6 s2 s5 s8 m3 m6 m9 ze zs zw zn zc');
  const view = botView({
    hand,
    legal: { discard: hand },
    riichiSeats: [false, true, false, false],
    discards: [[], T('p5'), [], []],
    river: [{ seat: 1, tile: BY_CODE.p5, taken: false, riichi: true }],
    wall: 40,
  });
  assert.deepStrictEqual(botAction(view, 'hard'), { type: 'discard', tile: BY_CODE.p5 });
  const loose = botAction(view, 'normal').tile;
  assert.ok(!T('p4 p5 p6').includes(loose), `normal broke a finished run: ${loose}`);
});

test('bot: hard pushes instead of folding when it is close itself', () => {
  const hand = T('p1 p2 p3 p4 p5 p6 s7 s8 s9 m2 m2 m5 m6 zn');
  const view = botView({
    hand,
    legal: { discard: hand },
    riichiSeats: [false, true, false, false],
    discards: [[], T('zn'), [], []],
    river: [{ seat: 1, tile: BY_CODE.zn, taken: false, riichi: true }],
  });
  // tenpai and the safe tile happens to be the useless one — but the point is
  // that it keeps its wait rather than dismantling the hand
  const a = botAction(view, 'hard');
  assert.strictEqual(a.tile, BY_CODE.zn);
  assert.strictEqual(shanten(counts(hand.filter((t) => t !== BY_CODE.zn)), 4, {}), 0);
});

test('bot: a table minimum stops it opening a hand that could never pay', () => {
  const junk = T('p2 p3 s5 s6 m8 m9 ze zs zw zn zc zf zb');
  const offer = {
    phase: 'claim', turn: 3,
    lastDiscard: { seat: 3, tile: BY_CODE.p1, index: 0 },
    legal: { chows: [T('p2 p3')], canPass: true },
  };
  for (const level of ['normal', 'hard']) {
    assert.deepStrictEqual(botAction(botView({ hand: junk, ...offer }), level),
      { type: 'pass' }, `${level} opened a three-suit hand under a faan minimum`);
  }
  // the same chow inside a one-suit hand is going somewhere, so it is taken
  const flush = T('p2 p3 p5 p6 p7 p8 p9 p9 zc zc zf zf zb');
  const a = botAction(botView({ hand: flush, ...offer }), 'hard');
  assert.strictEqual(a.type, 'chow');
  // and with no minimum to clear, the claim is judged on distance alone
  const b = botAction(botView({ hand: junk, ...offer, needsValue: false }), 'hard');
  assert.strictEqual(b.type, 'chow');
});

test('bot: every level plays a legal game to the end', () => {
  for (const level of LEVELS) {
    for (const variantId of ['hk-old', 'riichi']) {
      const g = new Game({ variantId, seed: 5150, rounds: 1 });
      g.startHand();
      let guard = 0, hands = 0;
      while (g.phase !== 'match-over' && hands < 6 && guard++ < 20000) {
        if (g.phase === 'play' || g.phase === 'claim') {
          const seat = g.phase === 'play' ? g.turn
            : Object.keys(g.claim.options).filter((s) => !g.claim.responses[s]).map(Number)[0];
          const a = botAction(g.view(seat), level);
          assert.ok(a, `${level}/${variantId}: no action offered in ${g.phase}`);
          const res = g.act(seat, a);
          assert.ok(!res.error, `${level}/${variantId}: ${res.error} for ${JSON.stringify(a)}`);
        } else if (g.phase === 'hand-over') { hands++; g.nextHand(); } else break;
      }
      assert.ok(hands >= 1, `${level}/${variantId} finished no hands`);
    }
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
