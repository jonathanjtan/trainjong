/* Portrait avatars, drawn the way the tiles are: inline SVG, no image assets, no
   licence to worry about. Each one is the same face under a different head of
   hair — a palette, a hairstyle and a trinket — which is enough to tell twelve
   people apart at 28px, and cheap enough to draw four of them every render.

   Bots take one by seat, so the same seat always looks like the same player. */

const P = (id, bg, hair, style, extra, eye = '#3b2b22', skin = '#ffe0c8') =>
  ({ id, bg, hair, style, extra, eye, skin });

export const AVATARS = [
  P('rin', '#8e3d4a', '#2a1f22', 'long', 'ribbon'),
  P('kaze', '#6e93ad', '#2b4b66', 'spiky', null, '#2a4a66'),
  P('mei', '#a2603a', '#5b3520', 'twin', 'flower'),
  P('yuki', '#4a6b8a', '#d8dee6', 'bob', null, '#5a7d99'),
  P('ao', '#2c6b62', '#1e3f52', 'pony', 'clip', '#215c52'),
  P('taro', '#8a7a44', '#40301c', 'short', 'glasses'),
  P('hana', '#8a4a6b', '#7a2f52', 'wave', 'flower', '#6b2f4a'),
  P('ken', '#5c6470', '#20262c', 'short', 'band'),
  P('nao', '#7a8a4a', '#2e3a16', 'bun', 'pin', '#3f5220'),
  P('suzu', '#7a4a2c', '#e0a04a', 'twin', 'ribbon', '#8a5a1e'),
  P('jun', '#4a3c6b', '#2e2440', 'bob', 'headphones'),
  P('mao', '#6b2c3c', '#1a1a1e', 'long', 'ears', '#8a2f3a'),
];

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));
export const avatarIds = AVATARS.map((a) => a.id);

/* Everything below draws into a 64×64 box, clipped to a circle. The head sits
   high in it so the shoulders can fill the bottom, the way a portrait crops. */

const backHair = (a) => {
  switch (a.style) {
    case 'long': case 'wave':
      return `<path d="M11 34c-1-20 8-28 21-28s22 8 21 28l2 22h-8l-2-24-3 6c-2-10-6-14-10-14s-8 4-10 14l-3-6-2 24h-8z" fill="${a.hair}"/>`;
    case 'twin':
      return `<path d="M12 32c0-18 9-26 20-26s20 8 20 26l1 10h-6l-2-18-3 5c-2-9-5-13-10-13s-8 4-10 13l-3-5-2 18h-6z" fill="${a.hair}"/>`
        + `<ellipse cx="9" cy="40" rx="7" ry="11" fill="${a.hair}"/><ellipse cx="55" cy="40" rx="7" ry="11" fill="${a.hair}"/>`;
    case 'pony':
      return `<path d="M13 32c0-17 8-26 19-26s20 9 20 26l1 8h-6l-2-16-3 5c-2-9-5-13-10-13s-8 4-10 13l-3-5-2 16h-6z" fill="${a.hair}"/>`
        + `<path d="M50 20c8 2 12 10 11 20-1 8-4 13-8 16l-5-4c4-4 6-9 6-15 0-7-2-12-6-15z" fill="${a.hair}"/>`;
    case 'bun':
      return `<circle cx="32" cy="7" r="7" fill="${a.hair}"/>`
        + `<path d="M14 32c0-16 8-24 18-24s18 8 18 24l1 6h-6l-2-14-3 5c-2-8-4-12-8-12s-6 4-8 12l-3-5-2 14h-5z" fill="${a.hair}"/>`;
    default:
      return `<path d="M14 33c0-17 8-25 18-25s18 8 18 25l1 5h-38z" fill="${a.hair}"/>`;
  }
};

const frontHair = (a) => {
  const bangs = {
    long: `<path d="M15 26c1-13 8-19 17-19s16 6 17 19c-3-6-8-9-14-8-2 4-6 7-11 7-4 0-7-1-9 1z" fill="${a.hair}"/>`,
    wave: `<path d="M15 27c0-13 8-20 17-20s17 7 17 20c-2-5-5-8-9-9-3 3-7 4-11 3-4-1-7 1-9 3-2 1-3 2-5 3z" fill="${a.hair}"/>`,
    twin: `<path d="M15 26c1-12 8-18 17-18s16 6 17 18c-4-6-9-8-15-7-5 1-8 4-11 6-3 1-6 1-8 1z" fill="${a.hair}"/>`,
    pony: `<path d="M15 26c1-12 8-18 17-18s16 6 17 18c-4-7-10-9-17-8-6 1-11 4-13 8z" fill="${a.hair}"/>`,
    bob: `<path d="M15 27c0-13 8-19 17-19s17 6 17 19c-2-7-6-10-11-11-2 5-8 8-15 8-3 0-6 1-8 3z" fill="${a.hair}"/>`,
    bun: `<path d="M17 24c1-10 7-15 15-15s14 5 15 15c-3-5-8-7-14-6-6 1-11 3-16 6z" fill="${a.hair}"/>`,
    spiky: `<path d="M14 28l3-9 2 5 4-9 3 6 3-9 4 8 3-7 4 8 3-5 3 12z" fill="${a.hair}"/>`,
    short: `<path d="M15 27c0-13 8-19 17-19s17 6 17 19c-2-7-6-11-11-11-3 2-7 3-12 3-4 0-8 3-11 8z" fill="${a.hair}"/>`,
  };
  return bangs[a.style] || bangs.short;
};

