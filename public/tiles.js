// Tile faces drawn as inline SVG. No image assets, no fonts to download.
const W = 60, H = 84;
const X0 = 9, X1 = 51, Y0 = 11, Y1 = 75;
const px = (f) => (X0 + f * (X1 - X0)).toFixed(2);
const py = (f) => (Y0 + f * (Y1 - Y0)).toFixed(2);

const DOTS = {
  1: [[0.5, 0.5]],
  2: [[0.5, 0.24], [0.5, 0.76]],
  3: [[0.22, 0.18], [0.5, 0.5], [0.78, 0.82]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.22, 0.2], [0.78, 0.2], [0.5, 0.5], [0.22, 0.8], [0.78, 0.8]],
  6: [[0.25, 0.18], [0.75, 0.18], [0.25, 0.5], [0.75, 0.5], [0.25, 0.82], [0.75, 0.82]],
  7: [[0.2, 0.12], [0.5, 0.24], [0.8, 0.36], [0.25, 0.62], [0.75, 0.62], [0.25, 0.88], [0.75, 0.88]],
  8: [[0.25, 0.1], [0.75, 0.1], [0.25, 0.37], [0.75, 0.37], [0.25, 0.63], [0.75, 0.63], [0.25, 0.9], [0.75, 0.9]],
  9: [[0.16, 0.15], [0.5, 0.15], [0.84, 0.15], [0.16, 0.5], [0.5, 0.5], [0.84, 0.5], [0.16, 0.85], [0.5, 0.85], [0.84, 0.85]],
};

const BAMBOO = {
  1: [],
  2: [[0.5, 0.26], [0.5, 0.74]],
  3: [[0.5, 0.16], [0.28, 0.68], [0.72, 0.68]],
  4: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.76], [0.72, 0.76]],
  5: [[0.22, 0.2], [0.78, 0.2], [0.5, 0.5], [0.22, 0.8], [0.78, 0.8]],
  6: [[0.18, 0.24], [0.5, 0.24], [0.82, 0.24], [0.18, 0.76], [0.5, 0.76], [0.82, 0.76]],
  7: [[0.5, 0.12], [0.18, 0.5], [0.5, 0.5], [0.82, 0.5], [0.18, 0.86], [0.5, 0.86], [0.82, 0.86]],
  8: [[0.2, 0.16], [0.44, 0.16], [0.68, 0.16], [0.9, 0.16], [0.2, 0.8], [0.44, 0.8], [0.68, 0.8], [0.9, 0.8]],
  9: [[0.18, 0.14], [0.5, 0.14], [0.82, 0.14], [0.18, 0.5], [0.5, 0.5], [0.82, 0.5], [0.18, 0.86], [0.5, 0.86], [0.82, 0.86]],
};

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOURS = { 27: '東', 28: '南', 29: '西', 30: '北', 31: '中', 32: '發' };
const BONUS = { 34: '梅', 35: '蘭', 36: '菊', 37: '竹', 38: '春', 39: '夏', 40: '秋', 41: '冬' };

