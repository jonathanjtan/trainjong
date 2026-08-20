/* The seat-fillers. Three of them, really: `easy` plays on tile-by-tile
   instinct and calls tiles because they are there, `normal` counts its distance
   from a win and only claims when the claim actually shortens it, and `hard`
   adds the two things that separate a player from a beginner — it knows which
   tiles are still live, and it knows when to give up on the hand and defend.

   Everything below reads only what a player at the table can see: the bot's own
   hand plus the public state. No peeking at the wall. */

import { counts, suited, rank, suit, honor, dragon, terminal, E } from './tiles.js';
import { shanten, ukeire, waits } from './hand.js';

export const LEVELS = ['easy', 'normal', 'hard'];

/* What each level is allowed to think about. `easy` has no entry — it never
   gets as far as this table. */
const PROFILE = {
  normal: { defend: false, countSeen: false, gateChowsOnly: true,  judgeRiichi: false },
  hard:   { defend: true,  countSeen: true,  gateChowsOnly: false, judgeRiichi: true  },
};

/** how much a tile is worth keeping, given the rest of the hand */
function keepScore(tile, c, ctx) {
  let s = 0;
  const n = c[tile];
  if (n >= 3) s += 12;
  else if (n === 2) s += 6;
  if (suited(tile)) {
    const r = rank(tile);
    if (r > 1 && c[tile - 1]) s += 3;
    if (r < 9 && c[tile + 1]) s += 3;
    if (r > 2 && c[tile - 2]) s += 1;
    if (r < 8 && c[tile + 2]) s += 1;
    if (r === 1 || r === 9) s -= 1;
  } else {
    if (dragon(tile)) s += 2;
    if (tile === E + ctx.seatWind || tile === E + ctx.roundWind) s += 2;
    if (n === 1) s -= 2;
  }
  return s;
}

export function botAction(view, level = 'normal') {
  const lv = LEVELS.includes(level) ? level : 'normal';
  if (lv === 'easy') return easyAction(view);
  return playedAction(view, PROFILE[lv]);
}

// ---------------------------------------------------------------------- easy

/* The original bot, kept as it was. Discards whatever looks least useful on its
   own, claims because a claim is offered. No idea how close it is to winning. */
function easyAction(view) {
  const l = view.legal || {};
  if (view.phase === 'play' && view.turn === view.seat) {
    if (l.win) return { type: 'win' };
    if (l.kongs?.length && Math.random() < 0.5) {
      const k = l.kongs[0];
      return { type: 'kong', tile: k.tile, kongType: k.type };
    }
    if (l.riichi?.length && Math.random() < 0.8) {
      const c = counts(view.hand);
      const pick = l.riichi.slice().sort((a, b) => keepScore(a, c, view) - keepScore(b, c, view))[0];
      return { type: 'discard', tile: pick, riichi: true };
    }
    const opts = l.discard || [];
    if (!opts.length) return null;
    const c = counts(view.hand);
    const ranked = opts.slice().sort((a, b) => keepScore(a, c, view) - keepScore(b, c, view));
    return { type: 'discard', tile: ranked[0] };
  }
  if (view.phase === 'claim') {
    if (l.win) return { type: 'claimWin' };
    const tile = view.lastDiscard?.tile;
    const valuable = tile !== undefined && honor(tile)
      && (dragon(tile) || tile === E + view.seatWind || tile === E + view.roundWind);
    if (l.kong !== undefined && valuable) return { type: 'claimKong' };
    if (l.pung && (valuable || Math.random() < 0.35)) return { type: 'pung' };
    if (l.chows?.length && Math.random() < 0.25) return { type: 'chow', tiles: l.chows[0] };
    return { type: 'pass' };
  }
  return null;
}

// ------------------------------------------------------------ what the bot knows

function context(view, prof) {
  const seat = view.seat;
  const mine = view.melds?.[seat] || [];
  const need = (view.setsNeeded ?? (view.handSize === 16 ? 5 : 4)) - mine.length;
  const closed = mine.every((m) => !m.open);
  return {
    prof,
    seat,
    melds: mine,
    need,
    closed,
    opts: { closed, sevenPairs: !!view.useSevenPairs, thirteen: !!view.useThirteen },
    seen: prof.countSeen ? seenCounts(view) : null,
  };
}

