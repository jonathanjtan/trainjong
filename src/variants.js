import { HK_TABLE } from './score/hk.js';
import { TW_TABLE } from './score/taiwan.js';

/**
 * A variant is data, not code. Add one by copying a block and pointing
 * `scorer` at hk | taiwan | riichi.
 */
export const VARIANTS = {
  'hk-old': {
    id: 'hk-old',
    name: 'Hong Kong Old Style',
    zh: '香港舊章',
    blurb: '13 tiles, faan scoring, 3 faan minimum. The default table game.',
    handSize: 13,
    setsNeeded: 4,
    bonusTiles: true,
    thirteenOrphans: true,
    sevenPairs: false,
    riichi: false,
    deadWallSize: 0,
    dora: false,
    scorer: 'hk',
    startScore: 0,
    scoring: { minFaan: 3, limitFaan: 13, payment: 'shooter-all', baseUnit: 1, table: HK_TABLE },
    dealerRepeatsOnWin: true,
    dealerRepeatsOnDraw: true,
    flowerReplacementCountsAsKong: true,
    chowFromLeftOnly: true,
    notenPenalty: 0,
  },

  'hk-new': {
    id: 'hk-new',
    name: 'Hong Kong New Style',
    zh: '香港新章',
    blurb: 'Same engine, 10 faan limit, all-simples pays, half-shooter payments.',
    handSize: 13,
    setsNeeded: 4,
    bonusTiles: true,
    thirteenOrphans: true,
    sevenPairs: false,
    riichi: false,
    deadWallSize: 0,
    dora: false,
    scorer: 'hk',
    startScore: 0,
    scoring: {
      minFaan: 3, limitFaan: 10, payment: 'half', baseUnit: 1,
      table: { ...HK_TABLE, allSimples: 1, allHonors: 10, smallFourWinds: 6, mixedTerminals: 6 },
    },
    dealerRepeatsOnWin: true,
    dealerRepeatsOnDraw: true,
    flowerReplacementCountsAsKong: true,
    chowFromLeftOnly: true,
    notenPenalty: 0,
  },

  /**
   * 五方 — Hong Kong New Style for five seats. Seats run 東南西北中, which is
   * the standard five-direction set and already in the box, so a seat honour is
   * still just `E + seatWind`. The five tuned numbers all pay for one fact:
   * a fifth hand takes 13 tiles off the wall AND adds a fifth mouth to the
   * queue, so everybody draws ~15 times instead of ~22. See FIVE.md.
   */
  'hk-new-5': {
    id: 'hk-new-5',
    name: 'Five Directions',
    zh: '五方',
    blurb: 'Five seats 東南西北中, 13 tiles, 2 faan minimum, tenpai penalty at the draw.',
    seats: 5,
    handSize: 13,
    setsNeeded: 4,
    bonusTiles: true,
    thirteenOrphans: true,
    sevenPairs: false,
    riichi: false,
    deadWallSize: 0,
    dora: false,
    scorer: 'hk',
    startScore: 0,
    scoring: {
      minFaan: 2,          // 3 is unreachable in 15 draws — the table just folds
      limitFaan: 10,
      payment: 'half',     // bystanders ½ unit each, shooter covers the balance
      baseUnit: 2,         // keeps the odd-seat halves integral
      seatFlowers: false,  // 8 flowers do not divide by 5 seats
      table: {
        ...HK_TABLE,
        allSimples: 1,     // new style
        allChows: 2,       // chow supply fell by a third; pung supply did not
        allHonors: 10, smallFourWinds: 6, mixedTerminals: 6,
      },
    },
    dealerRepeatsOnWin: true,
    dealerRepeatsOnDraw: false,
    dealerRepeatsIfTenpai: true,
    flowerReplacementCountsAsKong: true,
    chowFromLeftOnly: true,
    notenPenalty: 4,       // raw points = 2 units at baseUnit 2
    notenPairwise: true,   // each noten seat pays each tenpai seat
  },

  'taiwan-16': {
    id: 'taiwan-16',
    name: 'Taiwanese 16-tile',
    zh: '台灣十六張',
    blurb: '16 tiles, five sets plus a pair, 底 + 台 payouts, dealer continuation.',
    handSize: 16,
    setsNeeded: 5,
    bonusTiles: true,
    thirteenOrphans: false,
    sevenPairs: false,
    riichi: false,
    deadWallSize: 0,
    dora: false,
    scorer: 'taiwan',
    startScore: 0,
    scoring: { base: 30, taiValue: 10, minTai: 0, limitTai: 0, table: TW_TABLE },
    dealerRepeatsOnWin: true,
    dealerRepeatsOnDraw: true,
    flowerReplacementCountsAsKong: true,
    chowFromLeftOnly: true,
    notenPenalty: 0,
  },

  riichi: {
    id: 'riichi',
    name: 'Riichi (Japanese)',
    zh: '立直麻雀',
    blurb: '13 tiles, no flowers, dora, riichi declarations, han/fu scoring.',
    handSize: 13,
    setsNeeded: 4,
    bonusTiles: false,
    thirteenOrphans: true,
    sevenPairs: true,
    riichi: true,
    deadWallSize: 14,
    dora: true,
    scorer: 'riichi',
    startScore: 25000,
    scoring: { uraDora: true, riichiCost: 1000, honbaValue: 300, notenPenalty: 3000 },
    dealerRepeatsOnWin: true,
    dealerRepeatsOnDraw: false,   // dealer keeps the deal only if tenpai
    dealerRepeatsIfTenpai: true,
    flowerReplacementCountsAsKong: false,
    chowFromLeftOnly: true,
    requireYaku: true,
    notenPenalty: 3000,
  },
};

export const VARIANT_LIST = Object.values(VARIANTS).map((v) => ({
  id: v.id, name: v.name, zh: v.zh, blurb: v.blurb, handSize: v.handSize, seats: v.seats || 4,
}));

export function variant(id) {
  return VARIANTS[id] || VARIANTS['hk-old'];
}
