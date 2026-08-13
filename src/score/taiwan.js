import { checkWin } from '../hand.js';
import { shape, bonusScore } from './util.js';
import { honor } from '../tiles.js';

/** Common Taiwanese 16-tile 台 values — house-rule territory, edit freely. */
export const TW_TABLE = {
  selfDraw: 1,            // 自摸
  concealedRon: 1,        // 門清
  concealedSelfDraw: 3,   // 門清自摸
  pinghu: 2,              // 平胡
  allMelded: 2,           // 全求人
  allPungs: 4,            // 對對胡
  threeConcealed: 2,      // 三暗刻
  fourConcealed: 5,       // 四暗刻
  fiveConcealed: 8,       // 五暗刻
  halfFlush: 4,           // 混一色
  fullFlush: 8,           // 清一色
  mixedTerminals: 4,      // 混么九
  allTerminals: 8,        // 清么九
  allHonors: 8,           // 字一色
  smallThreeDragons: 4,   // 小三元
  bigThreeDragons: 8,     // 大三元
  smallFourWinds: 8,      // 小四喜
  bigFourWinds: 16,       // 大四喜
  dragonPung: 1,          // 三元牌
  seatWindPung: 1,        // 門風
  roundWindPung: 1,       // 圈風
  threeKongs: 2,          // 三槓子
  fourKongs: 8,           // 四槓子
  robbingKong: 1,         // 搶槓
  kongBloom: 1,           // 槓上開花
  lastTile: 1,            // 海底撈月 / 河底撈魚
  heavenly: 24,           // 天胡
  earthly: 16,            // 地胡
  seatFlower: 1,          // 正花
  flowerSet: 2,           // 花槓
  eightFlowers: 8,        // 八仙過海
  noFlowers: 0,
  dealer: 1,              // 莊家
  continuation: 2,        // 連N拉N — per consecutive deal
};

export const TW_DEFAULTS = {
  base: 30,      // 底
  taiValue: 10,  // 台
  minTai: 0,
  limitTai: 0,   // 0 = uncapped
  table: TW_TABLE,
};

export function scoreTaiwan(ctx, options = {}) {
  const opts = { ...TW_DEFAULTS, ...options, table: { ...TW_TABLE, ...(options.table || {}) } };
  const T = opts.table;
  const melds = ctx.melds || [];
  const need = 5 - melds.length;
  const closed = melds.every((m) => !m.open);
  const res = checkWin(ctx.concealed, need, { thirteen: false, closed });
  if (!res.ok) return { win: false };

  const situational = [];
  const add = (key, zh, en, value) => { if (value) situational.push({ key, zh, en, value }); };

  if (ctx.flags?.heavenly) add('heavenly', '天胡', 'Heavenly hand', T.heavenly);
  else if (ctx.flags?.earthly) add('earthly', '地胡', 'Earthly hand', T.earthly);

  if (closed && ctx.selfDraw) add('concealedSelfDraw', '門清自摸', 'Concealed self-draw', T.concealedSelfDraw);
  else if (closed) add('concealedRon', '門清', 'Concealed hand', T.concealedRon);
  else if (ctx.selfDraw) add('selfDraw', '自摸', 'Self-draw', T.selfDraw);

  if (ctx.flags?.robbingKong) add('robbingKong', '搶槓', 'Robbing the kong', T.robbingKong);
  if (ctx.flags?.rinshan) add('kongBloom', '槓上開花', 'Win on kong replacement', T.kongBloom);
  if (ctx.flags?.lastTile) add('lastTile', '海底撈月', 'Last tile', T.lastTile);
  for (const b of bonusScore(ctx.bonusTiles || [], ctx.seatWind, T)) situational.push(b);

  const kongs = melds.filter((m) => m.type === 'kong').length;
  if (kongs === 4) add('fourKongs', '四槓子', 'Four kongs', T.fourKongs);
  else if (kongs === 3) add('threeKongs', '三槓子', 'Three kongs', T.threeKongs);

  let best = null;
  for (const d of res.decomps) {
    const sh = shape(melds, d, ctx);
    const pats = [...situational, ...patternsFor(sh, ctx, T, melds)];
    const tai = pats.reduce((n, p) => n + p.value, 0);
    if (!best || tai > best.tai) best = { tai, patterns: pats };
  }

  const tai = opts.limitTai ? Math.min(best.tai, opts.limitTai) : best.tai;
  const dealerTai = T.dealer + T.continuation * (ctx.continuation || 0);

  return {
    win: true,
    unit: 'tai',
    value: tai,
    eligible: tai >= opts.minTai,
    patterns: best.patterns,
    dealerTai,
    label: `${tai} 台`,
    units: opts.base + tai * opts.taiValue,
    deltas: payments(tai, dealerTai, ctx, opts),
  };
}

