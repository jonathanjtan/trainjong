import {
  fullWall, shuffle, rng, counts, sortTiles, bonus, WIND_LABEL,
} from './tiles.js';
import { checkWin, waits, chowOptions } from './hand.js';
import { scoreHK } from './score/hk.js';
import { scoreTaiwan } from './score/taiwan.js';
import { scoreRiichi, doraOf } from './score/riichi.js';
import { variant as getVariant } from './variants.js';

const SCORERS = { hk: scoreHK, taiwan: scoreTaiwan, riichi: scoreRiichi };
const next = (s) => (s + 1) % 4;

export class Game {
  constructor({ variantId = 'hk-old', seed = Date.now(), rounds = 4, names = ['', '', '', ''] } = {}) {
    this.v = getVariant(variantId);
    this.variantId = this.v.id;
    this.rounds = rounds;
    this.names = names;
    this.seed = seed >>> 0;
    this.rand = rng(this.seed);
    this.scores = [0, 1, 2, 3].map(() => this.v.startScore);
    this.roundWind = 0;
    this.dealer = 0;
    this.handNo = 0;
    this.honba = 0;
    this.riichiPot = 0;
    this.continuation = 0;
    this.phase = 'idle';
    this.log = [];
    this.result = null;
    this.history = [];
  }

  // ---------------------------------------------------------------- lifecycle

  startHand() {
    const v = this.v;
    this.wall = shuffle(fullWall({ withBonus: v.bonusTiles }), this.rand);
    this.deadWall = v.deadWallSize ? this.wall.splice(this.wall.length - v.deadWallSize, v.deadWallSize) : [];
    this.doraIndicators = [];
    this.uraIndicators = [];
    this.doraFlipped = 0;
    this.hands = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.bonus = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.river = [];
    this.riichi = [null, null, null, null];   // {turn, double, ippatsu}
    this.furiten = [false, false, false, false];
    this.tempFuriten = [false, false, false, false];
    this.declaredNoWin = [false, false, false, false];
    this.turn = this.dealer;
    this.drawn = null;
    this.lastDiscard = null;
    this.claim = null;
    this.result = null;
    this.phase = 'play';
    this.firstGoAround = true;
    this.turnsTaken = 0;
    this.kongCount = 0;
    this.pendingKong = null;
    this.flags = {};
    this.handNo++;

    for (let i = 0; i < 4; i++) {
      const seat = (this.dealer + i) % 4;
      this.hands[seat] = this.wall.splice(0, v.handSize);
    }
    if (v.dora) this.flipDora();
    for (let i = 0; i < 4; i++) this.settleBonus((this.dealer + i) % 4);

    this.push(`Hand ${this.handNo} — ${WIND_LABEL[this.roundWind]} round, dealer is seat ${this.dealer + 1}`);
    this.drawTile(this.dealer, { first: true });
    return this;
  }

  flipDora() {
    const idx = 4 + this.doraFlipped * 2;
    if (this.deadWall.length > idx + 1) {
      this.doraIndicators.push(this.deadWall[idx]);
      this.uraIndicators.push(this.deadWall[idx + 1]);
      this.doraFlipped++;
    }
  }

  /** move bonus tiles out of a hand, drawing replacements from the wall tail */
  settleBonus(seat) {
    if (!this.v.bonusTiles) return 0;
    let moved = 0;
    for (;;) {
      const i = this.hands[seat].findIndex(bonus);
      if (i < 0) break;
      const t = this.hands[seat].splice(i, 1)[0];
      this.bonus[seat].push(t);
      moved++;
      if (!this.wall.length) break;
      this.hands[seat].push(this.wall.pop());
    }
    return moved;
  }