/* Every tile this seat can account for. A claimed tile sits in both the
   discarder's pile and the claimer's meld, so the river — which marks the ones
   that were taken — is the honest place to count from. */
function seenCounts(view) {
  const seen = new Array(34).fill(0);
  for (const t of view.hand || []) if (t < 34) seen[t]++;
  for (const d of view.river || []) if (!d.taken && d.tile < 34) seen[d.tile]++;
  for (const ms of view.melds || []) {
    for (const m of ms) {
      if (m.type === 'chow') { seen[m.tile]++; seen[m.tile + 1]++; seen[m.tile + 2]++; }
      else seen[m.tile] += m.type === 'kong' ? 4 : 3;
    }
  }
  for (const t of view.doraIndicators || []) if (t < 34) seen[t]++;
  for (let i = 0; i < 34; i++) if (seen[i] > 4) seen[i] = 4;
  return seen;
}

const live = (ctx, t) => Math.max(0, 4 - (ctx.seen ? ctx.seen[t] : 0));

// -------------------------------------------------------------------- the turn

function playedAction(view, prof) {
  const l = view.legal || {};
  const ctx = context(view, prof);

  if (view.phase === 'play' && view.turn === view.seat) {
    if (l.win) return { type: 'win' };
    const danger = prof.defend ? threats(view, ctx) : null;
    const folding = danger ? shouldFold(view, ctx, danger) : false;

    if (!folding && l.kongs?.length) {
      const k = pickKong(view, ctx, l.kongs);
      if (k) return { type: 'kong', tile: k.tile, kongType: k.type };
    }
    if (!folding && l.riichi?.length) {
      const t = pickRiichi(view, ctx, l.riichi);
      if (t !== null) return { type: 'discard', tile: t, riichi: true };
    }
    const opts = l.discard || [];
    if (!opts.length) return null;
    return { type: 'discard', tile: pickDiscard(view, ctx, opts, danger, folding) };
  }

  if (view.phase === 'claim') return claimDecision(view, ctx);
  return null;
}

/* Rank the discards by what the hand looks like afterwards: how far from a win,
   then how many useful tiles are still out there, then the old instinct score
   as a tie-break. A defending bot sorts on danger instead, and a bot that is
   pushing still gives up a few draws to dodge the worst tiles. */
function pickDiscard(view, ctx, opts, danger, folding) {
  const c = counts(view.hand);
  const scored = [...new Set(opts)].map((t) => {
    c[t]--;
    const u = ukeire(c, ctx.need, ctx.opts, ctx.seen);
    c[t]++;
    return {
      tile: t,
      dist: u.shanten,
      draws: u.tiles,
      keep: keepScore(t, c, view),
      risk: danger ? riskOf(t, view, ctx, danger) : 0,
    };
  });
  if (folding) {
    scored.sort((a, b) => a.risk - b.risk || a.dist - b.dist || b.draws - a.draws);
    return scored[0].tile;
  }
  const w = danger ? 6 : 0;   // worth this many live tiles to sidestep a dangerous discard
  scored.sort((a, b) => a.dist - b.dist
    || (b.draws - w * b.risk) - (a.draws - w * a.risk)
    || a.keep - b.keep);
  return scored[0].tile;
}

/* A kong is free tile value but it locks three or four tiles into a shape. Take
   it only when the hand is no further from a win afterwards. */
function pickKong(view, ctx, kongs) {
  const c = counts(view.hand);
  let base = Infinity;
  for (let t = 0; t < 34; t++) {
    if (!c[t]) continue;
    c[t]--;
    base = Math.min(base, shanten(c, ctx.need, ctx.opts));
    c[t]++;
  }
  for (const k of kongs) {
    if (k.type === 'concealed') {
      if (c[k.tile] < 4) continue;
      c[k.tile] -= 4;
      const after = shanten(c, ctx.need - 1, { ...ctx.opts, closed: ctx.closed });
      c[k.tile] += 4;
      if (after <= base) return k;
    } else {
      // added kong: the pung is already melded, this only spends the loose tile
      c[k.tile]--;
      const after = shanten(c, ctx.need, ctx.opts);
      c[k.tile]++;
      if (after <= base) return k;
    }
  }
  return null;
}