function patternsFor(sh, ctx, T, melds) {
  const out = [];
  const push = (key, zh, en, value) => { if (value) out.push({ key, zh, en, value }); };

  const dragons = sh.dragonPungs.length;
  const winds = sh.windPungs.length;
  let family = false;
  if (dragons === 3) { push('bigThreeDragons', '大三元', 'Big three dragons', T.bigThreeDragons); family = true; }
  else if (dragons === 2 && sh.dragonPair) { push('smallThreeDragons', '小三元', 'Small three dragons', T.smallThreeDragons); family = true; }
  if (winds === 4) { push('bigFourWinds', '大四喜', 'Big four winds', T.bigFourWinds); family = true; }
  else if (winds === 3 && sh.windPair) { push('smallFourWinds', '小四喜', 'Small four winds', T.smallFourWinds); family = true; }
  if (dragons < 2 || !family) for (const _s of sh.dragonPungs) push('dragonPung', '三元牌', 'Dragon pung', T.dragonPung);
  if (winds < 3) {
    if (sh.seatWindPung) push('seatWindPung', '門風', 'Seat wind pung', T.seatWindPung);
    if (sh.roundWindPung) push('roundWindPung', '圈風', 'Round wind pung', T.roundWindPung);
  }

  if (sh.allHonors) push('allHonors', '字一色', 'All honours', T.allHonors);
  else if (sh.allTerminals) push('allTerminals', '清么九', 'All terminals', T.allTerminals);
  else if (sh.allEnds) push('mixedTerminals', '混么九', 'Terminals and honours', T.mixedTerminals);
  else if (sh.oneSuit && !sh.hasHonor) push('fullFlush', '清一色', 'Full flush', T.fullFlush);
  else if (sh.oneSuit && sh.hasHonor) push('halfFlush', '混一色', 'Half flush', T.halfFlush);

  if (sh.allPungs && !sh.allHonors && !sh.allEnds) push('allPungs', '對對胡', 'All pungs', T.allPungs);
  if (sh.allChows && !honor(sh.pair)) push('pinghu', '平胡', 'All sequences', T.pinghu);

  const concealed = sh.concealedPungs.length;
  if (concealed >= 5) push('fiveConcealed', '五暗刻', 'Five concealed pungs', T.fiveConcealed);
  else if (concealed === 4) push('fourConcealed', '四暗刻', 'Four concealed pungs', T.fourConcealed);
  else if (concealed === 3) push('threeConcealed', '三暗刻', 'Three concealed pungs', T.threeConcealed);

  if (melds.length === 5 && melds.every((m) => m.open) && !ctx.selfDraw) {
    push('allMelded', '全求人', 'All melded, won on discard', T.allMelded);
  }
  return out;
}

function payments(tai, dealerTai, ctx, opts) {
  const d = [0, 0, 0, 0];
  const winner = ctx.seat;
  const amount = (payer) => {
    const extra = (winner === ctx.dealer || payer === ctx.dealer) ? dealerTai : 0;
    return opts.base + (tai + extra) * opts.taiValue;
  };
  if (ctx.selfDraw) {
    for (let s = 0; s < 4; s++) {
      if (s === winner) continue;
      const a = amount(s);
      d[s] -= a; d[winner] += a;
    }
  } else {
    const a = amount(ctx.discarder);
    d[ctx.discarder] -= a; d[winner] += a;
  }
  return d;
}
