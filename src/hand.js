import { rank, suited, majorMinor, counts as toCounts } from './tiles.js';

/**
 * All decompositions of a concealed count vector into `need` sets + one pair.
 * Sets are emitted in canonical (ascending) order so results are unique.
 * @returns {Array<{sets:Array<{type:string,tile:number}>, pair:number}>}
 */
export function decompose(c, need) {
  const out = [];
  const work = c.slice();
  for (let p = 0; p < 34; p++) {
    if (work[p] < 2) continue;
    work[p] -= 2;
    const acc = [];
    walk(work, need, acc, (sets) => out.push({ sets: sets.slice(), pair: p }));
    work[p] += 2;
  }
  return out;
}

function walk(c, need, acc, emit) {
  if (need === 0) {
    for (let i = 0; i < 34; i++) if (c[i]) return;
    emit(acc);
    return;
  }
  let i = 0;
  while (i < 34 && c[i] === 0) i++;
  if (i === 34) return;
  if (c[i] >= 3) {
    c[i] -= 3;
    acc.push({ type: 'pung', tile: i });
    walk(c, need - 1, acc, emit);
    acc.pop();
    c[i] += 3;
  }
  if (i < 27 && rank(i) <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    acc.push({ type: 'chow', tile: i });
    walk(c, need - 1, acc, emit);
    acc.pop();
    c[i]++; c[i + 1]++; c[i + 2]++;
  }
}

export function isSevenPairs(c) {
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    if (c[i] === 0) continue;
    if (c[i] === 2) pairs++;
    else return false; // 4-of-a-kind is not two pairs in standard chiitoitsu
  }
  return pairs === 7;
}

export const THIRTEEN = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

export function isThirteenOrphans(c) {
  let total = 0, dup = 0;
  for (let i = 0; i < 34; i++) {
    if (!c[i]) continue;
    if (!majorMinor(i)) return false;
    total += c[i];
    if (c[i] === 2) dup++;
    else if (c[i] !== 1) return false;
  }
  let kinds = 0;
  for (const t of THIRTEEN) if (c[t]) kinds++;
  return total === 14 && dup === 1 && kinds === 13;
}

/**
 * @param {number[]} c concealed counts (34)
 * @param {number} need sets still needed from the concealed part
 * @param {{sevenPairs?:boolean, thirteen?:boolean, closed?:boolean}} opts
 * @returns {{ok:boolean, decomps:Array, special:string|null}}
 */
export function checkWin(c, need, opts = {}) {
  const closed = opts.closed !== false;
  if (closed && opts.thirteen && isThirteenOrphans(c)) {
    return { ok: true, decomps: [], special: 'thirteen' };
  }
  if (closed && opts.sevenPairs && need === 4 && isSevenPairs(c)) {
    return { ok: true, decomps: [], special: 'sevenPairs' };
  }
  const decomps = decompose(c, need);
  if (decomps.length) return { ok: true, decomps, special: null };
  return { ok: false, decomps: [], special: null };
}

/** tiles that would complete the hand right now (ignores availability) */
export function waits(c, need, opts = {}) {
  const out = [];
  const work = c.slice();
  for (let t = 0; t < 34; t++) {
    if (work[t] >= 4) continue;
    work[t]++;
    if (checkWin(work, need, opts).ok) out.push(t);
    work[t]--;
  }
  return out;
}

export function isTenpai(c, need, opts = {}) {
  return waits(c, need, opts).length > 0;
}

/** chow combinations a claimer could form with `tile` from their hand */
export function chowOptions(c, tile) {
  if (!suited(tile)) return [];
  const r = rank(tile), out = [];
  const has = (t) => c[t] > 0;
  if (r >= 3 && has(tile - 2) && has(tile - 1)) out.push([tile - 2, tile - 1]);
  if (r >= 2 && r <= 8 && has(tile - 1) && has(tile + 1)) out.push([tile - 1, tile + 1]);
  if (r <= 7 && has(tile + 1) && has(tile + 2)) out.push([tile + 1, tile + 2]);
  return out;
}

export { toCounts };

/* ------------------------------------------------------------------ distance

   Shanten: how many tile exchanges stand between a hand and a win. -1 is a
   finished hand, 0 is tenpai (waiting), 1 is one away, and so on. The number
   falls out of the usual block count — a finished set saves two draws, a
   partial one saves one — maximised over every way the tiles could be carved
   up. `need` is how many sets the CONCEALED part still owes, so a melded hand
   passes a smaller number and the arithmetic stays the same. */

