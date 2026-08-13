import { checkWin, isSevenPairs, isThirteenOrphans } from '../hand.js';
import { shape, setTiles, isNineGates } from './util.js';
import { suit, rank, suited, honor, wind, dragon, majorMinor, E, RED, WHITE, GREEN } from '../tiles.js';

export const RIICHI_DEFAULTS = {
  startScore: 25000,
  riichiCost: 1000,
  honbaValue: 300,
  notenPenalty: 3000,
  uraDora: true,
  doubleYakuman: true,
  kuitanAllowed: true,
};

const GREEN_TILES = new Set([10, 11, 12, 14, 16, GREEN]); // s2 s3 s4 s6 s8 發

export function doraOf(indicator) {
  if (suited(indicator)) {
    const r = rank(indicator);
    return r === 9 ? indicator - 8 : indicator + 1;
  }
  if (wind(indicator)) return indicator === 30 ? E : indicator + 1;
  return indicator === WHITE ? RED : indicator + 1;
}

export function scoreRiichi(ctx, options = {}) {
  const opts = { ...RIICHI_DEFAULTS, ...options };
  const melds = ctx.melds || [];
  const need = 4 - melds.length;
  const closed = melds.every((m) => !m.open);
  const res = checkWin(ctx.concealed, need, { thirteen: true, sevenPairs: true, closed });
  if (!res.ok) return { win: false };

  const f = ctx.flags || {};
  const allTiles = [...tilesOf(ctx.concealed), ...melds.flatMap(setTiles)];
  const doraCount = countDora(allTiles, ctx.doraIndicators || [])
    + (f.riichi && opts.uraDora ? countDora(allTiles, ctx.uraIndicators || []) : 0);

  let best = null;

  const yakumanBase = (list) => {
    const mult = list.reduce((n, y) => n + (y.double && opts.doubleYakuman ? 2 : 1), 0);
    return { han: 13 * mult, fu: 0, yaku: list, dora: 0, yakuman: mult, limitName: mult > 1 ? `${mult}× Yakuman` : 'Yakuman' };
  };

  if (res.special === 'thirteen') {
    const thirteenWait = isThirteenOrphans(ctx.concealed) && ctx.concealed[ctx.winTile] === 2;
    best = yakumanBase([{ key: 'kokushi', zh: '国士無双', en: 'Thirteen orphans', double: thirteenWait && opts.doubleYakuman }]);
    if (f.tenhou) best.yaku.push({ key: 'tenhou', zh: '天和', en: 'Heavenly hand' });
  } else {
    const interps = [];
    if (res.special === 'sevenPairs') {
      interps.push({ chiitoi: true, waitType: 'tanki' });
    } else {
      for (const d of res.decomps) {
        const sh = shape(melds, d, ctx);
        for (const it of interpretations(sh, ctx)) interps.push({ sh, ...it });
      }
    }
    for (const it of interps) {
      const ev = evaluate(it, ctx, closed, opts, doraCount);
      if (!ev) continue;
      const pts = pointValue(ev.han, ev.fu, ev.yakuman);
      if (!best || pts.base > (best.points?.base ?? -1) || (pts.base === best.points?.base && ev.fu > best.fu)) {
        best = { ...ev, points: pts };
      }
    }
    if (!best) return { win: false, reason: 'no yaku' };
  }

  const pts = best.points || pointValue(best.han, best.fu, best.yakuman);
  const { deltas, potClaimed } = payments(pts.base, ctx, opts);

  return {
    win: true,
    unit: 'han',
    value: best.han,
    fu: best.fu,
    yakuman: best.yakuman || 0,
    patterns: [
      ...best.yaku.map((y) => ({ key: y.key, zh: y.zh, en: y.en, value: y.han ?? '' })),
      ...(best.dora ? [{ key: 'dora', zh: 'ドラ', en: 'Dora', value: best.dora }] : []),
    ],
    label: best.yakuman
      ? best.limitName
      : `${best.han} han / ${best.fu} fu${pts.name ? ` — ${pts.name}` : ''}`,
    units: pts.base,
    limitName: pts.name || best.limitName || null,
    eligible: true,
    deltas,
    potClaimed,
  };
}

function tilesOf(counts) {
  const out = [];
  for (let t = 0; t < 34; t++) for (let i = 0; i < counts[t]; i++) out.push(t);
  return out;
}

function countDora(tiles, indicators) {
  if (!indicators.length) return 0;
  const wanted = indicators.map(doraOf);
  let n = 0;
  for (const t of tiles) for (const d of wanted) if (t === d) n++;
  return n;
}

