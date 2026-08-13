// The in-app guide. Pattern values are read out of the LIVE scoring tables, so
// if you edit HK_TABLE or TW_TABLE for house rules the guide follows along.
import { VARIANTS, VARIANT_LIST } from './variants.js';

export const BASICS = [
  {
    zh: '牌', title: 'The tiles',
    body: 'Three suits run 1–9, four of each: 筒 dots, 索 bamboo, 萬 characters. '
      + 'Then honours — four winds 東南西北 and three dragons 中發白 — which have no sequence, only pairs and triplets. '
      + 'Hong Kong and Taiwanese sets add eight bonus tiles (flowers and seasons); they score on their own and are replaced the moment you draw one.',
    tiles: [0, 13, 22, 27, 31],
  },
  {
    zh: '和', title: 'What you are building',
    body: 'Four sets plus one pair (five sets plus a pair in Taiwanese). A set is a run of three in one suit, three of a kind, or four of a kind. '
      + 'Two special hands ignore that shape entirely: seven pairs, and thirteen orphans — one of every terminal and honour plus a duplicate.',
    tiles: [3, 4, 5, 20, 20, 20, 31, 31],
  },
  {
    zh: '打', title: 'Your turn',
    body: 'Draw a tile, then discard one — your hand stays the same size all game. Tap a tile to lift it, tap again to send it. '
      + 'Play passes counter-clockwise: to the player on your right on screen.',
  },
  {
    zh: '碰', title: 'Taking someone’s discard',
    body: 'Any discard you can use for a triplet (碰 pung) or a kong (槓) is yours to claim, from anyone. A run (上 chow) can only be claimed from the player to your left. '
      + 'Claiming exposes that set face-up and skips play to you — which costs you the concealed-hand bonuses, so it is a real trade, not free value.',
  },
  {
    zh: '胡', title: 'Winning',
    body: 'Complete your hand on your own draw (自摸 self-draw) or on someone else’s discard. A win beats a pung, and a pung beats a chow, whoever called first. '
      + 'The app only offers you buttons for what is actually legal — if 胡 is not lit, that hand does not win yet.',
  },
  {
    zh: '流', title: 'When nobody wins',
    body: 'If the wall runs out the hand is drawn (流局). What happens next depends on the ruleset — see the differences below.',
  },
];

// zh + en for every key that can appear in an HK or Taiwanese scoring table.
export const PATTERN_LABELS = {
  selfDraw: ['自摸', 'Self-draw', 'You drew the winning tile yourself.'],
  concealedRon: ['門前清', 'Concealed hand', 'Nothing claimed from a discard.'],
  concealedSelfDraw: ['門清自摸', 'Concealed self-draw', 'Replaces the two above when both apply.'],
  allChows: ['平和', 'All sequences', 'Four runs and a pair, no triplets.'],
  pinghu: ['平胡', 'All sequences', 'Five runs and a pair, no triplets.'],
  allPungs: ['對對和', 'All triplets', 'Every set is a pung or kong.'],
  allMelded: ['全求人', 'All claimed', 'Every set claimed; you win on a discard.'],
  threeConcealed: ['三暗刻', 'Three concealed triplets', ''],
  fourConcealed: ['四暗刻', 'Four concealed triplets', ''],
  fiveConcealed: ['五暗刻', 'Five concealed triplets', ''],
  halfFlush: ['混一色', 'Half flush', 'One suit plus honours.'],
  fullFlush: ['清一色', 'Full flush', 'One suit, no honours.'],
  allSimples: ['斷么九', 'All simples', 'No terminals (1s and 9s) and no honours.'],
  dragonPung: ['三元牌', 'Dragon triplet', 'Scores per dragon set.'],
  seatWindPung: ['門風', 'Seat wind triplet', 'Your own wind.'],
  roundWindPung: ['圈風', 'Round wind triplet', 'The prevailing wind.'],
  smallThreeDragons: ['小三元', 'Small three dragons', 'Two dragon sets plus the third as your pair.'],
  bigThreeDragons: ['大三元', 'Big three dragons', 'All three dragon sets.'],
  smallFourWinds: ['小四喜', 'Small four winds', 'Three wind sets plus the fourth as your pair.'],
  bigFourWinds: ['大四喜', 'Big four winds', 'All four wind sets.'],
  allHonors: ['字一色', 'All honours', 'Winds and dragons only.'],
  mixedTerminals: ['混老頭', 'Terminals and honours', 'Only 1s, 9s and honours.'],
  allTerminals: ['清老頭', 'All terminals', 'Only 1s and 9s.'],
  thirteenOrphans: ['十三么', 'Thirteen orphans', 'One of each terminal and honour, plus a pair of any of them.'],
  nineGates: ['九蓮寶燈', 'Nine gates', '1112345678999 in one suit, concealed, plus any tile of it.'],
  fourKongs: ['四槓子', 'Four kongs', ''],
  threeKongs: ['三槓子', 'Three kongs', ''],
  robbingKong: ['搶槓', 'Robbing the kong', 'You win on the tile someone added to a triplet.'],
  kongBloom: ['槓上開花', 'Kong replacement', 'You win on the tile drawn after a kong.'],
  lastTile: ['海底/河底', 'Last tile', 'The final draw of the wall, or the final discard.'],
  heavenly: ['天和', 'Heavenly hand', 'Dealer wins on the opening deal.'],
  earthly: ['地和', 'Earthly hand', 'You win on the dealer’s first discard.'],
  seatFlower: ['正花', 'Your own flower', 'The flower or season matching your seat.'],
  flowerSet: ['花槓', 'Flower set', 'All four flowers, or all four seasons.'],
  eightFlowers: ['八仙過海', 'All eight bonus tiles', ''],
  noFlowers: ['無花', 'No flowers', 'Off by default — set to 1 to enable.'],
  dealer: ['莊家', 'Dealer', 'Applies to hands the dealer is paying or collecting.'],
  continuation: ['連莊', 'Dealer streak', 'Per consecutive deal the dealer holds.'],
};

