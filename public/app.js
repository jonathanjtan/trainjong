import { tileEl, NAMES } from './tiles.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const TABLE_VIEW = q.get('view') === 'table';
const ROOM = (q.get('room') || 'table').toLowerCase();
const WINDS = ['東', '南', '西', '北'];
const WIND_EN = ['East', 'South', 'West', 'North'];

let ws = null, sync = null, backoff = 400, live = false;
let token = localStorage.getItem('mj_token') || '';
let myName = localStorage.getItem('mj_name') || '';
let sel = null;              // index into the rack
let riichiArmed = false;
let kongOpen = false;
let showLobby = true;
let seatsOpen = false;
let showLastHand = false;
let muted = localStorage.getItem('mj_muted') === '1';
let buzz = localStorage.getItem('mj_buzz') !== '0';
// the rotated-band table is the default; this falls back to the flat one
let simpleLayout = localStorage.getItem('mj_simple') === '1';
let seenBonus = 0, bonusPrimed = false;
let lastTurnSeat = null, lastPhase = null, clockTimer = null, lastHandNo = null;
// the claim clock is kept on our own monotonic clock, not the server's wall
// time — four phones on a train share a router, not an NTP server
let claimEndsAt = null;

if (TABLE_VIEW) document.body.classList.add('table-view');

// ---------------------------------------------------------------- transport

/* Coming back from a locked phone can start two connections at once: the close
   event schedules a retry, and the visibility handler opens one immediately.
   Both sockets then talk to the room quite happily — but when the loser finally
   dies, its close event used to raise the "lost the table" curtain over a
   perfectly live connection, and render() bails out behind that curtain. So
   every socket carries a generation, and a stale one is allowed to die quietly. */
let wsGen = 0;
let reconnectTimer = null;

function connect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (ws) { try { ws.close(); } catch { /* already gone */ } }
  const gen = ++wsGen;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(ROOM)}`);
  ws = sock;
  sock.onopen = () => {
    if (gen !== wsGen) { try { sock.close(); } catch { /* already gone */ } return; }
    live = true; backoff = 400; dead(false);
    send({ t: 'hello', token, name: myName, room: ROOM });
  };
  sock.onmessage = (e) => {
    if (gen !== wsGen) return;
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'welcome') {
      token = m.token; myName = m.name;
      localStorage.setItem('mj_token', token);
      localStorage.setItem('mj_name', myName || '');
      return;
    }
    if (m.t === 'sync') { onSync(m); return; }
    if (m.t === 'error') toast(m.msg);
  };
  sock.onclose = () => {
    if (gen !== wsGen) return;          // superseded: someone else owns the table now
    live = false; dead(true);
    backoff = Math.min(4000, backoff * 1.7);
    reconnectTimer = setTimeout(connect, backoff);
  };
  sock.onerror = () => { try { sock.close(); } catch { /* ignore */ } };
}

function send(o) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
}

// one action per state: a fat-fingered double tap should not fire twice
let actLock = false;
function act(action) {
  if (actLock) return;
  actLock = true;
  send({ t: 'action', action });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  // a phone that has been away long enough for the server's heartbeat to cull it
  // still shows readyState OPEN until the FIN lands, so don't trust that alone:
  // say hello again and let the fresh snapshot correct whatever we drifted into
  backoff = 400;
  if (!ws || ws.readyState > 1) connect();
  else send({ t: 'hello', token, name: myName, room: ROOM });
  // iOS suspends the audio context behind a lock screen; nudge it awake so the
  // first cue after unlocking the phone is not the one that gets swallowed
  if (audio && audio.state !== 'running') audio.resume?.().catch(() => { /* needs a tap */ });
});
window.addEventListener('online', () => { backoff = 400; if (!ws || ws.readyState > 1) connect(); });

function onSync(m) {
  const prev = sync;
  sync = m;
  actLock = false;
  const g = m.game;
  if (g && g.phase !== 'idle' && showLobby && prev?.game?.phase !== g.phase) showLobby = false;
  if (!g || g.phase === 'idle') showLobby = true;
  if (seatsOpen && (!g || g.phase === 'idle' || m.you.seat !== null)) seatsOpen = false;
  claimEndsAt = m.room.claimMs == null ? null : performance.now() + m.room.claimMs;
  // animation keys are scoped to a hand; drop them when a new one is dealt, and
  // so are the cue edges — a dealer who repeats starts the new hand on the seat
  // they ended the last one on, and used to get no cue at all for it
  if (g && g.handNo !== lastHandNo) {
    seenKeys.clear(); lastHandNo = g.handNo;
    lastTurnSeat = null; lastPhase = null;
  }
  if (g && g.seat !== null) {
    if (g.turn !== lastTurnSeat) { sel = null; kongOpen = false; riichiArmed = false; }
    const mine = g.phase === 'play' && g.turn === g.seat;
    const claim = g.phase === 'claim' && (g.legal?.win || g.legal?.pung || g.legal?.chows || g.legal?.kong !== undefined);
    // Vibration has no intensity control — length and repetition are the only
    // levers, so both cues use a pattern rather than one short buzz.
    if (mine && lastTurnSeat !== g.turn) { ping(720); haptic([90, 70, 90]); }
    if (claim && lastPhase !== 'claim') { ping(880, { urgent: true }); haptic([130, 70, 130, 70, 220]); }
    lastTurnSeat = g.turn;
    lastPhase = g.phase;
  }
  checkBonus(g);
  render();
}

// Flowers are replaced automatically by the rules, but they should never appear
// silently — show the player exactly what they picked up.
function checkBonus(g) {
  if (!g || g.seat === null || g.seat === undefined) { seenBonus = 0; bonusPrimed = false; return; }
  const evs = (g.bonusEvents || []).filter((e) => e.seat === g.seat);
  // joined mid-hand: catch up to whatever is already on the table, don't replay
  if (!bonusPrimed) {
    bonusPrimed = true;
    if (evs.length) seenBonus = evs[evs.length - 1].n;
    return;
  }
  // the event counter runs across the whole match, but each new hand starts with
  // an empty list — an empty list is not a reason to forget where we were, or
  // the first flower of every hand goes by in silence
  if (!evs.length) return;
  const fresh = evs.filter((e) => e.n > seenBonus);
  if (!fresh.length) return;
  seenBonus = evs[evs.length - 1].n;
  showBonus(fresh.map((e) => e.tile));
  ping(990);
  haptic([20, 40, 20]);
}

let bonusTimer = null;
function showBonus(tiles) {
  const el = $('bonus');
  el.innerHTML = `<div class="bonuscard">
    <div class="cjk mark">花</div>
    <div class="tiles">${tiles.map((t) => tileEl(t, { size: 'lg' })).join('')}</div>
    <div class="txt"><b>${tiles.length > 1 ? 'Bonus tiles' : NAMES[tiles[0]] || 'Bonus tile'}</b>
      <span>set aside · ${tiles.length > 1 ? 'replacements' : 'a replacement'} drawn</span></div>
    <button class="ghost" data-a="bonusok">OK</button>
  </div>`;
  clearTimeout(bonusTimer);
  // auto-clears so a distracted player can never hold up the table
  bonusTimer = setTimeout(() => { el.innerHTML = ''; }, 7000);
}

// ------------------------------------------------------------------- helpers

function haptic(pattern) {
  if (!buzz) return;
  // Android fires this; iOS Safari has no vibration API, hence the sound too.
  // Chrome also needs the document to have been tapped at least once, which
  // unlockAudio's listeners guarantee by the time any cue fires.
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/* Mobile audio is gesture-gated. Every cue we want to play (your turn, someone
   discarded) originates in a WebSocket callback, which browsers do not count as
   a user gesture — a context created there is born suspended and stays silent
   forever. So the context is built and unlocked from real taps instead, and
   every tap afterwards tops it back up, because iOS re-suspends on background. */
let audio = null;
let audioUnlocked = false;

function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') audio.resume().catch(() => { /* not this tap */ });
    if (!audioUnlocked) {
      // iOS will not honour later scheduled sound until something has actually
      // been played through the context from inside a gesture
      const src = audio.createBufferSource();
      src.buffer = audio.createBuffer(1, 1, 22050);
      src.connect(audio.destination);
      src.start(0);
      audioUnlocked = true;
    }
  } catch { /* no audio, no problem */ }
}

// iOS routes Web Audio through the "ambient" session by default, which the
// physical ringer switch silences. 16.4+ lets us ask for playback instead.
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older iOS */ }

for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, unlockAudio, { capture: true, passive: true });
}

/* A phone speaker has almost no bass and very little headroom, so "louder"
   comes from compression and from putting the energy up where the speaker is
   efficient (roughly 1–3 kHz) — not from turning one quiet sine up until it
   clips. Everything runs through a limiter so the peaks can be driven hard. */
let master = null;
function audioOut() {
  if (master) return master;
  const comp = audio.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 12;
  comp.attack.value = 0.002;
  comp.release.value = 0.14;
  master = audio.createGain();
  master.gain.value = 2.4;
  master.connect(comp).connect(audio.destination);
  return master;
}

function ping(freq, { urgent = false } = {}) {
  if (muted) return;
  if (!audio) { unlockAudio(); if (!audio) return; }
  // coming back from a locked screen leaves the context suspended
  if (audio.state !== 'running') audio.resume?.().catch(() => { /* stays quiet */ });
  try {
    const t = audio.currentTime;
    const out = audioOut();
    const tone = (f, at, dur, peak, type = 'triangle') => {
      const o = audio.createOscillator(), gn = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t + at);
      gn.gain.setValueAtTime(0.0001, t + at);
      gn.gain.exponentialRampToValueAtTime(peak, t + at + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(gn).connect(out);
      o.start(t + at);
      o.stop(t + at + dur + 0.02);
    };
    // fundamental plus a fifth and an octave: the harmonics are what actually
    // gets through a tiny speaker, and they make the cue read as louder
    tone(freq, 0, 0.3, 0.5);
    tone(freq * 1.5, 0.05, 0.26, 0.32);
    tone(freq * 2, 0.02, 0.2, 0.2, 'square');
    // a claim is time-limited, so it gets a second, higher strike to stand out
    if (urgent) {
      tone(freq * 1.34, 0.2, 0.3, 0.5);
      tone(freq * 2, 0.24, 0.26, 0.3);
      tone(freq * 2.68, 0.22, 0.2, 0.16, 'square');
    }
  } catch { /* no audio, no problem */ }
}

let toastTimer = null;
function toast(msg) {
  $('toast').innerHTML = `<div class="toast">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').innerHTML = ''; }, 2600);
}