  drawTile(seat, { rinshan = false, first = false } = {}) {
    const fromDead = rinshan && this.deadWall.length > 0;
    if (!fromDead && !this.wall.length) return this.exhaustiveDraw();
    let tile;
    if (fromDead) {
      tile = this.deadWall.shift();
      if (this.wall.length) this.deadWall.push(this.wall.pop());
    } else if (rinshan) {
      tile = this.wall.pop();
    } else {
      tile = this.wall.shift();
    }
    this.hands[seat].push(tile);
    this.drawn = tile;
    this.turn = seat;
    this.flags = { rinshan, haitei: this.wall.length === 0 };
    if (first && seat === this.dealer && this.firstGoAround) this.flags.tenhou = true;
    else if (this.firstGoAround && this.turnsTaken < 4) this.flags.chiihou = seat !== this.dealer;

    if (this.v.bonusTiles && bonus(tile)) {
      this.bonus[seat].push(this.hands[seat].pop());
      this.push(`Seat ${seat + 1} draws a bonus tile`);
      this.drawn = null;
      if (this.v.flowerReplacementCountsAsKong) {
        return this.drawTile(seat, { rinshan: true });
      }
      return this.drawTile(seat);
    }
    if (this.tempFuriten[seat]) this.tempFuriten[seat] = false;
    this.phase = 'play';
    return null;
  }