// Riichi han is decided in code rather than a table; this mirrors what
// src/score/riichi.js actually awards. c = closed hand only.
export const RIICHI_YAKU = [
  ['立直', 'Riichi', '1', 'c', 'Declare when ready with a concealed hand; costs a 1000 stick.'],
  ['ダブル立直', 'Double riichi', '2', 'c', 'Riichi on your very first discard.'],
  ['一発', 'Ippatsu', '1', 'c', 'Win within one go-around of declaring.'],
  ['門前清自摸和', 'Fully concealed self-draw', '1', 'c', ''],
  ['平和', 'Pinfu', '1', 'c', 'All runs, a two-sided wait, no scoring pair.'],
  ['断幺九', 'All simples', '1', '', ''],
  ['役牌', 'Dragon / wind triplet', '1', '', 'Per dragon set, plus round wind and seat wind.'],
  ['一盃口', 'Identical sequences', '1', 'c', ''],
  ['嶺上開花', 'Kong replacement', '1', '', ''],
  ['搶槓', 'Robbing the kong', '1', '', ''],
  ['海底摸月', 'Last tile drawn', '1', '', ''],
  ['河底撈魚', 'Last discard', '1', '', ''],
  ['三色同順', 'Three colour straight', '2 / 1', '', 'One less han when the hand is open.'],
  ['一気通貫', 'Pure straight', '2 / 1', '', '1-9 in one suit. One less when open.'],
  ['混全帯幺九', 'Terminal or honour in all sets', '2 / 1', '', ''],
  ['七対子', 'Seven pairs', '2', 'c', 'Fixed 25 fu.'],
  ['対々和', 'All triplets', '2', '', ''],
  ['三暗刻', 'Three concealed triplets', '2', '', ''],
  ['三色同刻', 'Three colour triplets', '2', '', ''],
  ['三槓子', 'Three kongs', '2', '', ''],
  ['小三元', 'Small three dragons', '2', '', ''],
  ['混老頭', 'Terminals and honours', '2', '', ''],
  ['純全帯幺九', 'Terminals in all sets', '3 / 2', '', ''],
  ['二盃口', 'Two identical sequences ×2', '3', 'c', ''],
  ['混一色', 'Half flush', '3 / 2', '', ''],
  ['清一色', 'Full flush', '6 / 5', '', ''],
  ['ドラ', 'Dora', '+1 each', '', 'Not a yaku — you still need a real one to win.'],
];

export const RIICHI_YAKUMAN = [
  ['国士無双', 'Thirteen orphans', 'Double for a 13-tile wait.'],
  ['四暗刻', 'Four concealed triplets', 'Double on a single-tile wait.'],
  ['大三元', 'Big three dragons', ''],
  ['小四喜', 'Small four winds', ''],
  ['大四喜', 'Big four winds', 'Double.'],
  ['字一色', 'All honours', ''],
  ['清老頭', 'All terminals', ''],
  ['緑一色', 'All green', ''],
  ['九蓮宝燈', 'Nine gates', 'Double on the nine-sided wait.'],
  ['四槓子', 'Four kongs', ''],
  ['天和 / 地和', 'Heavenly / earthly hand', ''],
];

export const RIICHI_LIMITS = [
  ['5 han', 'Mangan', '8000'],
  ['6–7 han', 'Haneman', '12000'],
  ['8–10 han', 'Baiman', '16000'],
  ['11–12 han', 'Sanbaiman', '24000'],
  ['13+ han', 'Yakuman', '32000'],
];

function patternsFor(v) {
  if (v.scorer === 'riichi') return null;
  const t = v.scoring.table;
  // zero-valued rows are kept for now; guideData() drops them unless a sibling
  // ruleset scores them, so "New Style pays for this and Old Style doesn't"
  // stays visible instead of silently vanishing
  return Object.entries(t)
    .map(([key, value]) => {
      const [zh, en, note] = PATTERN_LABELS[key] || [key, key, ''];
      return { key, zh, en, note, value };
    })
    .sort((a, b) => b.value - a.value || a.en.localeCompare(b.en));
}