function dead(on) {
  const el = $('sheet');
  if (!on) { if (el.dataset.dead) { el.dataset.dead = ''; el.innerHTML = ''; render(); } return; }
  el.dataset.dead = '1';
  el.innerHTML = `<div class="dead"><div><div class="title-mark">麻雀</div>
    <p>Lost the table. Reconnecting…</p>
    <p class="sub">Check you're still on the router's wi-fi.</p></div></div>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// render() rebuilds the board from scratch on every sync, so a CSS animation
// baked into the markup would replay on every tile several times a turn. Each
// animated thing gets a key; only the first render that sees it animates.
const seenKeys = new Set();
function once(key) {
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  return true;
}
const seatName = (s) => sync?.room.seats[s]?.name || `Seat ${s + 1}`;
const windOf = (seat, dealer) => (seat - dealer + 4) % 4;

// -------------------------------------------------------------------- render

function render() {
  if ($('sheet').dataset.dead) return;
  const g = sync?.game;
  if (!sync) return;
  renderRail(g);
  renderTable(g);
  renderMine(g);
  renderTray(g);
  renderSheet(g);
  renderSeats();
  // last: the footer above sets the hand's height, which is what decides how
  // much room the table actually has to fit into
  fitTable();
}

function renderRail(g) {
  if (!g || g.phase === 'idle') {
    $('rail').innerHTML = `<span class="round cjk">麻雀</span>
      <span class="eyebrow">${esc(sync.room.name)} · ${esc(sync.room.config.variantId)}</span>
      <span class="meta">${railButtons(g)}</span>`;
    return;
  }
  // Two rails, because the two layouts want different things here. The arena
  // carries the round and the wall in its middle slab, so repeating them up here
  // only costs width a narrow phone does not have — it spends that on the dora
  // and the last move instead, which the arena has nowhere to put. The flat
  // layout is the other way round: its hub owns the commentary, and the round
  // and wall were moved out here precisely to stop the hub crowding the ponds.
  $('rail').innerHTML = `
    <span class="round cjk">${WINDS[g.roundWind]}</span>
    ${simpleLayout ? `<span class="eyebrow">${WIND_EN[g.roundWind]} · hand ${g.handNo}</span>
      <span class="wallcount"><b>${g.wall}</b> left</span>` : ''}
    ${!simpleLayout && g.doraIndicators?.length
      ? `<span class="raildora">${g.doraIndicators.map((t) => tileEl(t)).join('')}</span>` : ''}
    ${!simpleLayout ? `<span class="railmsg">${esc(g.log[g.log.length - 1]?.msg || '')}</span>` : ''}
    <span class="meta">
      ${g.honba ? `<span class="eyebrow">本場 <b>${g.honba}</b></span>` : ''}
      ${g.riichiPot ? `<span class="eyebrow">pot <b>${g.riichiPot}</b></span>` : ''}
      ${railButtons(g)}
    </span>`;
}

function railButtons(g) {
  const canJoin = g && g.phase !== 'idle' && sync.you.seat === null;
  return `${canJoin ? `<button class="mini" data-a="seats" title="Take a bot's seat">seats</button>` : ''}
    <button class="mini ${simpleLayout ? 'on' : ''}" data-a="simple"
      title="Flat layout — every seat upright">simple</button>
    <button class="mini" data-a="guide" title="How to play">?</button>
    <button class="mini" data-a="mute" title="Sound">${muted ? '🔇' : '🔔'}</button>
    ${'vibrate' in navigator ? `<button class="mini ${buzz ? 'on' : ''}" data-a="buzz" title="Vibrate on your turn">buzz</button>` : ''}
    ${TABLE_VIEW ? `<button class="mini" data-a="full" title="Fullscreen">full</button>` : ''}`;
}

function renderSeats() {
  const el = $('seats');
  if (!el) return;
  if (!seatsOpen || !sync) { el.innerHTML = ''; return; }
  const r = sync.room;
  const seatBtns = r.seats.map((s, i) => `
    <button class="${s.name ? 'taken' : ''}" ${s.bot ? '' : 'disabled'} data-a="sit" data-seat="${i}">
      <span class="wind cjk">${WINDS[i]}</span>
      <span class="nm">${s.name ? esc(s.name) : 'open seat'}${s.bot ? ' — tap to take over' : ''}</span>
    </button>`).join('');
  el.innerHTML = `<div class="sheet-inner">
    <h1>Take a seat</h1>
    <div class="sub">Bot-controlled seats can be taken over mid-game.</div>
    <div class="seatpick">${seatBtns}</div>
    <div class="actions"><button class="ghost" data-a="closeseats">Close</button></div>
  </div>`;
}

function renderTable(g) {
  const board = $('board');
  if (!g || g.phase === 'idle') {
    board.innerHTML = `<div class="hub idlehub">
      <div class="rw cjk">麻</div><div class="last">Waiting in the lobby</div></div>`;
    return;
  }
  const me = g.seat === null || g.seat === undefined ? 0 : g.seat;
  // turn order runs counter-clockwise, so the seat after yours sits on your right
  const at = { bottom: me, right: (me + 1) % 4, top: (me + 2) % 4, left: (me + 3) % 4 };
  board.innerHTML = simpleLayout ? flatTable(g, at) : arenaTable(g, at);
}

/* The same table the arena draws — each seat's melds along their own edge, their
   discards pooled around the middle — but on a three-by-three grid instead of
   four rotated bands, so every tile faces the reader.

   Where the arena lays out an opponent's concealed tiles one by one, this one
   counts them on a single face-down tile. Thirteen backs are a bar as long as
   the pond and say nothing thirteen does not; spending that edge on the melds
   instead is what gives each seat a shape you can read from across the table. */
function flatTable(g, at) {
  const dirOf = {};
  for (const [dir, seat] of Object.entries(at)) dirOf[seat] = dir;
  const arrow = { top: '▲', bottom: '▼', left: '◀', right: '▶' }[dirOf[g.turn]] || '';

  return `<div class="flat">
    ${DIRS.map((dir) => fband(g, at[dir], dir)).join('')}
    <div class="f-hub hubwrap">
      <div class="hub compact">
        ${g.doraIndicators?.length ? `<div class="dora">${g.doraIndicators.map((t) => tileEl(t)).join('')}</div>` : ''}
        <div class="last">${esc(g.log[g.log.length - 1]?.msg || '')}</div>
      </div>
      ${arrow ? `<div class="arrow a-${dirOf[g.turn]}">${arrow}</div>` : ''}
    </div>
  </div>
  <div class="plates">${DIRS.map((dir) => plate(g, at[dir], dir, true)).join('')}</div>`;
}

/* Edge first, pond second: the stylesheet reverses the two bands whose edge is
   the far side of the box, so all four read from their own edge inwards. */
function fband(g, seat, dir) {
  const { pond, melds } = seatParts(g, seat);
  const count = showsWall(g, seat)
    ? `<div class="hcount">${tileEl(0, { back: true })}<span class="n num">${g.handCounts[seat]}</span></div>` : '';
  return `<div class="fband f-${dir}">
    <div class="fedge">${count}${melds ? `<div class="fmelds">${melds}</div>` : ''}</div>
    <div class="pond">${pond}</div>
  </div>`;
}

/* ------------------------------------------------------------------ arena */
/* The table the way Mahjong Soul and Amatsuki draw it: discards pooled in the
   middle in four blocks, each block — and each player's concealed wall, melds
   and plate with it — turned to face the seat it belongs to.

   All of that is one band, written once for the bottom player and then rotated
   0/90/180/270° about the middle of the square for the other three. Nothing is
   positioned per-seat, so the four sides cannot drift out of agreement: every
   dimension is a multiple of --dw and the geometry is symmetric by construction.
   The plate is the one exception — it rides along in the corner but counter-
   rotates its text, because an upside-down name is just unreadable. */

/* Six to a row, three rows — the reference's ratio, and the shape that buys the
   most tile for the space (shorter rows need more of them, which pushes the
   ponds inward and costs more than it saves). The stylesheet is told this
   number rather than repeating it: when the two drifted apart, the predictor
   below reserved three rows for a pond that wrapped to four and the last row
   spilled into the wall strip. */
const POND_COLS = 6;
const DIRS = ['bottom', 'right', 'top', 'left'];

/* The pond has a fixed height so the four bands stay the same size, which means
   we have to know up front how many rows the longest one wants. Mirrors what
   flex wrap will do: fill greedily, and count a sideways riichi tile as wider. */
function pondRows(river, seat) {
  let rows = 1, used = 0;
  for (const d of river) {
    if (d.seat !== seat) continue;
    const w = d.riichi ? 1.4 : 1;
    if (used + w > POND_COLS + 0.01) { rows++; used = w; } else used += w;
  }
  return rows;
}

function arenaTable(g, at) {
  const prows = Math.max(3, ...[0, 1, 2, 3].map((s) => pondRows(g.river, s)));
  return `<div class="arena" style="--prows:${prows};--cols:${POND_COLS}">
    ${DIRS.map((dir) => band(g, at[dir], dir)).join('')}
    ${centre(g, at)}
  </div>
  <div class="plates">${DIRS.map((dir) => plate(g, at[dir], dir)).join('')}</div>`;
}

/* Names sit outside the table, not on it. On it they had to lie back with
   everything else, which reads badly on a real phone, and each one reserved a
   corner of its band that the wall and melds then had to squeeze around. Out
   here they are upright, they float in the felt the table does not use, and the
   strips get that corner back — worth about 70% more room along the edge. */
const CORNER = { bottom: 'bl', right: 'br', top: 'tr', left: 'tl' };

function plate(g, seat, dir, withScore = false) {
  const s = sync.room.seats[seat];
  const chips = [
    g.dealer === seat ? '<span class="chip cjk">莊</span>' : '',
    g.riichiSeats?.[seat] ? '<span class="chip riichi cjk">立</span>' : '',
    s.bot ? '<span class="chip">bot</span>' : '',
    s.name && !s.connected ? '<span class="chip off">away</span>' : '',
    g.phase === 'claim' && g.claimPending?.includes(seat) ? '<span class="chip">…</span>' : '',
  ].filter(Boolean).join('');
  return `<div class="nplate c-${CORNER[dir]} ${g.turn === seat && g.phase !== 'hand-over' ? 'turn' : ''} ${seat === g.seat ? 'me' : ''}">
    <span class="wind cjk">${WINDS[windOf(seat, g.dealer)]}</span>
    <span class="nm">${esc(s.name || '—')}</span>
    ${withScore ? `<span class="sc num ${g.scores[seat] < 0 ? 'neg' : ''}">${g.scores[seat]}</span>` : ''}
    ${chips}
  </div>`;
}

/* Your own tiles are the hand in the footer, so only the others show what they
   are holding. The propped-up table has no hand of its own, so it shows all four
   — including when it is opened in the same browser as a seat, which hands it
   that seat's token. */
const showsWall = (g, seat) => seat !== g.seat || TABLE_VIEW;

/* One seat's discards and melds. Both layouts want the same two and differ only
   in how they wrap them, so they are built once here. */
function seatParts(g, seat) {
  const newest = g.river[g.river.length - 1];
  const pond = g.river
    .filter((d) => d.seat === seat)
    .map((d, i, arr) => {
      const isNewest = i === arr.length - 1 && d === newest;
      return tileEl(d.tile, {
        dim: d.taken,
        turned: !!d.riichi,
        ring: isNewest && !d.taken,
        cls: isNewest && once(`d${g.handNo}:${g.river.length}`) ? 'fresh-discard' : '',
      });
    }).join('');
  // flowers as one group, not one tile per line: stacked along a side seat's
  // edge, four loose flowers are four rows and the whole table shrinks to pay
  const melds = g.melds[seat].map((m, i) => meldHTML(m, seat, true,
    once(`m${g.handNo}:${seat}:${i}:${m.type}:${m.tile}`) ? 'fresh-meld' : ''))
    .join('')
    + (g.bonus[seat].length
      ? `<span class="bonusgroup">${g.bonus[seat].map((t) => tileEl(t, { size: 'zone' })).join('')}</span>` : '');
  return { pond, melds };
}

function band(g, seat, dir) {
  const { pond, melds } = seatParts(g, seat);
  // the arena has the edge to spare, so it draws the concealed tiles one by one
  const wall = showsWall(g, seat)
    ? `<div class="backs">${Array.from({ length: g.handCounts[seat] }, () => tileEl(0, { back: true })).join('')}</div>` : '';
  return `<div class="band b-${dir}">
    <div class="pond">${pond}</div>
    <div class="bandedge">
      <div class="bcontent">${wall}${melds ? `<div class="bmelds">${melds}</div>` : ''}</div>
    </div>
  </div>`;
}

/* The little slab in the middle: round and wall in the centre, the four scores
   around the rim, each turned towards the seat it belongs to. Whoever is to
   play has their side lit — that replaces the arrow the flat layout uses. */
function centre(g, at) {
  const score = (dir) => {
    const seat = at[dir];
    const on = g.turn === seat && g.phase !== 'hand-over';
    return `<div class="sc s-${dir} ${on ? 'on' : ''}"><span>
      <b class="cjk">${WINDS[windOf(seat, g.dealer)]}</b>
      <i class="num ${g.scores[seat] < 0 ? 'neg' : ''}">${g.scores[seat]}</i></span></div>`;
  };
  return `<div class="chub">
    ${DIRS.map(score).join('')}
    <div class="mid">
      <div class="rw"><span class="cjk">${WINDS[g.roundWind]}</span><i class="num">${g.handNo}</i></div>
      <div class="wl num">×${g.wall}</div>
    </div>
  </div>`;
}

/* Neither table can be sized by CSS alone: how big a tile fits depends on how
   many rows the ponds happen to have wrapped to, which is not a thing a
   stylesheet can ask. Both layouts therefore get their tile size measured out
   here, between the two bounds a tile is worth drawing at. */
const MIN_DW = 10;
const MAX_DW = 64;

function fitTable() {
  if ($('board')?.querySelector('.arena')) return fitArena();
  return fitFlatTable();
}

/* The arena is a square whose side is a straight line in --dw: some multiple of
   the tile size plus a fixed number of pixels of gap. Rather than restate that
   sum here — where it would rot the moment the CSS changes — set two probe
   sizes, measure what comes out, and solve the line. The result only depends on
   how many rows the ponds asked for, so it caches per row count. Probing is
   done flat: the layout square is what this line describes, and the tilt is
   applied to it afterwards. */
const arenaCal = new Map();

function arenaCalibrate(arena, prows) {
  const hit = arenaCal.get(prows);
  if (hit) return hit;
  const tilt = arena.style.getPropertyValue('--tilt');
  arena.style.setProperty('--tilt', '0deg');
  arena.style.setProperty('--dw', '12px');
  const lo = arena.getBoundingClientRect().width;
  arena.style.setProperty('--dw', '32px');
  const hi = arena.getBoundingClientRect().width;
  arena.style.setProperty('--tilt', tilt);
  const k = (hi - lo) / 20;
  if (!(k > 0)) return null;
  const cal = { k, c: lo - 12 * k };
  arenaCal.set(prows, cal);
  return cal;
}

/* Lay the table back only where there is surplus width to pay for it, and ramp
   the angle with how much: none in portrait, the full tilt on a landscape
   phone. Below a few degrees it reads as a mistake rather than a viewpoint, so
   that range snaps to flat. */
const TILT_MAX = 50;
const TILT_MIN = 8;

function arenaTilt(availW, availH) {
  const t = Math.min(TILT_MAX, Math.max(0, (availW / availH - 1.1) * 45));
  return t < TILT_MIN ? 0 : t;
}

function fitArena() {
  const board = $('board');
  const arena = board?.querySelector('.arena');
  if (!arena) return;
  const cs = getComputedStyle(board);
  const availW = board.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const availH = board.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  if (availW <= 0 || availH <= 0) return;

  const tilt = arenaTilt(availW, availH);
  arena.style.setProperty('--tilt', `${tilt.toFixed(1)}deg`);
  arena.style.setProperty('--shift', '0px');

  const cal = arenaCalibrate(arena, arena.style.getPropertyValue('--prows') || '3');
  if (!cal) { arena.style.setProperty('--dw', '16px'); return; }

  const setSide = (side) => {
    const dw = Math.max(MIN_DW, Math.min(MAX_DW, (side - cal.c) / cal.k));
    arena.style.setProperty('--dw', `${dw.toFixed(2)}px`);
    return arena.getBoundingClientRect();
  };

  let box = setSide(Math.min(availW, availH));
  if (tilt) {
    // Tilted, the square projects to a fixed multiple of itself in each axis —
    // fixed because the vanishing distance scales with the table. So one
    // measurement gives the ratio and the fit lands in a single correction; the
    // second pass is only there to absorb the px rounding in the tile size.
    for (let i = 0; i < 2; i++) {
      const side = arena.offsetWidth;
      const room = Math.min(availW / box.width, availH / box.height);
      if (room > 0.997 && room < 1.006) break;
      box = setSide(side * room);
    }
    // the projection is not centred on the layout box — the near edge reaches
    // further down than the far edge reaches up — so put it back in the middle
    const br = board.getBoundingClientRect();
    const want = br.top + (parseFloat(cs.paddingTop) || 0) + availH / 2;
    arena.style.setProperty('--shift', `${(want - (box.top + box.height / 2)).toFixed(1)}px`);
  }
}

/* Discards to a row: near seats first, side seats second. Which shape suits a
   board is not something you can read off its proportions — it turns on how
   many rows each pond has wrapped to and how much the melds have taken — so try
   a few and keep whichever affords the biggest tile. A shape that cannot beat
   the champion at the champion's own size is dropped after one measurement, so
   the search costs about one bisection rather than five. */
const POND_SHAPES = [[6, 5], [8, 6], [10, 6], [6, 4], [5, 3]];
let flatShape = POND_SHAPES[0];              // last winner, tried first and kept on ties

/* The flat table shrink-wraps its content, so — unlike the arena, whose side is
   a straight line in --dw that can be solved outright — its size is whatever the
   grid happens to work out to: bands that wrap, a hub with clamped text, four
   ponds that gain a row at their own moments. So bisect instead of solve. The
   box is monotonic in the tile size (bigger tiles are bigger, and they wrap the
   ponds into more rows besides), so the predicate flips exactly once and every
   bisection lands on a size that fits both axes. */
function fitFlatTable() {
  const board = $('board');
  const flat = board?.querySelector('.flat');
  if (!flat) return;
  const cs = getComputedStyle(board);
  const availW = board.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const availH = board.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
  if (availW <= 0 || availH <= 0) return;

  const shape = ([cols, scols]) => {
    flat.style.setProperty('--cols', cols);
    flat.style.setProperty('--scols', scols);
  };
  const fits = (dw) => {
    flat.style.setProperty('--dw', `${dw.toFixed(1)}px`);
    return flat.offsetWidth <= availW && flat.offsetHeight <= availH;
  };

  let best = 0, winner = flatShape;
  const tried = new Set();
  for (const s of [flatShape, ...POND_SHAPES]) {
    if (tried.has(String(s))) continue;
    tried.add(String(s));
    shape(s);
    // half a pixel of hysteresis: a shape has to actually be better to take the
    // table off the one already in front of the players
    let lo = Math.max(MIN_DW, best + 0.5);
    if (!fits(lo)) continue;
    let hi = MAX_DW;
    if (fits(hi)) { best = hi; winner = s; break; }   // all the room in the world
    for (let i = 0; i < 7 && hi - lo > 0.4; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid; else hi = mid;
    }
    best = lo;
    winner = s;
  }
  flatShape = winner;
  shape(winner);
  fits(best || MIN_DW);
}

// the fit depends on viewport height, which changes when phone chrome slides
// away or the device rotates
let fitPending = false;
for (const ev of ['resize', 'orientationchange']) {
  window.addEventListener(ev, () => {
    if (fitPending) return;
    fitPending = true;
    // a rotation can cross a media query, which may move the numbers the arena
    // calibration was solved from
    arenaCal.clear();
    requestAnimationFrame(() => { fitPending = false; fitTable(); });
  });
}

/* Every mahjong table lays a claimed tile on its side, and which side of the
   meld it lies on says who it was claimed from: the outer left tile for the
   player on your left, the middle for the one across, the outer right for the
   one on your right. It is the only record of who fed whom, and it is read at a
   glance from across the table — so the meld is built around that slot, with
   the claimed tile moved into it and the rest kept in order.
   Returns the index of the slot, or -1 for a meld nobody was fed. */
function claimedSlot(m, seat, n) {
  if (!m.open || m.from === null || m.from === undefined || seat === undefined || seat === null) return -1;
  // turn order runs counter-clockwise: the seat after yours sits on your right
  const rel = (m.from - seat + 4) % 4;
  return rel === 3 ? 0 : rel === 1 ? n - 1 : rel === 2 ? 1 : -1;
}

function meldHTML(m, seat, compact = false, extra = '') {
  // an added kong is a pung with the fourth tile laid across its claimed tile,
  // so it is drawn from three slots, not four
  const added = m.kongType === 'added';
  const ts = m.type === 'chow' ? [m.tile, m.tile + 1, m.tile + 2]
    : m.type === 'kong' && !added ? [m.tile, m.tile, m.tile, m.tile]
      : [m.tile, m.tile, m.tile];
  const size = compact ? 'zone' : 'xs';
  const slot = claimedSlot(m, seat, ts.length);
  let order = ts;
  if (slot >= 0) {
    const rest = ts.slice();
    const i = rest.indexOf(m.claimed);
    if (i >= 0) order = [...rest.slice(0, i), ...rest.slice(i + 1)];
    order = [...order.slice(0, slot), m.claimed ?? m.tile, ...order.slice(slot)];
  }
  const inner = order.map((t, i) => {
    if (i === slot && added) {
      return `<span class="kstack">${tileEl(t, { size, turned: true }).repeat(2)}</span>`;
    }
    return tileEl(t, {
      size,
      turned: i === slot,
      back: m.type === 'kong' && !m.open && (i === 0 || i === 3),
    });
  }).join('');
  return `<span class="meld ${m.open ? '' : 'closed'} ${extra}">${inner}</span>`;
}

function renderMine(g) {
  if (TABLE_VIEW) { $('mine').innerHTML = ''; return; }
  if (!g || g.seat === null || g.phase === 'idle') {
    $('mine').innerHTML = `<div class="hint">Watching. Take a seat from the lobby to play.</div>`;
    return;
  }
  const hand = g.hand.slice();
  let drawnIdx = -1;
  if (g.drawn !== null && g.drawn !== undefined) {
    drawnIdx = hand.lastIndexOf(g.drawn);
    if (drawnIdx >= 0) hand.splice(drawnIdx, 1);
  }
  const l = g.legal || {};
  const myTurn = g.phase === 'play' && g.turn === g.seat;
  const canPick = (t) => myTurn && (!riichiArmed ? (l.discard || []).includes(t) : (l.riichi || []).includes(t));

  const rack = hand.map((t, i) => {
    const on = sel === i;
    const ok = canPick(t);
    return tileEl(t, { size: 'md', dim: myTurn && !ok }).replace('class="tile',
      `data-i="${i}" class="tile ${on ? 'sel' : ''} ${ok ? 'pick' : ''}`);
  }).join('');
  const freshDraw = drawnIdx >= 0 && once(`w${g.handNo}:${g.river.length}:${g.drawn}`) ? 'fresh-draw' : '';
  const drawnTile = drawnIdx >= 0
    ? tileEl(g.drawn, { size: 'md', dim: myTurn && !canPick(g.drawn) }).replace('class="tile',
      `data-i="${hand.length}" class="tile drawn ${freshDraw} ${sel === hand.length ? 'sel' : ''} ${canPick(g.drawn) ? 'pick' : ''}`)
    : '';

  const myMelds = g.melds[g.seat].map((m) => meldHTML(m, g.seat, true)).join('');
  const myBonus = g.bonus[g.seat].map((t) => tileEl(t, { size: 'zone' })).join('');
  // slots = everything shown on the hand row, so tiles never overflow the width
  // and never grow past their start-of-hand size when you meld
  const meldTiles = g.melds[g.seat].reduce((n, m) => n + (m.type === 'kong' ? 4 : 3), 0);
  const shown = hand.length + 1 + meldTiles + g.bonus[g.seat].length + 1;
  const slots = Math.max((g.handSize || 13) + 1, shown);

  let hint = '';
  if (g.phase === 'hand-over') hint = 'Hand over.';
  else if (myTurn && sel !== null) hint = 'Tap the raised tile again to discard it.';
  else if (myTurn && riichiArmed) hint = 'Riichi armed — pick a tile that keeps you ready.';
  else if (myTurn) hint = '<b>Your turn.</b> Tap a tile, then tap again to discard.';
  else if (g.phase === 'claim') hint = 'Someone discarded.';
  else hint = `Waiting on ${esc(seatName(g.turn))}.`;
  if (g.furiten) hint += ' <span class="chip">furiten</span>';

  const actions = [];
  if (myTurn && l.win) actions.push(`<button class="hot" data-a="tsumo"><span class="cjk">胡</span>${l.win.preview?.label || 'Win'}</button>`);
  if (myTurn && l.kongs?.length) {
    if (!kongOpen) actions.push(`<button data-a="kongmenu"><span class="cjk">槓</span>Kong</button>`);
    else actions.push(...l.kongs.map((k) => `<button data-a="kong" data-tile="${k.tile}" data-kt="${k.type}">${NAMES[k.tile]} ${k.type === 'added' ? '+' : '×4'}</button>`));
  }
  if (myTurn && l.riichi?.length) {
    actions.push(`<button data-a="riichi" class="${riichiArmed ? 'primary' : ''}"><span class="cjk">立</span>Riichi</button>`);
  }
  if (g.phase === 'hand-over') actions.push(`<button class="primary" data-a="next">Next hand</button>`);

  // --rowslots drives the two-row rack on portrait phones. It counts only the
  // concealed tiles, because melds and flowers wrap to their own line there —
  // charging the rack for them would strand a tile on a third row. A short rack
  // (post-melds) stays on one line, where it is already comfortably large.
  const rackCount = hand.length + (drawnIdx >= 0 ? 1 : 0);
  const rowslots = rackCount > 9 ? Math.ceil(rackCount / 2) : rackCount;

  $('mine').innerHTML = `
    <div class="handrow" style="--slots:${slots};--rowslots:${rowslots}">
      <div class="rack">${rack}${drawnTile}</div>
      ${myMelds || myBonus ? `<div class="handmelds">${myMelds}${myBonus ? `<span class="bonusgroup">${myBonus}</span>` : ''}</div>` : ''}
    </div>
    <div class="hint">${hint}</div>
    <div class="actions">${actions.join('')}</div>`;
}

