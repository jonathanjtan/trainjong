import { checkWin } from '../hand.js';
import { shape, isNineGates, bonusScore } from './util.js';
import { E, dragon, wind } from '../tiles.js';

/**
 * Hong Kong Old Style faan values. Every number here is house-rule territory —
 * this is a widely used table, edit freely.
 */
export const HK_TABLE = {
  selfDraw: 1,            // 自摸
  concealedRon: 1,        // 門前清
  concealedSelfDraw: 3,   // 門清自摸 (replaces the two above)
  allChows: 1,            // 平和
  allPungs: 3,            // 對對胡
  allMelded: 3,           // 全求人
  halfFlush: 3,           // 混一色
  fullFlush: 7,           // 清一色
  allSimples: 0,          // 斷么九 — 0 in old style, 1 in the new-style preset
  dragonPung: 1,          // 三元牌
  seatWindPung: 1,        // 門風
  roundWindPung: 1,       // 圈風
  smallThreeDragons: 5,   // 小三元
  bigThreeDragons: 8,     // 大三元
  smallFourWinds: 10,     // 小四喜
  bigFourWinds: 13,       // 大四喜
  allHonors: 10,          // 字一色
  mixedTerminals: 10,     // 混老頭
  allTerminals: 13,       // 清老頭
  thirteenOrphans: 13,    // 十三么
  nineGates: 13,          // 九蓮寶燈
  fourKongs: 13,          // 四槓子
  threeKongs: 2,          // 三槓子
  robbingKong: 1,         // 搶槓
  kongBloom: 1,           // 槓上開花
  lastTile: 1,            // 海底撈月 / 河底撈魚
  heavenly: 13,           // 天胡
  earthly: 13,            // 地胡
  seatFlower: 1,          // 正花
  flowerSet: 2,           // 花槓
  eightFlowers: 13,       // 八仙過海
  noFlowers: 0,           // 無花 (set to 1 to enable)
};

export const HK_DEFAULTS = {
  minFaan: 3,
  limitFaan: 13,
  payment: 'shooter-all',  // 'shooter-all' | 'half'
  seatFlowers: true,       // 正花 — off at any table size but four (see FIVE.md §4)
  dealerBonus: 1,          // multiplier on the dealer's win/loss (1 = none)
  baseUnit: 1,
  table: HK_TABLE,
};

/**
 * Classic Hong Kong ladder, in base units:
 * 0→1  1→2  2→4  3→8  4→16  5→24  6→32  7→48  8→64  9→96  10→128  11→192  12→256  13→384
 * (pure doubling to 4 faan, then alternating ×1.5 / ×4⁄3 so it doubles every two faan)
 */
export function faanToUnits(faan, opts) {
  if (faan < opts.minFaan) return 0;
  const f = Math.min(faan, opts.limitFaan);
  if (f <= 0) return opts.baseUnit;
  let u = 2;
  for (let i = 2; i <= f; i++) u *= i <= 4 ? 2 : (i % 2 ? 1.5 : 4 / 3);
  return Math.round(u * opts.baseUnit);
}

export function ladder(opts) {
  const rows = [];
  for (let f = opts.minFaan; f <= opts.limitFaan; f++) rows.push({ faan: f, units: faanToUnits(f, opts) });
  return rows;
}

export function scoreHK(ctx, options = {}) {
  const opts = { ...HK_DEFAULTS, ...options, table: { ...HK_TABLE, ...(options.table || {}) } };
  const T = opts.table;
  const melds = ctx.melds || [];
  const need = (ctx.setsNeeded || 4) - melds.length;
  const closed = melds.every((m) => !m.open);
  const res = checkWin(ctx.concealed, need, { thirteen: true, closed });
  if (!res.ok) return { win: false };

  const situational = [];
  const add = (key, zh, en, value) => { if (value) situational.push({ key, zh, en, value }); };

  if (ctx.flags?.heavenly) add('heavenly', '天胡', 'Heavenly hand', T.heavenly);
  else if (ctx.flags?.earthly) add('earthly', '地胡', 'Earthly hand', T.earthly);

  if (closed && ctx.selfDraw) add('concealedSelfDraw', '門清自摸', 'Concealed self-draw', T.concealedSelfDraw);
  else if (closed) add('concealedRon', '門前清', 'Fully concealed', T.concealedRon);
  else if (ctx.selfDraw) add('selfDraw', '自摸', 'Self-draw', T.selfDraw);

  if (ctx.flags?.robbingKong) add('robbingKong', '搶槓', 'Robbing the kong', T.robbingKong);
  if (ctx.flags?.rinshan) add('kongBloom', '槓上開花', 'Win on kong replacement', T.kongBloom);
  if (ctx.flags?.lastTile) add('lastTile', ctx.selfDraw ? '海底撈月' : '河底撈魚', 'Last tile of the wall', T.lastTile);

  // Eight bonus tiles onto four seats cannot be shared out evenly at five, so
  // 正花 is switched off there and only the seat-blind suites remain.
  const flowerSeat = opts.seatFlowers === false ? -1 : ctx.seatWind;
  for (const b of bonusScore(ctx.bonusTiles || [], flowerSeat, T)) situational.push(b);

  const kongCount = melds.filter((m) => m.type === 'kong').length;
  if (kongCount === 4) add('fourKongs', '四槓子', 'Four kongs', T.fourKongs);
  else if (kongCount === 3) add('threeKongs', '三槓子', 'Three kongs', T.threeKongs);

  const candidates = [];

  if (res.special === 'thirteen') {
    candidates.push([{ key: 'thirteenOrphans', zh: '十三么', en: 'Thirteen orphans', value: T.thirteenOrphans }]);
  } else {
    if (closed && isNineGates(ctx.concealed, melds)) {
      candidates.push([{ key: 'nineGates', zh: '九蓮寶燈', en: 'Nine gates', value: T.nineGates }]);
    }
    for (const d of res.decomps) candidates.push(patternsFor(shape(melds, d, ctx), ctx, T, melds));
  }

  let best = null;
  for (const pats of candidates) {
    const all = [...situational, ...pats];
    const faan = all.reduce((n, p) => n + p.value, 0);
    if (!best || faan > best.faan) best = { faan, patterns: all };
  }

  const raw = best.faan;
  const capped = Math.min(raw, opts.limitFaan);
  const units = faanToUnits(capped, opts);
  const eligible = capped >= opts.minFaan;

  return {
    win: true,
    unit: 'faan',
    value: capped,
    rawValue: raw,
    limit: capped >= opts.limitFaan,
    eligible,
    minimum: opts.minFaan,
    units,
    patterns: best.patterns,
    label: `${capped} faan${capped >= opts.limitFaan ? ' (limit)' : ''}`,
    deltas: eligible ? payments(units, ctx, opts) : new Array(ctx.seats || 4).fill(0),
  };
}

