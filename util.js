import {
  suit, rank, suited, honor, wind, dragon, terminal, majorMinor,
  E, RED, bonusSeat, bonusSet, BONUS,
} from '../tiles.js';

export function setTiles(s) {
  if (s.type === 'chow') return [s.tile, s.tile + 1, s.tile + 2];
  if (s.type === 'kong') return [s.tile, s.tile, s.tile, s.tile];
  return [s.tile, s.tile, s.tile];
}

/**
 * Combine declared melds with one concealed decomposition into a uniform
 * list of sets, then derive every boolean a scorer might ask about.
 */
export function shape(melds, decomp, ctx) {
  const sets = [
    ...melds.map((m) => ({ type: m.type, tile: m.tile, open: !!m.open, declared: true })),
    ...decomp.sets.map((s) => ({ ...s, open: false, declared: false })),
  ];
  const pair = decomp.pair;
  const tiles = [];
  for (const s of sets) tiles.push(...setTiles(s));
  tiles.push(pair, pair);

  const suitsUsed = new Set();
  let hasHonor = false, allEnds = true, allTerm = true, simpleOnly = true;
  for (const t of tiles) {
    if (suited(t)) { suitsUsed.add(suit(t)); allTerm = allTerm && terminal(t); }
    else { hasHonor = true; allTerm = false; }
    if (!majorMinor(t)) { allEnds = false; }
    if (majorMinor(t)) simpleOnly = false;
  }

  const chows = sets.filter((s) => s.type === 'chow');
  const pungs = sets.filter((s) => s.type !== 'chow');
  const kongs = sets.filter((s) => s.type === 'kong');
  const concealedPungs = pungs.filter((s) => !s.open);

  const dragonPungs = pungs.filter((s) => dragon(s.tile));
  const windPungs = pungs.filter((s) => wind(s.tile));

  return {
    sets, pair, tiles,
    chows, pungs, kongs, concealedPungs, dragonPungs, windPungs,
    suitsUsed, hasHonor,
    allChows: chows.length === sets.length,
    allPungs: pungs.length === sets.length,
    oneSuit: suitsUsed.size === 1,
    noSuits: suitsUsed.size === 0,
    allEnds,            // 混老頭 material: every tile terminal or honor
    allTerminals: allTerm,
    allSimples: simpleOnly,
    seatWindPung: windPungs.some((s) => s.tile === E + ctx.seatWind),
    roundWindPung: windPungs.some((s) => s.tile === E + ctx.roundWind),
    dragonPair: dragon(pair),
    windPair: wind(pair),
    seatWindPair: pair === E + ctx.seatWind,
    roundWindPair: pair === E + ctx.roundWind,
  };
}

export function isNineGates(concealedCounts, melds) {
  if (melds.length) return false;
  for (let s = 0; s < 3; s++) {
    let total = 0, ok = true;
    for (let r = 0; r < 9; r++) {
      const c = concealedCounts[s * 9 + r];
      total += c;
      const min = r === 0 || r === 8 ? 3 : 1;
      if (c < min) ok = false;
    }
    for (let t = 27; t < 34; t++) if (concealedCounts[t]) ok = false;
    let others = 0;
    for (let s2 = 0; s2 < 3; s2++) if (s2 !== s) for (let r = 0; r < 9; r++) others += concealedCounts[s2 * 9 + r];
    if (ok && total === 14 && others === 0) return true;
  }
  return false;
}

/** flower / season faan for Hong Kong + Taiwanese rules */
export function bonusScore(bonusTiles, seatWind, table) {
  const out = [];
  const mine = bonusTiles.filter((t) => bonusSeat(t) === seatWind);
  if (bonusTiles.length === 8) {
    out.push({ key: 'eightFlowers', zh: '八仙過海', en: 'Eight bonus tiles', value: table.eightFlowers });
    return out;
  }
  for (const set of [0, 1]) {
    const inSet = bonusTiles.filter((t) => bonusSet(t) === set);
    if (inSet.length === 4) {
      out.push({
        key: 'flowerSet',
        zh: set === 0 ? '花槓 (四花)' : '花槓 (四季)',
        en: set === 0 ? 'All four flowers' : 'All four seasons',
        value: table.flowerSet,
      });
    } else {
      for (const t of inSet) {
        if (bonusSeat(t) === seatWind) {
          out.push({ key: 'seatFlower', zh: '正花', en: 'Seat bonus tile', value: table.seatFlower });
        }
      }
    }
  }
  if (bonusTiles.length === 0 && table.noFlowers) {
    out.push({ key: 'noFlowers', zh: '無花', en: 'No bonus tiles', value: table.noFlowers });
  }
  void mine;
  return out;
}

export function countBonusForSeat(bonusTiles, seatWind) {
  return bonusTiles.filter((t) => bonusSeat(t) === seatWind).length;
}

export const isRedDragon = (t) => t === RED;
export const isBonusTile = (t) => t >= BONUS;
export { rank, suit, suited, honor, wind, dragon, terminal, majorMinor };