function interpretations(sh, ctx) {
  const wt = ctx.winTile;
  const out = [];
  if (sh.pair === wt) out.push({ kind: 'pair', waitType: 'tanki' });
  sh.sets.forEach((s, i) => {
    if (s.declared) return;
    if (s.type === 'chow') {
      if (wt === s.tile + 1) out.push({ kind: 'chow', i, waitType: 'kanchan' });
      else if (wt === s.tile) out.push({ kind: 'chow', i, waitType: rank(s.tile) === 7 ? 'penchan' : 'ryanmen' });
      else if (wt === s.tile + 2) out.push({ kind: 'chow', i, waitType: rank(s.tile) === 1 ? 'penchan' : 'ryanmen' });
    } else if (s.type === 'pung' && s.tile === wt) {
      out.push({ kind: 'pung', i, waitType: 'shanpon' });
    }
  });
  return out.length ? out : [{ kind: 'none', waitType: 'tanki' }];
}

function isYakuhai(t, ctx) {
  return dragon(t) || t === E + ctx.roundWind || t === E + ctx.seatWind;
}

function evaluate(it, ctx, closed, opts, doraCount) {
  const f = ctx.flags || {};
  const yaku = [];
  const push = (key, zh, en, han) => yaku.push({ key, zh, en, han });
  let yakuman = 0;
  const yakumanList = [];
  const ym = (key, zh, en, double = false) => { yakumanList.push({ key, zh, en, double }); };

  if (it.chiitoi) {
    // seven pairs: fixed 25 fu, limited yaku set
    const c = ctx.concealed;
    const tiles = tilesOf(c);
    const allEnds = tiles.every(majorMinor);
    const suitsUsed = new Set(tiles.filter(suited).map(suit));
    const hasHonor = tiles.some(honor);
    if (f.tenhou) ym('tenhou', '天和', 'Heavenly hand');
    if (f.chiihou) ym('chiihou', '地和', 'Earthly hand');
    if (suitsUsed.size === 0) ym('tsuuiisou', '字一色', 'All honours');
    if (yakumanList.length) {
      const uniq = dedupe(yakumanList);
      const mult = uniq.reduce((n, y) => n + (y.double && opts.doubleYakuman ? 2 : 1), 0);
      return { han: 13 * mult, fu: 25, yaku: uniq, dora: 0, yakuman: mult, limitName: mult > 1 ? `${mult}× Yakuman` : 'Yakuman' };
    }
    push('chiitoitsu', '七対子', 'Seven pairs', 2);
    if (f.riichi) push(f.doubleRiichi ? 'doubleRiichi' : 'riichi', f.doubleRiichi ? 'ダブル立直' : '立直', f.doubleRiichi ? 'Double riichi' : 'Riichi', f.doubleRiichi ? 2 : 1);
    if (f.ippatsu) push('ippatsu', '一発', 'Ippatsu', 1);
    if (closed && ctx.selfDraw) push('tsumo', '門前清自摸和', 'Fully concealed self-draw', 1);
    if (tiles.every((t) => !majorMinor(t))) push('tanyao', '断幺九', 'All simples', 1);
    if (allEnds) push('honroutou', '混老頭', 'Terminals and honours', 2);
    if (suitsUsed.size === 1) push(hasHonor ? 'honitsu' : 'chinitsu', hasHonor ? '混一色' : '清一色', hasHonor ? 'Half flush' : 'Full flush', hasHonor ? 3 : 6);
    for (const s of situational(f)) yaku.push(s);
    const han = yaku.reduce((n, y) => n + y.han, 0) + doraCount;
    if (!yaku.length) return null;
    return { han, fu: 25, yaku, dora: doraCount, yakuman: 0 };
  }

  const sh = it.sh;
  const sets = sh.sets.map((s, i) => ({
    ...s,
    openFu: s.open || (it.kind === 'pung' && it.i === i && !ctx.selfDraw),
  }));
  const pungs = sets.filter((s) => s.type !== 'chow');
  const chows = sets.filter((s) => s.type === 'chow');
  const kongs = sets.filter((s) => s.type === 'kong');
  const concealedPungs = pungs.filter((s) => !s.openFu);

  // ---- yakuman ----
  if (f.tenhou) ym('tenhou', '天和', 'Heavenly hand');
  if (f.chiihou) ym('chiihou', '地和', 'Earthly hand');
  if (sh.dragonPungs.length === 3) ym('daisangen', '大三元', 'Big three dragons');
  if (sh.windPungs.length === 4) ym('daisuushii', '大四喜', 'Big four winds', true);
  else if (sh.windPungs.length === 3 && sh.windPair) ym('shousuushii', '小四喜', 'Small four winds');
  if (sh.noSuits) ym('tsuuiisou', '字一色', 'All honours');
  if (sh.allTerminals) ym('chinroutou', '清老頭', 'All terminals');
  if (sh.tiles.every((t) => GREEN_TILES.has(t))) ym('ryuuiisou', '緑一色', 'All green');
  if (concealedPungs.length === 4) ym('suuankou', '四暗刻', 'Four concealed pungs', it.waitType === 'tanki');
  if (kongs.length === 4) ym('suukantsu', '四槓子', 'Four kongs');
  if (closed && isNineGates(ctx.concealed, [])) {
    const c = ctx.concealed.slice();
    c[ctx.winTile]--;
    let nineWait = true;
    for (let r = 0; r < 9; r++) {
      const t = suit(ctx.winTile) * 9 + r;
      const min = r === 0 || r === 8 ? 3 : 1;
      if (c[t] < min) nineWait = false;
    }
    ym('chuuren', '九蓮宝燈', 'Nine gates', nineWait);
  }
  if (yakumanList.length) {
    const uniq = dedupe(yakumanList);
    const mult = uniq.reduce((n, y) => n + (y.double && opts.doubleYakuman ? 2 : 1), 0);
    return { han: 13 * mult, fu: 0, yaku: uniq, dora: 0, yakuman: mult, limitName: mult > 1 ? `${mult}× Yakuman` : 'Yakuman' };
  }

  // ---- regular yaku ----
  if (f.riichi) push(f.doubleRiichi ? 'doubleRiichi' : 'riichi', f.doubleRiichi ? 'ダブル立直' : '立直', f.doubleRiichi ? 'Double riichi' : 'Riichi', f.doubleRiichi ? 2 : 1);
  if (f.ippatsu) push('ippatsu', '一発', 'Ippatsu', 1);
  if (closed && ctx.selfDraw) push('tsumo', '門前清自摸和', 'Fully concealed self-draw', 1);
  for (const s of situational(f)) yaku.push(s);

  const yakuhaiPair = isYakuhai(sh.pair, ctx);
  const pinfu = closed && sh.allChows && !yakuhaiPair && it.waitType === 'ryanmen';
  if (pinfu) push('pinfu', '平和', 'Pinfu', 1);
  if (sh.allSimples) push('tanyao', '断幺九', 'All simples', 1);
  for (const s of sh.dragonPungs) push('yakuhai', `役牌 ${['中', '發', '白'][s.tile - RED]}`, 'Dragon pung', 1);
  if (sh.roundWindPung) push('yakuhai-round', '場風', 'Round wind pung', 1);
  if (sh.seatWindPung) push('yakuhai-seat', '自風', 'Seat wind pung', 1);

  const chowKeys = chows.map((s) => s.tile);
  if (hasSanshokuDoujun(chowKeys)) push('sanshoku', '三色同順', 'Three colour straight', closed ? 2 : 1);
  if (hasIttsu(chowKeys)) push('ittsu', '一気通貫', 'Pure straight', closed ? 2 : 1);

  const setsWithPair = [...sets.map(setTiles), [sh.pair]];
  const everySetHasEnd = setsWithPair.every((ts) => ts.some(majorMinor));
  const everySetHasTerminal = setsWithPair.every((ts) => ts.some((t) => suited(t) && (rank(t) === 1 || rank(t) === 9)));
  if (!sh.allEnds) {
    if (everySetHasTerminal && !sh.hasHonor) push('junchan', '純全帯幺九', 'Terminals in all sets', closed ? 3 : 2);
    else if (everySetHasEnd && chows.length > 0) push('chanta', '混全帯幺九', 'Terminal or honour in all sets', closed ? 2 : 1);
  }
  if (sh.allEnds) push('honroutou', '混老頭', 'Terminals and honours', 2);
  if (sh.oneSuit) push(sh.hasHonor ? 'honitsu' : 'chinitsu', sh.hasHonor ? '混一色' : '清一色',
    sh.hasHonor ? 'Half flush' : 'Full flush', sh.hasHonor ? (closed ? 3 : 2) : (closed ? 6 : 5));
  if (sh.allPungs) push('toitoi', '対々和', 'All pungs', 2);
  if (concealedPungs.length === 3) push('sanankou', '三暗刻', 'Three concealed pungs', 2);
  if (hasSanshokuDoukou(pungs.map((s) => s.tile))) push('sanshoku-doukou', '三色同刻', 'Three colour triplets', 2);
  if (kongs.length === 3) push('sankantsu', '三槓子', 'Three kongs', 2);
  if (sh.dragonPungs.length === 2 && sh.dragonPair) push('shousangen', '小三元', 'Small three dragons', 2);
  if (closed) {
    const dup = countIdenticalChows(chowKeys);
    if (dup >= 2) push('ryanpeikou', '二盃口', 'Two identical sequences ×2', 3);
    else if (dup === 1) push('iipeikou', '一盃口', 'Identical sequences', 1);
  }

  if (!yaku.length) return null;

  const fu = it.chiitoi ? 25 : computeFu({ sets, sh, it, ctx, closed, pinfu, yakuhaiPair });
  const han = yaku.reduce((n, y) => n + y.han, 0) + doraCount;
  return { han, fu, yaku, dora: doraCount, yakuman: 0 };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((y) => (seen.has(y.key) ? false : (seen.add(y.key), true)));
}

