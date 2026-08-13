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
