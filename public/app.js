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
let muted = localStorage.getItem('mj_muted') === '1';
let buzz = localStorage.getItem('mj_buzz') !== '0';
let seenBonus = 0;
let lastTurnSeat = null, lastPhase = null, clockTimer = null, lastHandNo = null;

if (TABLE_VIEW) document.body.classList.add('table-view');

// ---------------------------------------------------------------- transport

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(ROOM)}`);
  ws.onopen = () => {
    live = true; backoff = 400; dead(false);
    send({ t: 'hello', token, name: myName, room: ROOM });
  };
  ws.onmessage = (e) => {
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
  ws.onclose = () => {
    live = false; dead(true);
    backoff = Math.min(4000, backoff * 1.7);
    setTimeout(connect, backoff);
  };
  ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
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
  if (!ws || ws.readyState > 1) connect();
  // iOS suspends the audio context behind a lock screen; nudge it awake so the
  // first cue after unlocking the phone is not the one that gets swallowed
  if (audio && audio.state !== 'running') audio.resume?.().catch(() => { /* needs a tap */ });
});
window.addEventListener('online', () => { if (!ws || ws.readyState > 1) connect(); });

function onSync(m) {
  const prev = sync;
  sync = m;
  actLock = false;
  const g = m.game;
  if (g && g.phase !== 'idle' && showLobby && prev?.game?.phase !== g.phase) showLobby = false;
  if (!g || g.phase === 'idle') showLobby = true;
  if (seatsOpen && (!g || g.phase === 'idle' || m.you.seat !== null)) seatsOpen = false;
  // animation keys are scoped to a hand; drop them when a new one is dealt
  if (g && g.handNo !== lastHandNo) { seenKeys.clear(); lastHandNo = g.handNo; }
  if (g && g.seat !== null) {
    if (g.turn !== lastTurnSeat) { sel = null; kongOpen = false; riichiArmed = false; }
    const mine = g.phase === 'play' && g.turn === g.seat;
    const claim = g.phase === 'claim' && (g.legal?.win || g.legal?.pung || g.legal?.chows || g.legal?.kong !== undefined);
    if (mine && lastTurnSeat !== g.turn) { ping(660); haptic(45); }
    if (claim && lastPhase !== 'claim') { ping(880); haptic([30, 60, 30]); }
    lastTurnSeat = g.turn;
    lastPhase = g.phase;
  }
  checkBonus(g);
  render();
}

// Flowers are replaced automatically by the rules, but they should never appear
// silently — show the player exactly what they picked up.
function checkBonus(g) {
  if (!g || g.seat === null || g.seat === undefined) { seenBonus = 0; return; }
  const evs = (g.bonusEvents || []).filter((e) => e.seat === g.seat);
  if (!evs.length) { seenBonus = 0; return; }
  const latest = evs[evs.length - 1].n;
  if (!seenBonus) { seenBonus = latest; return; }   // joined mid-hand: don't replay
  const fresh = evs.filter((e) => e.n > seenBonus);
  if (!fresh.length) return;
  seenBonus = latest;
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

function ping(freq) {
  if (muted) return;
  if (!audio) { unlockAudio(); if (!audio) return; }
  // coming back from a locked screen leaves the context suspended
  if (audio.state !== 'running') audio.resume?.().catch(() => { /* stays quiet */ });
  try {
    const t = audio.currentTime;
    const out = audio.createGain();
    out.gain.value = 1;
    out.connect(audio.destination);
    // two notes, triangle wave — a lone quiet sine does not carry on a phone
    const tone = (f, at, dur, peak) => {
      const o = audio.createOscillator(), gn = audio.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t + at);
      gn.gain.setValueAtTime(0.0001, t + at);
      gn.gain.exponentialRampToValueAtTime(peak, t + at + 0.015);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(gn).connect(out);
      o.start(t + at);
      o.stop(t + at + dur + 0.02);
    };
    tone(freq, 0, 0.26, 0.22);
    tone(freq * 1.5, 0.07, 0.22, 0.12);
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
}

function renderRail(g) {
  if (!g || g.phase === 'idle') {
    $('rail').innerHTML = `<span class="round cjk">麻雀</span>
      <span class="eyebrow">${esc(sync.room.name)} · ${esc(sync.room.config.variantId)}</span>
      <span class="meta">${railButtons(g)}</span>`;
    return;
  }
  $('rail').innerHTML = `
    <span class="round cjk">${WINDS[g.roundWind]}</span>
    <span class="eyebrow">${WIND_EN[g.roundWind]} round · hand ${g.handNo}</span>
    <span class="meta">
      ${g.honba ? `<span class="eyebrow">本場 <b>${g.honba}</b></span>` : ''}
      ${g.riichiPot ? `<span class="eyebrow">pot <b>${g.riichiPot}</b></span>` : ''}
      ${railButtons(g)}
    </span>`;
}

function railButtons(g) {
  const canJoin = g && g.phase !== 'idle' && sync.you.seat === null;
  return `${canJoin ? `<button class="mini" data-a="seats" title="Take a bot's seat">seats</button>` : ''}
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
    board.innerHTML = `<div class="table"><div class="z-hub hub">
      <div class="rw cjk">麻</div><div class="last">Waiting in the lobby</div></div></div>`;
    return;
  }
  const me = g.seat === null || g.seat === undefined ? 0 : g.seat;
  const at = { bottom: me, right: (me + 1) % 4, top: (me + 2) % 4, left: (me + 3) % 4 };
  const dirOf = {};
  for (const [dir, seat] of Object.entries(at)) dirOf[seat] = dir;
  const arrow = { top: '▲', bottom: '▼', left: '◀', right: '▶' }[dirOf[g.turn]] || '';

  board.innerHTML = `<div class="table">
    <div class="z-top">${zone(g, at.top, 'wide', me)}</div>
    <div class="z-left">${zone(g, at.left, 'narrow', me)}</div>
    <div class="z-hub hubwrap">
      <div class="hub">
        <div class="rw cjk">${WINDS[g.roundWind]}</div>
        <div class="wall">${g.wall} <span>left</span></div>
        ${g.doraIndicators?.length ? `<div class="dora">${g.doraIndicators.map((t) => tileEl(t)).join('')}</div>` : ''}
        <div class="last">${esc(g.log[g.log.length - 1]?.msg || '')}</div>
      </div>
      ${arrow ? `<div class="arrow a-${dirOf[g.turn]}">${arrow}</div>` : ''}
    </div>
    <div class="z-right">${zone(g, at.right, 'narrow', me)}</div>
    <div class="z-bottom">${zone(g, at.bottom, 'wide', me)}</div>
  </div>`;
}