function situational(f) {
  const out = [];
  if (f.rinshan) out.push({ key: 'rinshan', zh: '嶺上開花', en: 'Kong replacement', han: 1 });
  if (f.chankan) out.push({ key: 'chankan', zh: '搶槓', en: 'Robbing the kong', han: 1 });
  if (f.haitei) out.push({ key: 'haitei', zh: '海底摸月', en: 'Last tile drawn', han: 1 });
  if (f.houtei) out.push({ key: 'houtei', zh: '河底撈魚', en: 'Last discard', han: 1 });
  return out;
}

function hasSanshokuDoujun(chowTiles) {
  for (let r = 0; r < 7; r++) {
    let n = 0;
    for (let s = 0; s < 3; s++) if (chowTiles.includes(s * 9 + r)) n++;
    if (n === 3) return true;
  }
  return false;
}

function hasSanshokuDoukou(pungTiles) {
  for (let r = 0; r < 9; r++) {
    let n = 0;
    for (let s = 0; s < 3; s++) if (pungTiles.includes(s * 9 + r)) n++;
    if (n === 3) return true;
  }
  return false;
}

function hasIttsu(chowTiles) {
  for (let s = 0; s < 3; s++) {
    if (chowTiles.includes(s * 9) && chowTiles.includes(s * 9 + 3) && chowTiles.includes(s * 9 + 6)) return true;
  }
  return false;
}