function renderTray(g) {
  const el = $('tray');
  const l = g?.legal || {};
  const claimable = g && g.phase === 'claim' && (l.win || l.pung || l.chows?.length || l.kong !== undefined);
  document.body.classList.toggle('claiming', !!claimable && !TABLE_VIEW);
  if (!claimable || TABLE_VIEW) {
    el.innerHTML = '';
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    return;
  }
  const d = g.lastDiscard;
  const opts = [];
  if (l.win) opts.push(`<button class="hot" data-a="ron"><span class="cjk">胡</span>${l.win.preview?.label || 'Win'}</button>`);
  if (l.pung) opts.push(`<button class="primary" data-a="pung"><span class="cjk">碰</span>Pung</button>`);
  if (l.kong !== undefined) opts.push(`<button class="primary" data-a="ckong"><span class="cjk">槓</span>Kong</button>`);
  for (const [i, c] of (l.chows || []).entries()) {
    opts.push(`<button class="primary chowopt" data-a="chow" data-ci="${i}"><span class="cjk">上</span>
      ${tileEl(c[0], { size: 'xs' })}${tileEl(c[1], { size: 'xs' })}</button>`);
  }
  opts.push(`<button class="ghost" data-a="pass">Pass</button>`);

  el.innerHTML = `<div class="tray">
    <div class="head">
      ${tileEl(d.tile, { size: 'md' })}
      <div><div class="eyebrow">discarded by</div><div class="who">${esc(seatName(d.seat))}</div></div>
      <div class="clock" id="clock"></div>
    </div>
    <div class="opts">${opts.join('')}</div>
  </div>`;
  tickClock();
  if (!clockTimer) clockTimer = setInterval(tickClock, 250);
}

