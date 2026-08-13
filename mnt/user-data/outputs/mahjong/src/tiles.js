// Tile ids 0..41
//  0..8   dots      筒 p1..p9
//  9..17  bamboo    索 s1..s9
// 18..26  characters 萬 m1..m9
// 27..30  winds     東南西北
// 31..33  dragons   中發白
// 34..37  flowers   梅蘭菊竹  (seat E S W N)
// 38..41  seasons   春夏秋冬  (seat E S W N)

export const HONOR = 27;
export const BONUS = 34;
export const N_KIND = 42;

export const E = 27, S = 28, W = 29, N = 30;
export const RED = 31, GREEN = 32, WHITE = 33;

export const CODES = (() => {
  const a = [];
  for (const s of ['p', 's', 'm']) for (let r = 1; r <= 9; r++) a.push(s + r);
  a.push('ze', 'zs', 'zw', 'zn', 'zc', 'zf', 'zb');
  for (let i = 1; i <= 4; i++) a.push('f' + i);
  for (let i = 1; i <= 4; i++) a.push('q' + i);
  return a;
})();

export const BY_CODE = Object.fromEntries(CODES.map((c, i) => [c, i]));

export const LABELS = (() => {
  const a = [];
  const num = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  for (let r = 0; r < 9; r++) a.push(num[r] + '筒');
  for (let r = 0; r < 9; r++) a.push(num[r] + '索');
  for (let r = 0; r < 9; r++) a.push(num[r] + '萬');
  a.push('東', '南', '西', '北', '中', '發', '白');
  a.push('梅', '蘭', '菊', '竹', '春', '夏', '秋', '冬');
  return a;
})();

export const WIND_LABEL = ['東', '南', '西', '北'];
export const WIND_NAME = ['East', 'South', 'West', 'North'];

export const suited = (t) => t < HONOR;
export const suit = (t) => (t < HONOR ? (t / 9) | 0 : -1); // 0 dots 1 bamboo 2 chars
export const rank = (t) => (t < HONOR ? (t % 9) + 1 : 0);
export const honor = (t) => t >= HONOR && t < BONUS;
export const wind = (t) => t >= E && t <= N;
export const dragon = (t) => t >= RED && t <= WHITE;
export const bonus = (t) => t >= BONUS;
export const terminal = (t) => suited(t) && (rank(t) === 1 || rank(t) === 9);
export const simple = (t) => suited(t) && rank(t) > 1 && rank(t) < 9;
export const majorMinor = (t) => terminal(t) || honor(t); // 幺九 / yaochuuhai
export const bonusSeat = (t) => (t - BONUS) % 4;
export const bonusSet = (t) => ((t - BONUS) / 4) | 0; // 0 flowers, 1 seasons

/** counts array of length 34 (bonus tiles excluded) */
export function counts(tiles) {
  const c = new Array(34).fill(0);
  for (const t of tiles) if (t < 34) c[t]++;
  return c;
}

export function fromCounts(c) {
  const out = [];
  for (let t = 0; t < c.length; t++) for (let i = 0; i < c[t]; i++) out.push(t);
  return out;
}

/** sort order used everywhere the hand is shown */
export function sortTiles(tiles) {
  return tiles.slice().sort((a, b) => a - b);
}

export function fullWall({ withBonus = true, redFives = 0 } = {}) {
  const w = [];
  for (let t = 0; t < 34; t++) for (let i = 0; i < 4; i++) w.push(t);
  if (withBonus) for (let t = 34; t < 42; t++) w.push(t);
  void redFives;
  return w;
}

/** xorshift128+ — deterministic, seedable, fast */
export function rng(seed) {
  let a = seed | 0 || 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = 0xdeadbeef;
  return function next() {
    const t = a ^ (a << 11);
    a = b; b = c; c = d;
    d = (d ^ (d >>> 19)) ^ (t ^ (t >>> 8));
    return ((d >>> 0) / 4294967296);
  };
}

export function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