function countIdenticalChows(chowTiles) {
  const m = new Map();
  for (const t of chowTiles) m.set(t, (m.get(t) || 0) + 1);
  let pairs = 0;
  for (const n of m.values()) pairs += Math.floor(n / 2);
  return pairs;
}

function computeFu({ sets, sh, it, ctx, closed, pinfu, yakuhaiPair }) {
  if (pinfu) return 20;
  let fu = 20;
  if (closed && !ctx.selfDraw) fu += 10;
  if (ctx.selfDraw) fu += 2;
  for (const s of sets) {
    const yao = majorMinor(s.tile);
    if (s.type === 'pung') fu += s.openFu ? (yao ? 4 : 2) : (yao ? 8 : 4);
    else if (s.type === 'kong') fu += s.open ? (yao ? 16 : 8) : (yao ? 32 : 16);
  }
  if (yakuhaiPair) {
    if (dragon(sh.pair)) fu += 2;
    else {
      if (sh.pair === E + ctx.roundWind) fu += 2;
      if (sh.pair === E + ctx.seatWind) fu += 2;
    }
  }
  if (it.waitType === 'kanchan' || it.waitType === 'penchan' || it.waitType === 'tanki') fu += 2;
  return Math.ceil(fu / 10) * 10;
}

export function pointValue(han, fu, yakuman) {
  if (yakuman) return { base: 8000 * yakuman, name: yakuman > 1 ? `${yakuman}× Yakuman` : 'Yakuman' };
  if (han >= 13) return { base: 8000, name: 'Kazoe yakuman' };
  if (han >= 11) return { base: 6000, name: 'Sanbaiman' };
  if (han >= 8) return { base: 4000, name: 'Baiman' };
  if (han >= 6) return { base: 3000, name: 'Haneman' };
  const b = fu * Math.pow(2, 2 + han);
  if (han >= 5 || b >= 2000) return { base: 2000, name: 'Mangan' };
  return { base: b, name: null };
}

const ceil100 = (x) => Math.ceil(x / 100) * 100;

function payments(base, ctx, opts) {
  const d = [0, 0, 0, 0];
  const w = ctx.seat;
  const dealerWin = w === ctx.dealer;
  const honba = ctx.honba || 0;
  if (ctx.selfDraw) {
    for (let s = 0; s < 4; s++) {
      if (s === w) continue;
      const share = dealerWin || s === ctx.dealer ? base * 2 : base;
      const v = ceil100(share) + 100 * honba;
      d[s] -= v; d[w] += v;
    }
  } else {
    const amt = ceil100(base * (dealerWin ? 6 : 4)) + opts.honbaValue * honba;
    d[ctx.discarder] -= amt; d[w] += amt;
  }
  const pot = ctx.riichiPot || 0;
  d[w] += pot;
  return { deltas: d, potClaimed: pot };
}