const trinket = (a) => {
  switch (a.extra) {
    case 'ribbon':
      return `<g fill="#e05a6a"><path d="M44 13l7-4 1 8z"/><path d="M52 9l7 3-6 5z"/><circle cx="52" cy="12" r="2.4"/></g>`;
    case 'flower':
      return `<g fill="#f2f0e6"><circle cx="15" cy="16" r="3"/><circle cx="20" cy="13" r="3"/><circle cx="21" cy="19" r="3"/>`
        + `<circle cx="14" cy="22" r="3"/><circle cx="18" cy="17" r="2.6" fill="#e8c15a"/></g>`;
    case 'glasses':
      return `<g fill="none" stroke="#2a2a2e" stroke-width="1.6" opacity="0.85">`
        + `<rect x="18" y="26" width="12" height="9" rx="4"/><rect x="34" y="26" width="12" height="9" rx="4"/>`
        + `<path d="M30 30h4"/></g>`;
    case 'band':
      return `<path d="M16 20c4-4 10-6 16-6s12 2 16 6l-1.5 3.4c-4-3.4-9-5-14.5-5s-10.5 1.6-14.5 5z" fill="#d9d3c4" opacity="0.95"/>`;
    case 'pin':
      return `<g fill="#e8c15a"><rect x="42" y="16" width="9" height="2.6" rx="1.3" transform="rotate(-18 46 17)"/>`
        + `<rect x="42" y="20" width="7" height="2.4" rx="1.2" transform="rotate(-18 45 21)"/></g>`;
    case 'clip':
      return `<g fill="#f2f0e6"><rect x="16" y="18" width="8" height="2.6" rx="1.3" transform="rotate(20 20 19)"/></g>`;
    case 'headphones':
      return `<g fill="#2a2a2e"><path d="M13 32c0-12 8-20 19-20s19 8 19 20h-3c0-10-7-17-16-17s-16 7-16 17z"/>`
        + `<rect x="9" y="29" width="7" height="12" rx="3.5"/><rect x="48" y="29" width="7" height="12" rx="3.5"/></g>`;
    case 'ears':
      return `<g fill="${a.hair}"><path d="M13 18l3 12-9-5z"/><path d="M51 18l-3 12 9-5z"/>`
        + `<path d="M13.5 20.5l1.8 7-5-3z" fill="#e79aa6"/><path d="M50.5 20.5l-1.8 7 5-3z" fill="#e79aa6"/></g>`;
    default: return '';
  }
};

/* One face for everybody: the hair does the work of telling them apart, and a
   face that changes with it reads as a different drawing rather than a
   different person. */
const face = (a) => `
  <ellipse cx="32" cy="44" rx="4.5" ry="6" fill="${a.skin}"/>
  <ellipse cx="32" cy="29" rx="15" ry="16.5" fill="${a.skin}"/>
  <ellipse cx="17.5" cy="31" rx="2.4" ry="3.2" fill="${a.skin}"/>
  <ellipse cx="46.5" cy="31" rx="2.4" ry="3.2" fill="${a.skin}"/>
  <ellipse cx="23" cy="37" rx="3.4" ry="1.9" fill="#f09a9a" opacity="0.45"/>
  <ellipse cx="41" cy="37" rx="3.4" ry="1.9" fill="#f09a9a" opacity="0.45"/>
  <g fill="${a.eye}">
    <ellipse cx="25" cy="32" rx="3" ry="4"/><ellipse cx="39" cy="32" rx="3" ry="4"/>
    <path d="M21.6 28.6c1.6-1.4 5.2-1.4 6.8 0" stroke="${a.eye}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M35.6 28.6c1.6-1.4 5.2-1.4 6.8 0" stroke="${a.eye}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </g>
  <circle cx="23.8" cy="30.6" r="1.1" fill="#fff" opacity="0.9"/>
  <circle cx="37.8" cy="30.6" r="1.1" fill="#fff" opacity="0.9"/>
  <path d="M29.5 39.5c1.5 1.6 3.5 1.6 5 0" stroke="#c4746a" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;

const cache = new Map();

export function avatarSVG(id) {
  const key = id || 'rin';
  if (cache.has(key)) return cache.get(key);
  const a = BY_ID.get(key) || AVATARS[0];
  const svg = `<svg class="av-svg" viewBox="0 0 64 64" aria-hidden="true">
    <defs><clipPath id="avc-${a.id}"><circle cx="32" cy="32" r="31"/></clipPath></defs>
    <g clip-path="url(#avc-${a.id})">
      <rect width="64" height="64" fill="${a.bg}"/>
      <circle cx="32" cy="52" r="26" fill="#000" opacity="0.16"/>
      ${backHair(a)}
      <path d="M32 45c11 0 19 7 21 19H11c2-12 10-19 21-19z" fill="#f2f0e6" opacity="0.9"/>
      ${face(a)}
      ${frontHair(a)}
      ${trinket(a)}
    </g>
    <circle cx="32" cy="32" r="30.5" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.4"/>
  </svg>`;
  cache.set(key, svg);
  return svg;
}

/* A seat with nobody's choice on it still needs a face — bots, and anyone who
   has not picked. Deterministic, so it does not shuffle between renders. */
export function avatarFor(seatOrName, chosen) {
  if (chosen && BY_ID.has(chosen)) return chosen;
  const s = typeof seatOrName === 'number' ? seatOrName
    : [...String(seatOrName || '')].reduce((n, c) => n + c.charCodeAt(0), 0);
  return AVATARS[Math.abs(s) % AVATARS.length].id;
}