function tickClock() {
  const c = $('clock');
  if (!c) return;
  if (claimEndsAt === null) { c.textContent = ''; return; }
  const left = Math.max(0, claimEndsAt - performance.now());
  c.textContent = left > 0 ? `${Math.ceil(left / 1000)}s` : '';
}

// -------------------------------------------------------------------- sheets

let sheetDeferred = false;
function renderSheet(g) {
  const el = $('sheet');
  // rebuilding the sheet destroys the focused input, which closes the phone
  // keyboard after a single keystroke — hold off until the field is done
  if (document.activeElement && document.activeElement.id === 'nameinput') {
    sheetDeferred = true;
    return;
  }
  sheetDeferred = false;
  // the match ending deserves its own screen — the last hand's scorecard is
  // still reachable behind it rather than being the whole ceremony
  if (g && g.phase === 'match-over' && g.summary && !showLastHand) {
    el.innerHTML = matchSheet(g);
    return;
  }
  if (g && (g.phase === 'hand-over' || g.phase === 'match-over') && g.result) {
    el.innerHTML = resultSheet(g);
    return;
  }
  if (showLobby) { el.innerHTML = lobbySheet(); return; }
  el.innerHTML = '';
}

const PLACE = ['1st', '2nd', '3rd', '4th'];

function matchSheet(g) {
  const s = g.summary;
  const seats = sync.room.seats;
  const champion = s.order[0];
  // equal scores share a place — 2nd and 3rd on the same total reads as wrong
  const placeOf = s.order.map((seat, i, arr) => (i > 0 && s.scores[seat] === s.scores[arr[i - 1]] ? null : i));
  for (let i = 1; i < placeOf.length; i++) if (placeOf[i] === null) placeOf[i] = placeOf[i - 1];
  const rows = s.order.map((seat, i) => `
    <div class="standing ${placeOf[i] === 0 ? 'win' : ''} ${seat === g.seat ? 'you' : ''}">
      <div class="pos"><b>${PLACE[placeOf[i]].replace(/\D+$/, '')}</b><span>${PLACE[placeOf[i]].slice(-2)}</span></div>
      <div class="who">
        <span class="wind cjk">${WINDS[windOf(seat, g.dealer)]}</span>
        <b>${esc(seats[seat]?.name || `Seat ${seat + 1}`)}</b>
        ${seats[seat]?.bot ? '<span class="chip">bot</span>' : ''}
      </div>
      <div class="tally">
        <span>${s.wins[seat]} won</span>
        ${s.selfDraws[seat] ? `<span>${s.selfDraws[seat]} self-drawn</span>` : ''}
        ${s.dealtIn[seat] ? `<span>${s.dealtIn[seat]} dealt in</span>` : ''}
      </div>
      <div class="total ${s.scores[seat] < 0 ? 'neg' : s.scores[seat] > 0 ? 'pos' : ''}">
        ${s.scores[seat] > 0 ? '+' : ''}${s.scores[seat]}</div>
    </div>`).join('');

  return `<div class="sheet-inner matchend">
    <div class="title-mark">終局</div>
    <h1>${esc(seatName(champion))} takes the match</h1>
    <div class="sub">${s.hands} hand${s.hands === 1 ? '' : 's'}${s.draws ? ` · ${s.draws} drawn` : ''}
      · ${WIND_EN[g.roundWind] || ''} finished${s.best ? ` · biggest hand ${esc(s.best.label)} by ${esc(seatName(s.best.seat))}` : ''}</div>
    <div class="standings">${rows}</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="primary" data-a="rematch">Play again</button>
      <button data-a="lasthand">Last hand</button>
      <button class="ghost" data-a="restart">Back to the lobby</button>
    </div>
  </div>`;
}