function zone(g, seat, shape, me) {
  const s = sync.room.seats[seat];
  const side = shape === 'narrow';
  const isMe = seat === g.seat;
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
  const melds = g.melds[seat].map((m, i) => meldHTML(m, true,
    once(`m${g.handNo}:${seat}:${i}:${m.type}:${m.tile}`) ? 'fresh-meld' : ''))
    .join('')
    + g.bonus[seat].map((t) => tileEl(t)).join('');

  return `<div class="zone ${side ? 'side' : ''}">
    <div class="plate ${g.turn === seat && g.phase !== 'hand-over' ? 'turn' : ''} ${isMe ? 'me' : ''}">
      <span class="wind cjk">${WINDS[windOf(seat, g.dealer)]}</span>
      <span class="who">${esc(s.name || '—')}</span>
      <span class="score ${g.scores[seat] < 0 ? 'neg' : ''}">${g.scores[seat]}</span>
      ${g.dealer === seat ? '<span class="chip cjk">莊</span>' : ''}
      ${g.riichiSeats?.[seat] ? '<span class="chip riichi cjk">立</span>' : ''}
      ${s.bot ? '<span class="chip">bot</span>' : ''}
      ${s.name && !s.connected ? '<span class="chip off">away</span>' : ''}
      ${g.phase === 'claim' && g.claimPending?.includes(seat) ? '<span class="chip">…</span>' : ''}
    </div>
    ${melds ? `<div class="zmelds">${melds}</div>` : ''}
    ${isMe ? '' : `<span class="held">${g.handCounts[seat]}</span>`}
    <div class="pond ${side ? 'narrow' : 'wide'}">${pond}</div>
  </div>`;
}

function meldHTML(m, compact = false, extra = '') {
  const ts = m.type === 'chow' ? [m.tile, m.tile + 1, m.tile + 2]
    : m.type === 'kong' ? [m.tile, m.tile, m.tile, m.tile]
      : [m.tile, m.tile, m.tile];
  const inner = ts.map((t, i) => tileEl(t, {
    size: compact ? 'zone' : 'xs',
    back: m.type === 'kong' && !m.open && (i === 0 || i === 3),
  })).join('');
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

  const myMelds = g.melds[g.seat].map((m) => meldHTML(m, true)).join('');
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
  const dl = sync?.room.claimDeadline;
  if (!dl) { c.textContent = ''; return; }
  const left = Math.max(0, dl - Date.now());
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
  if (g && (g.phase === 'hand-over' || g.phase === 'match-over') && g.result) {
    el.innerHTML = resultSheet(g);
    return;
  }
  if (showLobby) { el.innerHTML = lobbySheet(); return; }
  el.innerHTML = '';
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
       ${r.melds.map((m) => meldHTML(m)).join('')}${r.bonus.map((t) => tileEl(t, { size: 'sm' })).join('')}</div>`
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
    ? `<button class="primary" data-a="restart">Back to the lobby</button>`
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
    case 'sit': send({ t: 'sit', seat: +b.dataset.seat }); break;
    case 'seats': seatsOpen = true; renderSeats(); break;
    case 'closeseats': seatsOpen = false; renderSeats(); break;
    case 'ready': send({ t: 'ready', v: b.dataset.v === '1' }); break;
    case 'variant': send({ t: 'config', variantId: b.dataset.id }); break;
    case 'rounds': send({ t: 'config', rounds: +b.dataset.n }); break;
    case 'timer': send({ t: 'config', claimSeconds: +b.dataset.n }); break;
    case 'bots': send({ t: 'config', bots: !sync.room.config.bots }); break;
    case 'start': send({ t: 'start' }); break;
    case 'restart': send({ t: 'restart' }); showLobby = true; break;
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