function dot(f, i, rank) {
  const cx = px(f[0]), cy = py(f[1]);
  const red = (rank === 5 && i === 2) || (rank === 7 && i < 3);
  const cls = red ? 'v' : 'j';
  if (rank === 1) {
    return `<circle cx="${cx}" cy="${cy}" r="12" class="j o"/><circle cx="${cx}" cy="${cy}" r="7.5" class="v o"/><circle cx="${cx}" cy="${cy}" r="3" class="j f"/>`;
  }
  const r = rank <= 4 ? 6.4 : rank <= 6 ? 5.6 : 4.6;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" class="${cls} o"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.34).toFixed(1)}" class="${cls} f"/>`;
}

function stick(f, i, rank) {
  const cx = +px(f[0]), cy = +py(f[1]);
  const h = rank <= 3 ? 22 : rank <= 6 ? 19 : 15;
  const w = rank <= 3 ? 7 : rank <= 6 ? 6.2 : 5.2;
  const red = (rank === 5 && i === 2) || (rank === 7 && i === 0) || (rank === 9 && (i === 1 || i === 4 || i === 7));
  const cls = red ? 'v' : 'j';
  const y = cy - h / 2;
  const band = (yy) => `<rect class="cut" x="${(cx - w / 2 - 0.4).toFixed(1)}" y="${yy.toFixed(1)}" width="${(w + 0.8).toFixed(1)}" height="1.5"/>`;
  return `<g class="${cls} f"><rect x="${(cx - w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" rx="${(w / 2).toFixed(1)}"/></g>`
    + band(cy - h * 0.2) + band(cy + h * 0.08);
}

function shoot() {
  // 1 索 — a bamboo shoot: unmistakable at 24px, and of a piece with 2–9
  const culm = `<g class="j f"><rect x="26.5" y="26" width="7" height="46" rx="3.5"/></g>`
    + `<rect class="cut" x="26.1" y="40" width="7.8" height="1.6"/>`
    + `<rect class="cut" x="26.1" y="55" width="7.8" height="1.6"/>`;
  const leaves = `<g class="j f">`
    + `<path d="M30 24c-1-6-6-9-12-9 1 6 6 9 12 9z"/>`
    + `<path d="M30 24c1-6 6-9 12-9-1 6-6 9-12 9z"/>`
    + `<path class="v f" d="M30 22c-2-6 0-12 4-16 2 6 0 12-4 16z"/></g>`;
  return leaves + culm;
}

function face(id) {
  if (id < 27) {
    const s = (id / 9) | 0, r = (id % 9) + 1;
    if (s === 0) return DOTS[r].map((f, i) => dot(f, i, r)).join('');
    if (s === 1) return r === 1 ? shoot() : BAMBOO[r].map((f, i) => stick(f, i, r)).join('');
    return `<text class="k glyph" x="30" y="38">${NUMERALS[r - 1]}</text>`
      + `<text class="v glyph" x="30" y="72">萬</text>`;
  }
  if (id === 33) {
    return `<rect x="15" y="18" width="30" height="48" rx="3" class="k o thick"/>`
      + `<rect x="21" y="26" width="18" height="32" rx="2" class="k o thin"/>`;
  }
  if (id in HONOURS) {
    const cls = id === 31 ? 'v' : id === 32 ? 'j' : 'k';
    return `<text class="${cls} glyph big" x="30" y="56">${HONOURS[id]}</text>`;
  }
  if (id in BONUS) {
    const cls = id < 38 ? 'j' : 'v';
    return `<text class="${cls} glyph big" x="30" y="52">${BONUS[id]}</text>`
      + `<text class="k glyph tiny" x="30" y="72">${id < 38 ? '花' : '季'}</text>`;
  }
  return '';
}

const cache = new Map();

export function tileSVG(id) {
  if (cache.has(id)) return cache.get(id);
  const svg = `<svg class="tile-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">`
    + `<rect class="tile-face" x="1.2" y="1.2" width="${W - 2.4}" height="${H - 2.4}" rx="7"/>`
    + `<rect class="tile-inner" x="4.5" y="4.5" width="${W - 9}" height="${H - 9}" rx="4.5"/>`
    + face(id) + '</svg>';
  cache.set(id, svg);
  return svg;
}

export function tileBackSVG() {
  return `<svg class="tile-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">`
    + `<rect class="tile-back" x="1.2" y="1.2" width="${W - 2.4}" height="${H - 2.4}" rx="7"/>`
    + `<rect class="tile-back-in" x="6" y="6" width="${W - 12}" height="${H - 12}" rx="4"/></svg>`;
}

export const NAMES = (() => {
  const a = [];
  const suits = ['筒', '索', '萬'];
  for (let s = 0; s < 3; s++) for (let r = 1; r <= 9; r++) a.push(NUMERALS[r - 1] + suits[s]);
  a.push('東', '南', '西', '北', '中', '發', '白', '梅', '蘭', '菊', '竹', '春', '夏', '秋', '冬');
  return a;
})();

export function tileEl(id, { size = 'md', back = false, dim = false, ring = false, turned = false, cls: extra = '' } = {}) {
  const cls = ['tile', `t-${size}`, dim ? 'dim' : '', ring ? 'ring' : '', turned ? 'turned' : '', extra]
    .filter(Boolean).join(' ');
  return `<span class="${cls}" data-tile="${id}" title="${back ? '' : NAMES[id] || ''}">${back ? tileBackSVG() : tileSVG(id)}</span>`;
}