function resultSheet(g) {
  const r = g.result;
  const seats = sync.room.seats;
  const matchOver = g.phase === 'match-over';
  const head = r.kind === 'win'
    ? `<div class="title-mark">${r.selfDraw ? '自摸' : '和'}</div>
       <h1>${esc(seatName(r.seat))} wins — ${esc(r.label)}</h1>
       <div class="sub">${r.unit === 'faan' ? `${r.units} units per payer` : r.unit === 'tai' ? `${r.units} points per payer` : `${r.units} base points`}${r.fu ? ` · ${r.fu} fu` : ''}</div>`
    : `<div class="title-mark">流局</div><h1>Wall exhausted</h1>
       <div class="sub">${r.tenpai.length ? `Ready: ${r.tenpai.map(seatName).map(esc).join(', ')}` : 'Nobody was ready'}</div>`;

  // note the arrow: map() passes the index too, which would land in `compact`
  const hand = r.kind === 'win'
    ? `<div class="result-hand">${r.hand.map((t) => tileEl(t, { size: 'sm', ring: t === r.winTile })).join('')}
       ${r.melds.map((m) => meldHTML(m, r.seat)).join('')}${r.bonus.map((t) => tileEl(t, { size: 'sm' })).join('')}</div>`
    : '';

  const pats = r.kind === 'win' && r.patterns?.length
    ? `<table class="pat">${r.patterns.map((p) => `<tr>
        <td class="zh">${esc(p.zh || '')}</td><td class="en">${esc(p.en || '')}</td>
        <td class="v">${p.value === '' ? '' : `+${p.value}`}</td></tr>`).join('')}
        <tr class="total"><td class="zh">總</td><td class="en">total</td><td class="v">${esc(r.label)}</td></tr></table>`
    : '';

  const deltas = `<div class="deltas">${r.deltas.map((d, i) => `<div>
      <div class="d ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d}</div>
      <div class="nm">${esc(seats[i]?.name || `Seat ${i + 1}`)}</div>
      <div class="nm num">${r.scores[i]}</div></div>`).join('')}</div>`;

  const waiting = seats.filter((s) => s.name && !s.bot && !s.nextReady).length;
  const btn = matchOver
    ? `<button class="primary" data-a="standings">Final standings</button>`
    : `<button class="primary" data-a="next">Next hand${waiting ? ` (${waiting} to go)` : ''}</button>`;

  return `<div class="sheet-inner">${head}${hand}${pats}${deltas}
    <div class="actions" style="justify-content:flex-start">${btn}
    <button class="ghost" data-a="peek">Look at the table</button></div></div>`;
}