/* Which tenpai to declare on, if any. Riichi on a wait you have already
   discarded never gets paid (furiten), and a hard bot keeps quiet rather than
   locking its hand to a wait with nothing left in the wall. */
function pickRiichi(view, ctx, cands) {
  const c = counts(view.hand);
  const mine = new Set(view.discards?.[ctx.seat] || []);
  let best = null;
  for (const t of new Set(cands)) {
    c[t]--;
    const w = waits(c, ctx.need, ctx.opts);
    c[t]++;
    if (!w.length) continue;
    if (ctx.prof.judgeRiichi && w.some((x) => mine.has(x))) continue;
    const n = w.reduce((a, x) => a + live(ctx, x), 0);
    if (!best || n > best.n) best = { tile: t, n };
  }
  if (!best) return null;
  if (ctx.prof.judgeRiichi && best.n < 3) return null;   // stay quiet, keep the hand flexible
  return best.tile;
}

// ------------------------------------------------------------------- claiming

function claimDecision(view, ctx) {
  const l = view.legal || {};
  if (l.win) return { type: 'claimWin' };
  const tile = view.lastDiscard?.tile;
  if (tile === undefined) return { type: 'pass' };

  const danger = ctx.prof.defend ? threats(view, ctx) : null;
  if (danger && shouldFold(view, ctx, danger)) return { type: 'pass' };

  const c = counts(view.hand);
  const before = shanten(c, ctx.need, ctx.opts);

  const cands = [];
  if (l.kong !== undefined && c[tile] >= 3) cands.push({ use: [tile, tile, tile], act: { type: 'claimKong' } });
  if (l.pung && c[tile] >= 2) cands.push({ use: [tile, tile], act: { type: 'pung' } });
  for (const pair of l.chows || []) cands.push({ use: pair, act: { type: 'chow', tiles: pair }, chow: true });

  let best = null;
  for (const cand of cands) {
    if (cand.use.some((t) => !c[t])) continue;
    for (const t of cand.use) c[t]--;
    const after = shanten(c, ctx.need - 1, { ...ctx.opts, closed: false });
    const draws = ukeire(c, ctx.need - 1, { ...ctx.opts, closed: false }, ctx.seen).tiles;
    for (const t of cand.use) c[t]++;
    if (after >= before) continue;                       // the claim bought nothing
    if (!worthOpening(view, ctx, cand, tile)) continue;
    if (!best || after < best.after || (after === best.after && draws > best.draws)) {
      best = { ...cand, after, draws };
    }
  }
  return best ? best.act : { type: 'pass' };
}

/* Opening a hand costs the concealed bonuses, and under a table minimum — three
   faan in Hong Kong, a yaku in riichi — an open hand of plain runs simply
   cannot be declared. So the first call has to point somewhere: one suit, all
   triplets, honours worth scoring, or all simples where that pays. Once the
   hand is already open the decision is behind us. */
function worthOpening(view, ctx, cand, tile) {
  if (!view.needsValue) return true;
  if (!ctx.closed) return true;
  if (ctx.prof.gateChowsOnly && !cand.chow) return true;

  const c = counts(view.hand);
  for (const t of cand.use) c[t]--;
  const claimed = cand.chow ? cand.use.concat(tile) : new Array(cand.use.length + 1).fill(tile);
  for (const t of claimed) c[t]++;                      // the whole hand, meld included

  const yakuhai = (t) => honor(t) && (dragon(t) || t === E + view.seatWind || t === E + view.roundWind);
  const bySuit = [0, 0, 0];
  let honours = 0, pairs = 0, edges = 0;
  for (let t = 0; t < 34; t++) {
    if (!c[t]) continue;
    if (c[t] >= 2) pairs++;
    if (honor(t)) {
      if (c[t] >= 2 && yakuhai(t)) honours++;
      edges += c[t];
    } else {
      bySuit[suit(t)] += c[t];
      if (terminal(t)) edges += c[t];
    }
  }
  const inSuits = bySuit[0] + bySuit[1] + bySuit[2];
  const flush = inSuits > 0 && Math.max(...bySuit) === inSuits;   // one suit plus honours
  const triplets = !view.melds[ctx.seat].some((m) => m.type === 'chow') && !cand.chow && pairs >= ctx.need;
  // kuitan: a couple of stray terminals can still be thrown away. Worth nothing
  // in old-style Hong Kong, where all-simples is not on the table at all.
  const simples = edges <= 2 && !!view.useRiichi;
  return flush || triplets || simples || honours >= (view.useRiichi ? 1 : 2);
}

