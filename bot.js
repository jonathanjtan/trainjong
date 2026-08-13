import { counts, suited, rank, honor, dragon, E } from './tiles.js';

/** how much a tile is worth keeping, given the rest of the hand */
function keepScore(tile, c, ctx) {
  let s = 0;
  const n = c[tile];
  if (n >= 3) s += 12;
  else if (n === 2) s += 6;
  if (suited(tile)) {
    const r = rank(tile);
    if (r > 1 && c[tile - 1]) s += 3;
    if (r < 9 && c[tile + 1]) s += 3;
    if (r > 2 && c[tile - 2]) s += 1;
    if (r < 8 && c[tile + 2]) s += 1;
    if (r === 1 || r === 9) s -= 1;
  } else {
    if (dragon(tile)) s += 2;
    if (tile === E + ctx.seatWind || tile === E + ctx.roundWind) s += 2;
    if (n === 1) s -= 2;
  }
  return s;
}

export function botAction(view) {
  const l = view.legal || {};
  if (view.phase === 'play' && view.turn === view.seat) {
    if (l.win) return { type: 'win' };
    if (l.kongs?.length && Math.random() < 0.5) {
      const k = l.kongs[0];
      return { type: 'kong', tile: k.tile, kongType: k.type };
    }
    if (l.riichi?.length && Math.random() < 0.8) {
      const c = counts(view.hand);
      const pick = l.riichi.slice().sort((a, b) => keepScore(a, c, view) - keepScore(b, c, view))[0];
      return { type: 'discard', tile: pick, riichi: true };
    }
    const opts = l.discard || [];
    if (!opts.length) return null;
    const c = counts(view.hand);
    const ranked = opts.slice().sort((a, b) => keepScore(a, c, view) - keepScore(b, c, view));
    return { type: 'discard', tile: ranked[0] };
  }
  if (view.phase === 'claim') {
    if (l.win) return { type: 'claimWin' };
    const tile = view.lastDiscard?.tile;
    const valuable = tile !== undefined && honor(tile)
      && (dragon(tile) || tile === E + view.seatWind || tile === E + view.roundWind);
    if (l.kong !== undefined && valuable) return { type: 'claimKong' };
    if (l.pung && (valuable || Math.random() < 0.35)) return { type: 'pung' };
    if (l.chows?.length && Math.random() < 0.25) return { type: 'chow', tiles: l.chows[0] };
    return { type: 'pass' };
  }
  return null;
}