function lobbySheet() {
  const r = sync.room;
  const you = sync.you;
  const seatBtns = r.seats.map((s, i) => `
    <button class="${s.name ? 'taken' : ''} ${you.seat === i ? 'primary' : ''}" data-a="sit" data-seat="${i}">
      <span class="wind cjk">${WINDS[i]}</span>
      <span class="nm">${s.name ? esc(s.name) + (s.ready ? ' ✓' : '') : 'open seat'}</span>
    </button>`).join('');

  const variants = r.variants.map((v) => `
    <button class="variant ${r.config.variantId === v.id ? 'on' : ''}" data-a="variant" data-id="${v.id}">
      <div class="nm">${esc(v.name)}<span class="zh">${esc(v.zh)}</span></div>
      <div class="bl">${esc(v.blurb)}</div>
    </button>`).join('');

  const rounds = [1, 2, 4].map((n) => `<button class="${r.config.rounds === n ? 'on' : ''}" data-a="rounds" data-n="${n}">${n === 1 ? '1 round (東)' : n === 2 ? '2 rounds' : '4 rounds'}</button>`).join('');
  const timers = [0, 10, 20, 45].map((n) => `<button class="${r.config.claimSeconds === n ? 'on' : ''}" data-a="timer" data-n="${n}">${n === 0 ? 'no timer' : `${n}s`}</button>`).join('');

  const seatedNames = r.seats.filter((s) => s.name).length;
  const me = you.seat !== null ? r.seats[you.seat] : null;
  const info = r.scoringInfo;

  return `<div class="sheet-inner">
    <div class="title-mark">麻雀</div>
    <h1>Table “${esc(r.name)}”</h1>
    <div class="sub">${seatedNames}/4 seated${r.watching > 0 ? ` · ${r.watching} watching` : ''} · everyone opens the same address</div>
    <div class="joinurl">${esc(location.origin)}${ROOM !== 'table' ? `/?room=${esc(ROOM)}` : ''}</div>

    <label class="field"><span class="eyebrow">your name</span>
      <input type="text" id="nameinput" value="${esc(you.name || '')}" maxlength="16" placeholder="who are you?"></label>

    <h2>Seat</h2>
    <div class="seatpick">${seatBtns}</div>

    <h2>Ruleset</h2>
    <div class="variants">${variants}</div>
    <div class="optrow">${rounds}</div>
    <div class="optrow"><span class="eyebrow">claim timer</span>${timers}</div>
    <div class="optrow">
      <button class="${r.config.bots ? 'on' : ''}" data-a="bots">${r.config.bots ? 'bots fill empty seats' : 'humans only'}</button>
      <button data-a="mute">${muted ? 'sound off' : 'sound on'}</button>
      ${'vibrate' in navigator ? `<button class="${buzz ? 'on' : ''}" data-a="buzz">${buzz ? 'vibrate on' : 'vibrate off'}</button>` : ''}
      <button data-a="guide">How to play</button>
    </div>
    <div class="sub" style="margin-top:8px">
      ${info.minFaan !== null && info.minFaan !== undefined ? `Minimum ${info.minFaan} faan · limit ${info.limitFaan} · ${info.payment === 'half' ? 'shooter pays double, others a quarter' : 'shooter pays the table'}` : ''}
      ${info.base ? `底 ${info.base} · 台 ${info.taiValue}` : ''}
      ${info.unit === 'points' ? 'Riichi sticks, honba and noten penalties are in play.' : ''}
    </div>

    <div class="actions" style="justify-content:flex-start;margin-top:14px">
      ${you.seat !== null ? `<button class="${me?.ready ? '' : 'primary'}" data-a="ready" data-v="${me?.ready ? '0' : '1'}">${me?.ready ? 'Not ready' : "I'm ready"}</button>` : ''}
      <button class="primary" data-a="start">Start the game</button>
      ${sync.game && sync.game.phase !== 'idle' ? `<button class="ghost" data-a="peek">Back to the table</button>` : ''}
    </div>
  </div>`;
}