  push(msg) {
    this.log.push({ n: this.log.length, msg });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  // ------------------------------------------------------------------- legals

  concealedCounts(seat) {
    return counts(this.hands[seat]);
  }

  needSets(seat) {
    return this.v.setsNeeded - this.melds[seat].length;
  }

  /** score a hypothetical win to decide whether it may be declared */
  evaluateWin(seat, winTile, selfDraw, extraFlags = {}) {
    const c = this.concealedCounts(seat);
    if (!selfDraw) c[winTile]++;
    const ctx = {
      seat,
      concealed: c,
      melds: this.melds[seat],
      bonusTiles: this.bonus[seat],
      winTile,
      selfDraw,
      seatWind: (seat - this.dealer + 4) % 4,
      roundWind: this.roundWind,
      dealer: this.dealer,
      discarder: selfDraw ? null : (this.pendingKong ? this.pendingKong.seat : this.lastDiscard?.seat ?? null),
      continuation: this.continuation,
      honba: this.honba,
      riichiPot: this.riichiPot,
      doraIndicators: this.doraIndicators,
      uraIndicators: this.uraIndicators,
      flags: {
        ...this.flags,
        ...extraFlags,
        riichi: !!this.riichi[seat],
        doubleRiichi: !!this.riichi[seat]?.double,
        ippatsu: !!this.riichi[seat]?.ippatsu,
        houtei: !selfDraw && this.wall.length === 0,
        haitei: selfDraw && this.flags.haitei,
        tenhou: selfDraw && !!this.flags.tenhou && seat === this.dealer,
        chiihou: selfDraw && !!this.flags.chiihou && seat !== this.dealer,
        heavenly: selfDraw && !!this.flags.tenhou && seat === this.dealer,
        earthly: selfDraw && !!this.flags.chiihou && seat !== this.dealer,
      },
    };
    const scorer = SCORERS[this.v.scorer];
    const r = scorer(ctx, this.v.scoring);
    if (!r.win) return null;
    if (r.eligible === false) return { ...r, blocked: true };
    return r;
  }

  legal(seat) {
    const out = { seat, phase: this.phase, actions: [] };
    if (this.phase === 'play' && this.turn === seat) {
      const hand = sortTiles(this.hands[seat]);
      const inRiichi = !!this.riichi[seat];
      out.discard = inRiichi && this.drawn !== null ? [this.drawn] : hand;
      out.kongs = this.kongOptions(seat);
      if (this.drawn !== null) {
        const w = this.evaluateWin(seat, this.drawn, true);
        if (w && !w.blocked) out.win = { selfDraw: true, preview: previewOf(w) };
      }
      if (this.v.riichi && !inRiichi && this.melds[seat].every((m) => !m.open) && this.scores[seat] >= 1000) {
        out.riichi = this.riichiDiscards(seat);
      }
    } else if (this.phase === 'claim' && this.claim && seat !== this.claim.from) {
      const o = this.claim.options[seat];
      if (o && !this.claim.responses[seat]) Object.assign(out, { ...o, canPass: true });
    }
    return out;
  }

  kongOptions(seat) {
    const out = [];
    if (this.turn !== seat || this.phase !== 'play') return out;
    const c = this.concealedCounts(seat);
    for (let t = 0; t < 34; t++) {
      if (c[t] === 4) {
        if (this.riichi[seat] && t !== this.drawn) continue; // keep it simple: riichi kong only on the drawn tile
        out.push({ type: 'concealed', tile: t });
      }
    }
    for (const m of this.melds[seat]) {
      if (m.type === 'pung' && c[m.tile] > 0 && !this.riichi[seat]) out.push({ type: 'added', tile: m.tile });
    }
    return out;
  }

  riichiDiscards(seat) {
    const c = this.concealedCounts(seat);
    const need = this.needSets(seat);
    const out = [];
    for (let t = 0; t < 34; t++) {
      if (!c[t]) continue;
      c[t]--;
      if (waits(c, need, { thirteen: this.v.thirteenOrphans, sevenPairs: this.v.sevenPairs, closed: true }).length) out.push(t);
      c[t]++;
    }
    return out;
  }

  // ------------------------------------------------------------------ actions

  act(seat, action) {
    const type = action?.type;
    try {
      switch (type) {
        case 'discard': return this.doDiscard(seat, action.tile, action.riichi);
        case 'kong': return this.doKong(seat, action.tile, action.kongType);
        case 'win': return this.doWin(seat);
        case 'pung': case 'chow': case 'claimKong': case 'claimWin': case 'pass':
          return this.doClaim(seat, action);
        default: return { error: 'unknown action' };
      }
    } catch (e) {
      return { error: e.message };
    }
  }

  doDiscard(seat, tile, declareRiichi = false) {
    if (this.phase !== 'play' || this.turn !== seat) return { error: 'not your turn' };
    const idx = this.hands[seat].indexOf(tile);
    if (idx < 0) return { error: 'tile not in hand' };
    if (this.riichi[seat] && this.drawn !== null && tile !== this.drawn) return { error: 'riichi — discard the drawn tile' };

    if (declareRiichi) {
      if (!this.v.riichi || this.riichi[seat]) return { error: 'riichi not available' };
      if (!this.riichiDiscards(seat).includes(tile)) return { error: 'that discard is not tenpai' };
      this.riichi[seat] = { turn: this.turnsTaken, double: this.firstGoAround, ippatsu: true };
      this.scores[seat] -= this.v.scoring.riichiCost ?? 1000;
      this.riichiPot += this.v.scoring.riichiCost ?? 1000;
      this.push(`Seat ${seat + 1} declares riichi`);
    }

    this.hands[seat].splice(idx, 1);
    this.discards[seat].push(tile);
    this.river.push({ seat, tile, taken: false, riichi: declareRiichi });
    this.lastDiscard = { seat, tile, index: this.river.length - 1 };
    this.drawn = null;
    this.turnsTaken++;
    if (this.riichi[seat] && !declareRiichi) this.riichi[seat].ippatsu = false;
    this.updateFuriten(seat);
    return this.openClaims(seat, tile, 'discard');
  }

  updateFuriten(seat) {
    const w = waits(this.concealedCounts(seat), this.needSets(seat), {
      thirteen: this.v.thirteenOrphans, sevenPairs: this.v.sevenPairs, closed: this.melds[seat].every((m) => !m.open),
    });
    this.furiten[seat] = w.some((t) => this.discards[seat].includes(t));
  }

  openClaims(from, tile, kind) {
    const options = {};
    let any = false;
    for (let i = 1; i < 4; i++) {
      const seat = (from + i) % 4;
      const o = this.claimOptionsFor(seat, from, tile, kind);
      if (o) { options[seat] = o; any = true; }
    }
    if (!any) return this.afterClaims(kind, from);
    this.phase = 'claim';
    this.claim = { from, tile, kind, options, responses: {}, deadline: null };
    return { ok: true, claims: true };
  }

  claimOptionsFor(seat, from, tile, kind) {
    const o = {};
    const c = this.concealedCounts(seat);
    this.updateFuriten(seat);
    const canWin = !this.furiten[seat] && !this.tempFuriten[seat] && !this.declaredNoWin[seat];
    if (canWin) {
      const w = this.evaluateWin(seat, tile, false, kind === 'kong' ? { robbingKong: true, chankan: true } : {});
      if (w && !w.blocked) o.win = { preview: previewOf(w) };
    }
    if (kind === 'kong') return o.win ? o : null; // robbing a kong: win only
    if (this.riichi[seat]) return o.win ? o : null; // riichi hands may not call
    if (c[tile] >= 2) o.pung = true;
    if (c[tile] === 3) o.kong = tile;
    const chows = chowOptions(c, tile);
    if (chows.length && (!this.v.chowFromLeftOnly || next(from) === seat)) o.chows = chows;
    return Object.keys(o).length ? o : null;
  }

  doClaim(seat, action) {
    if (this.phase !== 'claim' || !this.claim) return { error: 'nothing to claim' };
    const opts = this.claim.options[seat];
    if (!opts) return { error: 'no claim available' };
    if (this.claim.responses[seat]) return { error: 'already responded' };
    if (action.type === 'claimWin' && !opts.win) return { error: 'cannot win on that tile' };
    if (action.type === 'pung' && !opts.pung) return { error: 'cannot pung' };
    if (action.type === 'claimKong' && opts.kong === undefined) return { error: 'cannot kong' };
    if (action.type === 'chow') {
      const ok = (opts.chows || []).some((p) => p[0] === action.tiles?.[0] && p[1] === action.tiles?.[1]);
      if (!ok) return { error: 'cannot chow those tiles' };
    }
    this.claim.responses[seat] = action;
    if (action.type === 'pass' && opts.win) {
      // passing on a winning tile makes you temporarily furiten (permanently while in riichi)
      if (this.riichi[seat]) this.furiten[seat] = true;
      else this.tempFuriten[seat] = true;
    }
    const pending = Object.keys(this.claim.options).filter((s) => !this.claim.responses[s]);
    if (!pending.length) return this.resolveClaims();
    return { ok: true };
  }

  /** called by the room when the claim timer expires — missing answers become passes */
  forceResolveClaims() {
    if (this.phase !== 'claim' || !this.claim) return { ok: true };
    for (const s of Object.keys(this.claim.options)) {
      if (!this.claim.responses[s]) this.claim.responses[s] = { type: 'pass' };
    }
    return this.resolveClaims();
  }

  resolveClaims() {
    const { from, tile, kind, responses } = this.claim;
    const winners = Object.entries(responses).filter(([, a]) => a.type === 'claimWin').map(([s]) => +s);
    if (winners.length) {
      // nearest player counter-clockwise from the discarder takes it
      winners.sort((a, b) => ((a - from + 4) % 4) - ((b - from + 4) % 4));
      const seat = winners[0];
      this.claim = null;
      if (kind === 'discard' && this.lastDiscard) this.river[this.lastDiscard.index].taken = true;
      return this.finishWin(seat, tile, false, kind === 'kong' ? { robbingKong: true, chankan: true } : {});
    }
    const pungOrKong = Object.entries(responses).find(([, a]) => a.type === 'pung' || a.type === 'claimKong');
    const chow = Object.entries(responses).find(([, a]) => a.type === 'chow');
    const taker = pungOrKong || chow;
    if (kind === 'kong') {
      this.claim = null;
      return this.afterKongReplacement();
    }
    if (!taker) {
      this.claim = null;
      return this.afterClaims(kind, from);
    }
    const seat = +taker[0];
    const action = taker[1];
    this.claim = null;
    this.river[this.lastDiscard.index].taken = true;
    this.firstGoAround = false;
    for (let s = 0; s < 4; s++) if (this.riichi[s]) this.riichi[s].ippatsu = false;

    const c = this.hands[seat];
    const take = (t) => {
      const i = c.indexOf(t);
      if (i < 0) throw new Error('missing tile for meld');
      c.splice(i, 1);
    };
    if (action.type === 'pung') {
      take(tile); take(tile);
      this.melds[seat].push({ type: 'pung', tile, open: true, from, claimed: tile });
      this.push(`Seat ${seat + 1} pungs`);
      this.turn = seat; this.drawn = null; this.phase = 'play';
      this.flags = {};
      return { ok: true };
    }
    if (action.type === 'claimKong') {
      take(tile); take(tile); take(tile);
      this.melds[seat].push({ type: 'kong', tile, open: true, from, kongType: 'claimed', claimed: tile });
      this.kongCount++;
      this.push(`Seat ${seat + 1} kongs`);
      if (this.v.dora) this.flipDora();
      this.turn = seat;
      return this.drawTile(seat, { rinshan: true }) || { ok: true };
    }
    // chow
    take(action.tiles[0]); take(action.tiles[1]);
    const base = Math.min(action.tiles[0], action.tiles[1], tile);
    this.melds[seat].push({ type: 'chow', tile: base, open: true, from, claimed: tile });
    this.push(`Seat ${seat + 1} chows`);
    this.turn = seat; this.drawn = null; this.phase = 'play';
    this.flags = {};
    return { ok: true };
  }

  afterClaims(kind, from) {
    if (kind === 'discard' && this.wall.length === 0) return this.exhaustiveDraw();
    const seat = next(from);
    if (this.turnsTaken >= 4) this.firstGoAround = false;
    return this.drawTile(seat) || { ok: true };
  }

  doKong(seat, tile, kongType) {
    if (this.phase !== 'play' || this.turn !== seat) return { error: 'not your turn' };
    const options = this.kongOptions(seat);
    const opt = options.find((o) => o.tile === tile && (!kongType || o.type === kongType));
    if (!opt) return { error: 'cannot kong that tile' };
    this.firstGoAround = false;
    for (let s = 0; s < 4; s++) if (this.riichi[s]) this.riichi[s].ippatsu = false;

    if (opt.type === 'concealed') {
      for (let i = 0; i < 4; i++) this.hands[seat].splice(this.hands[seat].indexOf(tile), 1);
      this.melds[seat].push({ type: 'kong', tile, open: false, from: null, kongType: 'concealed' });
      this.kongCount++;
      this.push(`Seat ${seat + 1} declares a concealed kong`);
      if (this.v.dora) this.flipDora();
      this.drawn = null;
      return this.drawTile(seat, { rinshan: true }) || { ok: true };
    }
    // added kong — everyone gets a chance to rob it
    const m = this.melds[seat].find((x) => x.type === 'pung' && x.tile === tile);
    this.hands[seat].splice(this.hands[seat].indexOf(tile), 1);
    m.type = 'kong';
    m.kongType = 'added';
    this.kongCount++;
    this.push(`Seat ${seat + 1} adds to a pung for a kong`);
    this.drawn = null;
    this.pendingKong = { seat, tile };
    const r = this.openClaims(seat, tile, 'kong');
    if (r && r.claims) return r;
    return this.afterKongReplacement();
  }

  afterKongReplacement() {
    const { seat } = this.pendingKong || { seat: this.turn };
    this.pendingKong = null;
    if (this.v.dora) this.flipDora();
    return this.drawTile(seat, { rinshan: true }) || { ok: true };
  }

  doWin(seat) {
    if (this.phase === 'claim') return this.doClaim(seat, { type: 'claimWin' });
    if (this.phase !== 'play' || this.turn !== seat) return { error: 'not your turn' };
    if (this.drawn === null) return { error: 'nothing drawn' };
    const w = this.evaluateWin(seat, this.drawn, true);
    if (!w) return { error: 'not a winning hand' };
    if (w.blocked) return { error: `below the minimum (${w.value} < ${w.minimum})` };
    return this.finishWin(seat, this.drawn, true);
  }

  finishWin(seat, winTile, selfDraw, extraFlags = {}) {
    const w = this.evaluateWin(seat, winTile, selfDraw, extraFlags);
    if (!w || w.blocked) return { error: 'invalid win' };
    this.pendingKong = null;
    const hand = this.hands[seat].slice();
    if (!selfDraw) hand.push(winTile);
    const deltas = w.deltas.slice();
    for (let s = 0; s < 4; s++) this.scores[s] += deltas[s];
    if (w.potClaimed) this.riichiPot -= w.potClaimed;
    this.result = {
      kind: 'win',
      seat,
      winTile,
      selfDraw,
      hand: sortTiles(hand),
      melds: this.melds[seat],
      bonus: this.bonus[seat],
      patterns: w.patterns,
      label: w.label,
      unit: w.unit,
      value: w.value,
      fu: w.fu,
      units: w.units,
      deltas,
      doraIndicators: this.doraIndicators.slice(),
      uraIndicators: this.riichi[seat] ? this.uraIndicators.slice() : [],
      scores: this.scores.slice(),
    };
    this.push(`Seat ${seat + 1} wins — ${w.label}`);
    this.phase = 'hand-over';
    this.prepareNext({ winner: seat, draw: false });
    return { ok: true, result: this.result };
  }

  exhaustiveDraw() {
    const tenpai = [];
    for (let s = 0; s < 4; s++) {
      const w = waits(this.concealedCounts(s), this.needSets(s), {
        thirteen: this.v.thirteenOrphans, sevenPairs: this.v.sevenPairs, closed: this.melds[s].every((m) => !m.open),
      });
      if (w.length) tenpai.push(s);
    }
    const deltas = [0, 0, 0, 0];
    const penalty = this.v.notenPenalty || 0;
    if (penalty && tenpai.length > 0 && tenpai.length < 4) {
      const per = penalty / tenpai.length;
      const cost = penalty / (4 - tenpai.length);
      for (let s = 0; s < 4; s++) deltas[s] = tenpai.includes(s) ? Math.round(per) : -Math.round(cost);
    }
    for (let s = 0; s < 4; s++) this.scores[s] += deltas[s];
    this.result = {
      kind: 'draw',
      tenpai,
      hands: this.hands.map((h, s) => (tenpai.includes(s) ? sortTiles(h) : null)),
      deltas,
      scores: this.scores.slice(),
      label: 'Wall exhausted',
    };
    this.push('Wall exhausted — no winner');
    this.phase = 'hand-over';
    this.prepareNext({ winner: null, draw: true, tenpai });
    return { ok: true, result: this.result };
  }

  prepareNext({ winner, draw, tenpai = [] }) {
    const v = this.v;
    let keepDeal;
    if (draw) {
      keepDeal = v.dealerRepeatsIfTenpai ? tenpai.includes(this.dealer) : v.dealerRepeatsOnDraw;
    } else {
      keepDeal = v.dealerRepeatsOnWin && winner === this.dealer;
    }
    this.pending = { keepDeal, draw, winner };
    this.result.next = {
      keepDeal,
      roundWind: this.roundWind,
      dealer: keepDeal ? this.dealer : next(this.dealer),
      matchOver: !keepDeal && next(this.dealer) === 0 && this.roundWind + 1 >= this.rounds,
    };
  }

  nextHand() {
    if (this.phase !== 'hand-over') return { error: 'hand still in progress' };
    const { keepDeal, draw, winner } = this.pending;
    this.history.push({ handNo: this.handNo, result: this.result });
    if (keepDeal) {
      this.honba++;
      this.continuation++;
    } else {
      this.honba = draw ? this.honba + 1 : 0;
      this.continuation = 0;
      const wasLast = this.dealer === 3;
      this.dealer = next(this.dealer);
      if (wasLast) {
        this.roundWind++;
        if (this.roundWind >= this.rounds) {
          this.phase = 'match-over';
          this.push('Match over');
          return { ok: true, matchOver: true };
        }
      }
    }
    void winner;
    this.startHand();
    return { ok: true };
  }

  // -------------------------------------------------------------------- views

  publicState() {
    return {
      variant: this.variantId,
      variantName: this.v.name,
      handSize: this.v.handSize,
      phase: this.phase,
      roundWind: this.roundWind,
      rounds: this.rounds,
      dealer: this.dealer,
      handNo: this.handNo,
      honba: this.honba,
      riichiPot: this.riichiPot,
      turn: this.turn,
      wall: this.wall?.length ?? 0,
      scores: this.scores.slice(),
      melds: this.melds,
      bonus: this.bonus,
      discards: this.discards,
      river: this.river,
      handCounts: this.hands?.map((h) => h.length) ?? [0, 0, 0, 0],
      drawnBy: this.drawn !== null ? this.turn : null,
      lastDiscard: this.lastDiscard,
      doraIndicators: this.doraIndicators ?? [],
      riichiSeats: this.riichi?.map((r) => !!r) ?? [false, false, false, false],
      claimPending: this.claim
        ? Object.keys(this.claim.options).filter((s) => !this.claim.responses[s]).map(Number)
        : [],
      result: this.result,
      log: this.log.slice(-24),
      useBonus: this.v.bonusTiles,
      useRiichi: this.v.riichi,
    };
  }

  view(seat) {
    const pub = this.publicState();
    if (seat === null || seat === undefined) return { ...pub, seat: null, hand: null, legal: null };
    return {
      ...pub,
      seat,
      seatWind: (seat - this.dealer + 4) % 4,
      hand: sortTiles(this.hands?.[seat] ?? []),
      drawn: this.turn === seat ? this.drawn : null,
      furiten: this.furiten?.[seat] || this.tempFuriten?.[seat] || false,
      legal: this.phase === 'idle' ? null : this.legal(seat),
    };
  }
}

function previewOf(w) {
  return { label: w.label, value: w.value, unit: w.unit, patterns: w.patterns?.map((p) => p.en) ?? [] };
}

export { checkWin, doraOf };