function patternsFor(sh, ctx, T, melds) {
  const out = [];
  const push = (key, zh, en, value) => { if (value) out.push({ key, zh, en, value }); };

  // honour sets first — the small/big families swallow the individual pungs
  const dragons = sh.dragonPungs.length;
  const winds = sh.windPungs.length;

  let honourFamily = false;
  if (dragons === 3) { push('bigThreeDragons', '大三元', 'Big three dragons', T.bigThreeDragons); honourFamily = true; }
  else if (dragons === 2 && sh.dragonPair) { push('smallThreeDragons', '小三元', 'Small three dragons', T.smallThreeDragons); honourFamily = true; }
  if (winds === 4) { push('bigFourWinds', '大四喜', 'Big four winds', T.bigFourWinds); honourFamily = true; }
  else if (winds === 3 && sh.windPair) { push('smallFourWinds', '小四喜', 'Small four winds', T.smallFourWinds); honourFamily = true; }

  if (dragons < 2 || !honourFamily) {
    for (const _s of sh.dragonPungs) push('dragonPung', '三元牌', 'Dragon pung', T.dragonPung);
  }
  if (winds < 3) {
    if (sh.seatWindPung) push('seatWindPung', '門風', 'Seat wind pung', T.seatWindPung);
    if (sh.roundWindPung) push('roundWindPung', '圈風', 'Round wind pung', T.roundWindPung);
  }

  // suit / structure families
  if (sh.allHonors) push('allHonors', '字一色', 'All honours', T.allHonors);
  else if (sh.allTerminals) push('allTerminals', '清老頭', 'All terminals', T.allTerminals);
  else if (sh.allEnds) push('mixedTerminals', '混老頭', 'Terminals and honours', T.mixedTerminals);
  else if (sh.oneSuit && !sh.hasHonor) push('fullFlush', '清一色', 'Full flush', T.fullFlush);
  else if (sh.oneSuit && sh.hasHonor) push('halfFlush', '混一色', 'Half flush', T.halfFlush);

  if (sh.allPungs && !sh.allHonors && !sh.allEnds) push('allPungs', '對對胡', 'All pungs', T.allPungs);
  if (sh.allChows) {
    push('allChows', '平和', 'All sequences', T.allChows);
    if (sh.allSimples) push('allSimples', '斷么九', 'All simples', T.allSimples);
  } else if (sh.allSimples) push('allSimples', '斷么九', 'All simples', T.allSimples);

  if (melds.length === (ctx.setsNeeded || 4) && melds.every((m) => m.open) && !ctx.selfDraw) {
    push('allMelded', '全求人', 'All melded, won on discard', T.allMelded);
  }
  void wind; void E;
  return out;
}

/**
 * Half-shooter, stated so it survives a change of table size: the bystanders
 * pay half a unit each and the shooter covers the balance. Holding the winner's
 * income at (n-1) units however the hand was won then fixes the shooter's share
 * at n/2 — which is 2 at four seats, exactly the printed rule.
 */
function payments(units, ctx, opts) {
  const n = ctx.seats || 4;
  const d = new Array(n).fill(0);
  const winner = ctx.seat;
  const mult = (seat) => (opts.dealerBonus !== 1 && (seat === ctx.dealer || winner === ctx.dealer) ? opts.dealerBonus : 1);
  if (ctx.selfDraw) {
    for (let s = 0; s < n; s++) {
      if (s === winner) continue;
      const amt = units * mult(s);
      d[s] -= amt; d[winner] += amt;
    }
  } else if (opts.payment === 'half') {
    for (let s = 0; s < n; s++) {
      if (s === winner) continue;
      const amt = s === ctx.discarder ? units * (n / 2) : units / 2;
      const v = Math.round(amt * mult(s));
      d[s] -= v; d[winner] += v;
    }
  } else {
    const amt = Math.round(units * (n - 1) * mult(ctx.discarder));
    d[ctx.discarder] -= amt; d[winner] += amt;
  }
  return d;
}