// --------------------------------------------------------------------- guide

let guideData = null;
let guideTab = 'play';
let guideVariant = null;

async function openGuide() {
  guideVariant = guideVariant || sync?.room?.config?.variantId || 'hk-old';
  if (!guideData) {
    $('guide').innerHTML = `<div class="sheet-inner"><div class="title-mark">?</div><p class="sub">Loading…</p></div>`;
    try {
      const r = await fetch('/guide.json');
      guideData = await r.json();
    } catch {
      $('guide').innerHTML = `<div class="sheet-inner"><p class="sub">Could not load the guide.</p>
        <div class="actions"><button data-a="closeguide">Close</button></div></div>`;
      return;
    }
  }
  renderGuide();
}

function renderGuide() {
  const d = guideData;
  const v = d.variants.find((x) => x.id === guideVariant) || d.variants[0];
  const tabs = [['play', 'How to play'], ['hands', 'Hands'], ['diffs', 'Ruleset differences']]
    .map(([k, label]) => `<button class="tab ${guideTab === k ? 'on' : ''}" data-a="gtab" data-k="${k}">${label}</button>`)
    .join('');

  let body = '';
  if (guideTab === 'play') {
    body = d.basics.map((b) => `<section class="gsec">
      <h3><span class="cjk">${b.zh}</span>${esc(b.title)}</h3>
      ${b.tiles ? `<div class="gtiles">${b.tiles.map((t) => tileEl(t, { size: 'sm' })).join('')}</div>` : ''}
      <p>${esc(b.body)}</p></section>`).join('')
      + `<section class="gsec"><h3><span class="cjk">表</span>In this app</h3>
        <p>Tap a tile once to lift it, again to discard. When someone discards something you can take,
        the prompt appears above your hand with a countdown — it auto-passes when the timer runs out, so a
        sleeping phone never stalls the table. Your seat is remembered, so you can lock your phone and come back.</p></section>`;
  } else if (guideTab === 'hands') {
    body = v.patterns
      ? `<p class="sub">Values are in ${v.unit}, read live from this ruleset's table — if you edit the
          scoring table in <code>src/score/</code>, this list changes with it.</p>
        <table class="pat gpat">${v.patterns.map((p) => `<tr>
          <td class="zh">${esc(p.zh)}</td>
          <td class="en">${esc(p.en)}${p.note ? `<span class="nt">${esc(p.note)}</span>` : ''}
            ${p.elsewhere ? `<span class="nt alt">elsewhere: ${p.elsewhere.map((e) => `${esc(e.zh)} ${!e.value ? 'does not score it' : e.value}`).join(' · ')}</span>` : ''}</td>
          <td class="v">${p.value || '—'}</td></tr>`).join('')}</table>
        ${v.ladder ? `<h3 class="gh">What ${v.unit} are worth</h3>
          <div class="ladder">${v.ladder.map(([f, u]) => `<span><b>${f}</b>${u}</span>`).join('')}</div>
          <p class="sub">Faan on the left, payment units on the right. ${v.id === 'hk-new'
            ? 'Capped at 10 faan.' : 'Capped at 13 faan.'}</p>` : ''}`
      : `<p class="sub">Riichi scores in han and fu. You need at least one yaku — dora alone does not win.</p>
        <table class="pat gpat">${d.riichi.yaku.map(([zh, en, han, closed, note]) => `<tr>
          <td class="zh">${esc(zh)}</td>
          <td class="en">${esc(en)}${closed ? '<span class="nt">concealed hands only</span>' : ''}${note ? `<span class="nt">${esc(note)}</span>` : ''}</td>
          <td class="v">${esc(han)}</td></tr>`).join('')}</table>
        <h3 class="gh">Yakuman</h3>
        <table class="pat gpat">${d.riichi.yakuman.map(([zh, en, note]) => `<tr>
          <td class="zh">${esc(zh)}</td><td class="en">${esc(en)}${note ? `<span class="nt">${esc(note)}</span>` : ''}</td>
          <td class="v">13</td></tr>`).join('')}</table>
        <h3 class="gh">Limits</h3>
        <table class="pat gpat">${d.riichi.limits.map(([han, name, pts]) => `<tr>
          <td class="zh">${esc(name)}</td><td class="en">${esc(han)}</td><td class="v">${pts}</td></tr>`).join('')}</table>`;
  } else {
    body = `<p class="sub">Read across a row; swipe the table sideways for the other rulesets.
      A cell in brass is where that ruleset breaks from the rest.</p>
      <div class="matrixwrap"><table class="matrix">
        <tr><th></th>${d.columns.map((c) => `<th><span class="cjk">${esc(c.zh)}</span>${esc(c.name)}</th>`).join('')}</tr>
        ${d.matrix.map((r) => `<tr><th>${esc(r.label)}</th>${r.cells.map((c) => `
          <td class="${r.varies && c !== r.common ? 'odd' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}
      </table></div>
      ${d.variants.map((x) => `<section class="gsec"><h3><span class="cjk">${esc(x.zh)}</span>${esc(x.name)}</h3>
        <p>${esc(x.blurb)}</p></section>`).join('')}`;
  }

  const picker = guideTab === 'hands'
    ? `<div class="gpick">${d.variants.map((x) => `<button class="${x.id === guideVariant ? 'on' : ''}"
        data-a="gvar" data-id="${x.id}">${esc(x.zh)}</button>`).join('')}</div>`
    : '';

  $('guide').innerHTML = `<div class="sheet-inner">
    <div class="ghead">
      <div><div class="title-mark">麻雀</div><h1>How to play</h1></div>
      <button class="mini" data-a="closeguide">✕</button>
    </div>
    <div class="tabs">${tabs}</div>
    ${picker}
    ${body}
    <div class="actions" style="justify-content:flex-start"><button class="primary" data-a="closeguide">Back to the game</button></div>
  </div>`;
}

// ---------------------------------------------------------------- interaction

document.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile[data-i]');
  if (tile) return onTileTap(+tile.dataset.i);
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  const g = sync?.game;
  const l = g?.legal || {};
  switch (a) {
    case 'guide': openGuide(); break;
    case 'closeguide': $('guide').innerHTML = ''; break;
    case 'gtab': guideTab = b.dataset.k; renderGuide(); break;
    case 'gvar': guideVariant = b.dataset.id; renderGuide(); break;
    case 'bonusok': clearTimeout(bonusTimer); $('bonus').innerHTML = ''; break;
    case 'buzz':
      buzz = !buzz;
      localStorage.setItem('mj_buzz', buzz ? '1' : '0');
      if (buzz) haptic(35);
      render();
      break;
    case 'full':
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen was refused'));
      break;
    case 'mute':
      muted = !muted;
      localStorage.setItem('mj_muted', muted ? '1' : '0');
      // this tap is a gesture, so it can unlock as well as confirm — without a
      // test note there is no way to tell "sound on" from "sound broken"
      if (!muted) { unlockAudio(); ping(760); }
      render();
      break;
    case 'simple':
      simpleLayout = !simpleLayout;
      localStorage.setItem('mj_simple', simpleLayout ? '1' : '0');
      arenaCal.clear();
      render();
      break;
    case 'sit': send({ t: 'sit', seat: +b.dataset.seat }); break;
    case 'seats': seatsOpen = true; renderSeats(); break;
    case 'closeseats': seatsOpen = false; renderSeats(); break;
    case 'ready': send({ t: 'ready', v: b.dataset.v === '1' }); break;
    case 'variant': send({ t: 'config', variantId: b.dataset.id }); break;
    case 'rounds': send({ t: 'config', rounds: +b.dataset.n }); break;
    case 'timer': send({ t: 'config', claimSeconds: +b.dataset.n }); break;
    case 'bots': send({ t: 'config', bots: !sync.room.config.bots }); break;
    case 'start': send({ t: 'start' }); break;
    case 'restart': send({ t: 'restart' }); showLobby = true; showLastHand = false; break;
    case 'rematch': send({ t: 'rematch' }); showLastHand = false; break;
    case 'lasthand': showLastHand = true; render(); break;
    case 'standings': showLastHand = false; render(); break;
    case 'next': send({ t: 'next' }); break;
    case 'peek': showLobby = false; $('sheet').innerHTML = ''; break;
    case 'tsumo': act({ type: 'win' }); break;
    case 'ron': act({ type: 'claimWin' }); break;
    case 'pung': act({ type: 'pung' }); break;
    case 'ckong': act({ type: 'claimKong' }); break;
    case 'chow': act({ type: 'chow', tiles: l.chows[+b.dataset.ci] }); break;
    case 'pass': act({ type: 'pass' }); break;
    case 'kongmenu': kongOpen = true; render(); break;
    case 'kong': act({ type: 'kong', tile: +b.dataset.tile, kongType: b.dataset.kt }); kongOpen = false; break;
    case 'riichi': riichiArmed = !riichiArmed; sel = null; render(); break;
    default: break;
  }
});