function shortRows(v) {
  const s = v.scoring || {};
  const hk = v.scorer === 'hk', tw = v.scorer === 'taiwan', jp = v.scorer === 'riichi';
  return {
    'Tiles in hand': String(v.handSize),
    'Hand shape': `${v.setsNeeded} sets + pair`,
    'Bonus tiles': v.bonusTiles ? '8 flowers/seasons' : 'none',
    'Special hands': [v.thirteenOrphans ? '13 orphans' : '', v.sevenPairs ? '7 pairs' : '']
      .filter(Boolean).join(', ') || 'none',
    'Scores in': hk ? 'faan' : tw ? '底 + 台' : 'han + fu',
    'Minimum to win': hk ? `${s.minFaan} faan` : tw ? (s.minTai ? `${s.minTai} tai` : 'none') : 'one yaku',
    'Limit': hk ? `${s.limitFaan} faan` : tw ? (s.limitTai ? `${s.limitTai} tai` : 'none') : 'yakuman',
    'Discard pays': hk ? (s.payment === 'half' ? 'shooter ×2, others ¼' : 'shooter alone')
      : tw ? 'shooter alone' : 'shooter alone',
    'Self-draw pays': hk ? 'all three, equally'
      : tw ? 'all three, in full' : 'all three, dealer more',
    'Drawn hand': v.notenPenalty ? `${v.notenPenalty} noten penalty` : 'nobody pays',
    'Dealer keeps deal': v.dealerRepeatsOnWin && v.dealerRepeatsOnDraw ? 'on a win or a draw'
      : v.dealerRepeatsOnWin ? 'on a win only' : 'never',
    'Riichi / dora': jp ? 'both, plus furiten' : 'no',
    'Starting score': String(v.startScore),
  };
}

const ROW_ORDER = ['Tiles in hand', 'Hand shape', 'Bonus tiles', 'Special hands', 'Scores in',
  'Minimum to win', 'Limit', 'Discard pays', 'Self-draw pays', 'Drawn hand',
  'Dealer keeps deal', 'Riichi / dora', 'Starting score'];

export function guideData() {
  const data = {
    basics: BASICS,
    riichi: { yaku: RIICHI_YAKU, yakuman: RIICHI_YAKUMAN, limits: RIICHI_LIMITS },
    variants: VARIANT_LIST.map(({ id }) => {
      const v = VARIANTS[id];
      return {
        id,
        name: v.name,
        zh: v.zh,
        blurb: v.blurb,
        scorer: v.scorer,
        unit: v.scorer === 'riichi' ? 'han' : v.scorer === 'taiwan' ? 'tai' : 'faan',
        rows: shortRows(v),
        patterns: patternsFor(v),
        ladder: v.scorer === 'hk'
          ? Array.from({ length: (v.scoring.limitFaan || 13) + 1 }, (_, f) => [f, faanUnits(f)])
          : null,
      };
    }),
  };

  // side-by-side matrix: read across a row to see what the ruleset changes
  data.columns = data.variants.map((v) => ({ id: v.id, zh: v.zh, name: v.name }));
  data.matrix = ROW_ORDER.map((label) => {
    const cells = data.variants.map((v) => v.rows[label] ?? '—');
    const counts = new Map();
    for (const c of cells) counts.set(c, (counts.get(c) || 0) + 1);
    const common = [...counts].sort((a, b) => b[1] - a[1])[0];
    // an odd-one-out is what you actually want to spot at the table
    return { label, cells, varies: counts.size > 1, common: counts.size > 1 ? common[0] : null };
  });

  // the patterns each ruleset scores differently from the others
  const byKey = new Map();
  for (const v of data.variants) {
    for (const p of v.patterns || []) {
      if (!byKey.has(p.key)) byKey.set(p.key, new Map());
      byKey.get(p.key).set(v.id, p.value);
    }
  }
  const scoringVariants = data.variants.filter((v) => v.patterns);
  for (const v of scoringVariants) {
    for (const p of v.patterns) {
      const vals = byKey.get(p.key);
      // only compare rulesets that score in the same currency — faan against
      // tai is meaningless and would flag every single row
      const others = scoringVariants.filter((x) => x.id !== v.id && x.unit === v.unit);
      const differing = others
        .filter((x) => vals.get(x.id) !== p.value)
        .map((x) => ({ zh: x.zh, value: vals.get(x.id) ?? null }));
      if (differing.length) p.elsewhere = differing;
    }
    v.patterns = v.patterns.filter((p) => p.value > 0 || p.elsewhere?.some((e) => e.value > 0));
  }
  return data;
}

// mirrors faanToUnits' default ladder for display purposes
function faanUnits(faan) {
  const L = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];
  return L[Math.min(faan, L.length - 1)];
}