// ------------------------------------------------------------------- defending

/* Who at the table looks like they are waiting, and how badly. A riichi is
   stated outright; everyone else is read from their melds. */
function threats(view, ctx) {
  const out = [];
  for (let s = 0; s < 4; s++) {
    if (s === ctx.seat) continue;
    let level = 0, riichiAt = -1;
    if (view.riichiSeats?.[s]) {
      level = 1;
      riichiAt = (view.river || []).findIndex((d) => d.seat === s && d.riichi);
    } else {
      const open = (view.melds?.[s] || []).filter((m) => m.open);
      const bySuit = [0, 0, 0];
      let value = false;
      for (const m of open) {
        if (suited(m.tile)) bySuit[suit(m.tile)]++;
        if (honor(m.tile) && (dragon(m.tile) || m.tile === E + ((s - view.dealer + 4) % 4) || m.tile === E + view.roundWind)) value = true;
      }
      if (open.length >= 3) level = 0.75;
      else if (open.length >= 2 && (value || Math.max(...bySuit) === open.length)) level = 0.6;
      else if (open.length >= 2) level = 0.35;
      if (level && view.wall < 20) level = Math.min(1, level + 0.15);
    }
    if (!level) continue;
    out.push({ seat: s, level, safe: safeAgainst(view, s, riichiAt), lean: suitLean(view, s) });
  }
  return out.length ? out : null;
}

/* Tiles that cannot deal in to this seat: anything already in their own pile,
   and — once they have declared — anything discarded since that nobody took,
   because they would have taken it themselves. */
function safeAgainst(view, s, riichiAt) {
  const safe = new Set(view.discards?.[s] || []);
  if (riichiAt >= 0) {
    const river = view.river || [];
    for (let i = riichiAt; i < river.length; i++) if (!river[i].taken) safe.add(river[i].tile);
  }
  return safe;
}

/** the suit a seat's melds and discards say they are collecting, or -1 */
function suitLean(view, s) {
  const dropped = [0, 0, 0];
  for (const t of view.discards?.[s] || []) if (suited(t)) dropped[suit(t)]++;
  const total = dropped[0] + dropped[1] + dropped[2];
  if (total < 6) return -1;
  for (let k = 0; k < 3; k++) if (dropped[k] === 0) {
    // never thrown one away and has melds in it: that is a flush being built
    if ((view.melds?.[s] || []).some((m) => m.open && suited(m.tile) && suit(m.tile) === k)) return k;
  }
  return -1;
}

/** 0 (cannot deal in) … 1 (about as dangerous as a tile gets) */
function riskOf(tile, view, ctx, danger) {
  let worst = 0;
  for (const th of danger) {
    if (th.safe.has(tile)) continue;
    let r;
    if (honor(tile)) {
      const left = live(ctx, tile);
      r = left <= 1 ? 0.1 : left === 2 ? 0.25 : 0.4;
    } else {
      const k = rank(tile);
      r = k === 1 || k === 9 ? 0.4 : k === 2 || k === 8 ? 0.55 : k === 3 || k === 7 ? 0.7 : 0.85;
      const own = new Set(view.discards?.[th.seat] || []);
      const suji = k <= 3 ? own.has(tile + 3) : k >= 7 ? own.has(tile - 3) : own.has(tile - 3) && own.has(tile + 3);
      if (suji) r *= 0.55;
    }
    if (th.lean >= 0) r *= (honor(tile) || (suited(tile) && suit(tile) === th.lean)) ? 1.4 : 0.4;
    worst = Math.max(worst, Math.min(1, r) * th.level);
  }
  return worst;
}

/* Fold when someone is clearly waiting and this hand is too far out to race
   them. Tenpai and one-away hands push — that is the whole point of being close. */
function shouldFold(view, ctx, danger) {
  const worst = Math.max(...danger.map((t) => t.level));
  if (worst < 0.6) return false;
  const dist = shanten(counts(view.hand), ctx.need, ctx.opts);
  return dist >= (worst >= 1 ? 2 : 3);
}