document.addEventListener('focusin', (e) => {
  if (e.target.id === 'nameinput' && !e.target.dataset.touched) {
    e.target.dataset.touched = '1';
    e.target.select();
  }
});

document.addEventListener('focusout', (e) => {
  if (e.target.id === 'nameinput' && sheetDeferred) setTimeout(() => render(), 0);
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'nameinput') {
    myName = e.target.value.slice(0, 16);
    localStorage.setItem('mj_name', myName);
    clearTimeout(window.__nt);
    window.__nt = setTimeout(() => send({ t: 'name', name: myName }), 700);
  }
});

function onTileTap(i) {
  const g = sync?.game;
  if (!g || g.phase !== 'play' || g.turn !== g.seat) return;
  const hand = g.hand.slice();
  let drawn = null;
  if (g.drawn !== null && g.drawn !== undefined) {
    const k = hand.lastIndexOf(g.drawn);
    if (k >= 0) { hand.splice(k, 1); drawn = g.drawn; }
  }
  const tile = i < hand.length ? hand[i] : drawn;
  if (tile === null || tile === undefined) return;
  const allowed = riichiArmed ? (g.legal.riichi || []) : (g.legal.discard || []);
  if (!allowed.includes(tile)) {
    toast(riichiArmed ? 'That discard would break your wait' : 'You cannot discard that');
    return;
  }
  if (sel === i) {
    act({ type: 'discard', tile, riichi: riichiArmed });
    sel = null; riichiArmed = false; kongOpen = false;
    ping(420);
  } else {
    sel = i;
    render();
  }
}

connect();