function standardShanten(c, need, floor) {
  if (need <= 0) {
    // everything is melded; all that is left is the pair
    for (let i = 0; i < 34; i++) if (c[i] >= 2) return -1;
    return 0;
  }
  const work = c.slice();
  const cap = need + 1;              // sets + the one pair
  let best = 2 * need;
  let held = 0;
  for (let i = 0; i < 34; i++) held += work[i];
  const walk = (from, m, t, pair, left) => {
    let i = from;
    while (i < 34 && work[i] === 0) i++;
    const s = 2 * need - 2 * m - t + (m + t === cap && !pair ? 1 : 0);
    if (s < best) best = s;
    if (i === 34 || m + t >= cap || best <= floor) return;
    // the tiles that are left can only be worth so much: a set costs three of
    // them and saves two draws, a partial costs two and saves one. If the very
    // best case still cannot beat what we have found, stop digging.
    const room = cap - (m + t);
    let gain = 0;
    for (let sets = 0; sets <= room && sets * 3 <= left; sets++) {
      const parts = Math.min(room - sets, (left - sets * 3) >> 1);
      if (sets * 2 + parts > gain) gain = sets * 2 + parts;
    }
    if (2 * need - 2 * m - t - gain >= best) return;
    const r = suited(i) ? rank(i) : 0;
    if (work[i] >= 3) {
      work[i] -= 3; walk(i, m + 1, t, pair, left - 3); work[i] += 3;
    }
    if (r >= 1 && r <= 7 && work[i + 1] && work[i + 2]) {
      work[i]--; work[i + 1]--; work[i + 2]--;
      walk(i, m + 1, t, pair, left - 3);
      work[i]++; work[i + 1]++; work[i + 2]++;
    }
    if (work[i] >= 2) {
      work[i] -= 2; walk(i, m, t + 1, true, left - 2); work[i] += 2;
    }
    if (r >= 1 && r <= 8 && work[i + 1]) {
      work[i]--; work[i + 1]--; walk(i, m, t + 1, pair, left - 2); work[i]++; work[i + 1]++;
    }
    if (r >= 1 && r <= 7 && work[i + 2]) {
      work[i]--; work[i + 2]--; walk(i, m, t + 1, pair, left - 2); work[i]++; work[i + 2]++;
    }
    // or nothing at all uses tile i: every block that could have is above
    const spare = work[i];
    work[i] = 0; walk(i + 1, m, t, pair, left - spare); work[i] = spare;
  };
  walk(0, 0, 0, false, held);
  return best;
}

function sevenPairsShanten(c) {
  let pairs = 0, kinds = 0;
  for (let i = 0; i < 34; i++) {
    if (!c[i]) continue;
    kinds++;
    if (c[i] >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

function thirteenShanten(c) {
  let kinds = 0, pair = 0;
  for (const t of THIRTEEN) {
    if (!c[t]) continue;
    kinds++;
    if (c[t] >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}

/**
 * @param {number[]} c concealed counts (34)
 * @param {number} need sets still owed by the concealed part
 * @param {{sevenPairs?:boolean, thirteen?:boolean, closed?:boolean}} opts
 * @returns {number} -1 complete, 0 tenpai, n tiles away
 */
export function shanten(c, need, opts = {}) {
  return shantenUpTo(c, need, opts, -1);
}

/* The same count, but allowed to stop as soon as it knows the answer is `floor`
   or better — which is all `ukeire` ever needs, and much less work. */
function shantenUpTo(c, need, opts, floor) {
  let best = standardShanten(c, need, floor);
  if (opts.closed !== false && need === 4) {
    if (opts.sevenPairs) best = Math.min(best, sevenPairsShanten(c));
    if (opts.thirteen) best = Math.min(best, thirteenShanten(c));
  }
  return best;
}

/**
 * Which draws would bring the hand closer, and how many of them are still out
 * there. `seen` (34 counts of tiles already visible anywhere) makes the tile
 * total honest; without it every tile type is assumed to have its four.
 * @returns {{shanten:number, kinds:number[], tiles:number}}
 */
export function ukeire(c, need, opts = {}, seen = null) {
  const work = c.slice();
  const base = shanten(work, need, opts);
  const kinds = [];
  let tiles = 0;
  for (let t = 0; t < 34; t++) {
    if (work[t] >= 4) continue;
    work[t]++;
    const s = shantenUpTo(work, need, opts, base - 1);
    work[t]--;
    if (s < base) {
      kinds.push(t);
      tiles += Math.max(0, 4 - (seen ? seen[t] : work[t]));
    }
  }
  return { shanten: base, kinds, tiles };
}
