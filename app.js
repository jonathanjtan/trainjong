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
let muted = localStorage.getItem('mj_muted') === '1';
let lastTurnSeat = null, lastPhase = null, clockTimer = null;

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
  if (!document.hidden && (!ws || ws.readyState > 1)) connect();
});
window.addEventListener('online', () => { if (!ws || ws.readyState > 1) connect(); });

function onSync(m) {
  const prev = sync;
  sync = m;
  actLock = false;
  const g = m.game;
  if (g && g.phase !== 'idle' && showLobby && prev?.game?.phase !== g.phase) showLobby = false;
  if (!g || g.phase === 'idle') showLobby = true;
  if (g && g.seat !== null) {
    if (g.turn !== lastTurnSeat) { sel = null; kongOpen = false; riichiArmed = false; }
    const mine = g.phase === 'play' && g.turn === g.seat;
    const claim = g.phase === 'claim' && (g.legal?.win || g.legal?.pung || g.legal?.chows || g.legal?.kong !== undefined);
    if (mine && lastTurnSeat !== g.turn) ping(660);
    if (claim && lastPhase !== 'claim') ping(880);
    lastTurnSeat = g.turn;
    lastPhase = g.phase;
  }
  render();
}

// ------------------------------------------------------------------- helpers

let audio = null;
function ping(freq) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), gn = audio.createGain();
    o.frequency.value = freq; o.type = 'sine';
    gn.gain.setValueAtTime(0.0001, audio.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.09, audio.currentTime + 0.02);
    gn.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.28);
    o.connect(gn).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.3);
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
const seatName = (s) => sync?.room.seats[s]?.name || `Seat ${s + 1}`;
const windOf = (seat, dealer) => (seat - dealer + 4) % 4;

// -------------------------------------------------------------------- render

function render() {
  if ($('sheet').dataset.dead) return;
  const g = sync?.game;
  if (!sync) return;
  renderRail(g);
  renderSeats(g);
  renderBoard(g);
  renderMine(g);
  renderTray(g);
  renderSheet(g);
}

function renderRail(g) {
  if (!g || g.phase === 'idle') {
    $('rail').innerHTML = `<span class="round cjk">麻雀</span>
      <span class="eyebrow">${esc(sync.room.name)} · ${esc(sync.room.config.variantId)}</span>
      <span class="meta"><button class="ghost" style="padding:4px 8px;min-height:0;font-size:12px" data-a="mute">${muted ? '🔇' : '🔔'}</button></span>`;
    return;
  }
  const dora = (g.doraIndicators || []).map((t) => tileEl(t, { size: 'xs' })).join('');
  $('rail').innerHTML = `
    <span class="round cjk">${WINDS[g.roundWind]}</span>
    <span class="eyebrow">${WIND_EN[g.roundWind]} round · hand ${g.handNo}</span>
    ${dora ? `<span class="bonusgroup" title="Dora">${dora}</span>` : ''}
    <span class="meta">
      ${g.honba ? `<span class="eyebrow">本場 <b>${g.honba}</b></span>` : ''}
      ${g.riichiPot ? `<span class="eyebrow">pot <b>${g.riichiPot}</b></span>` : ''}
      <span class="eyebrow">wall <b>${g.wall}</b></span>
      <button class="ghost" style="padding:4px 8px;min-height:0;font-size:12px" data-a="mute">${muted ? '🔇' : '🔔'}</button>
    </span>`;
}

function renderSeats(g) {
  const seats = sync.room.seats;
  $('seats').innerHTML = seats.map((s, i) => {
    const isTurn = g && g.phase !== 'idle' && g.turn === i && g.phase !== 'hand-over';
    const dealer = g && g.dealer === i;
    const score = g ? g.scores[i] : 0;
    const wind = g ? WINDS[windOf(i, g.dealer)] : WINDS[i];
    const mine = g && g.seat === i;
    return `<div class="seat ${isTurn ? 'turn' : ''} ${mine ? 'me' : ''}">
      <div><span class="wind cjk">${wind}</span> <span class="score ${score < 0 ? 'neg' : ''}">${g ? score : ''}</span></div>
      <div class="who">${esc(s.name || '—')}</div>
      <div class="tags">
        ${dealer ? '<span class="chip cjk">莊</span>' : ''}
        ${g?.riichiSeats?.[i] ? '<span class="chip riichi cjk">立</span>' : ''}
        ${s.bot ? '<span class="chip">bot</span>' : ''}
        ${s.name && !s.connected ? '<span class="chip off">away</span>' : ''}
        ${g && g.phase === 'claim' && g.claimPending?.includes(i) ? '<span class="chip">thinking</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

function renderBoard(g) {
  if (!g || g.phase === 'idle') {
    $('board').innerHTML = `<div class="panel"><span class="eyebrow">table</span>
      <p style="font-size:13px;color:#9dc3b5;margin:6px 0 0">Waiting for the lobby. Pick a seat and hit Ready.</p></div>`;
    return;
  }
  const river = g.river.map((d, i) => tileEl(d.tile, {
    size: 'xs', dim: d.taken, ring: i === g.river.length - 1 && !d.taken,
  })).join('');

  const others = [0, 1, 2, 3].filter((s) => s !== g.seat);
  const melds = others.map((s) => {
    const rows = g.melds[s].map((m) => meldHTML(m)).join('');
    const bonus = g.bonus[s].map((t) => tileEl(t, { size: 'xs' })).join('');
    const backs = Array.from({ length: Math.min(g.handCounts[s], 17) },
      () => tileEl(0, { size: 'xs', back: true })).join('');
    return `<div class="meldrow"><span class="who">${esc(seatName(s))}</span>
      ${rows || ''}${bonus ? `<span class="bonusgroup">${bonus}</span>` : ''}
      <span class="meld" style="opacity:.5">${TABLE_VIEW ? backs : ''}</span>
      <span class="eyebrow">${g.handCounts[s]}</span></div>`;
  }).join('');

  $('board').innerHTML = `
    <div class="panel"><span class="eyebrow">river · ${g.river.length} discards</span>
      <div class="river">${river || '<span class="eyebrow">no discards yet</span>'}</div></div>
    <div class="panel"><span class="eyebrow">the others</span>${melds}</div>
    <div class="panel"><span class="eyebrow">log</span><div class="log">
      ${g.log.slice(-6).reverse().map((l) => `<div>${esc(l.msg)}</div>`).join('')}</div></div>`;
}

function meldHTML(m) {
  const ts = m.type === 'chow' ? [m.tile, m.tile + 1, m.tile + 2]
    : m.type === 'kong' ? [m.tile, m.tile, m.tile, m.tile]
      : [m.tile, m.tile, m.tile];
  const inner = ts.map((t, i) => tileEl(t, {
    size: 'xs',
    back: m.type === 'kong' && !m.open && (i === 0 || i === 3),
  })).join('');
  return `<span class="meld ${m.open ? '' : 'closed'}">${inner}</span>`;
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
  const drawnTile = drawnIdx >= 0
    ? tileEl(g.drawn, { size: 'md', dim: myTurn && !canPick(g.drawn) }).replace('class="tile',
      `data-i="${hand.length}" class="tile drawn ${sel === hand.length ? 'sel' : ''} ${canPick(g.drawn) ? 'pick' : ''}`)
    : '';

  const myMelds = g.melds[g.seat].map(meldHTML).join('');
  const myBonus = g.bonus[g.seat].map((t) => tileEl(t, { size: 'xs' })).join('');

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

  $('mine').innerHTML = `
    ${myMelds || myBonus ? `<div class="meldrow"><span class="who">you</span>${myMelds}${myBonus ? `<span class="bonusgroup">${myBonus}</span>` : ''}</div>` : ''}
    <div class="rack">${rack}${drawnTile}</div>
    <div class="hint">${hint}</div>
    <div class="actions">${actions.join('')}</div>`;
}

function renderTray(g) {
  const el = $('tray');
  const l = g?.legal || {};
  const claimable = g && g.phase === 'claim' && (l.win || l.pung || l.chows?.length || l.kong !== undefined);
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
      ${tileEl(d.tile, { size: 'lg' })}
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

function renderSheet(g) {
  const el = $('sheet');
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

  const hand = r.kind === 'win'
    ? `<div class="result-hand">${r.hand.map((t) => tileEl(t, { size: 'sm', ring: t === r.winTile })).join('')}
       ${r.melds.map(meldHTML).join('')}${r.bonus.map((t) => tileEl(t, { size: 'xs' })).join('')}</div>`
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
  const host = you.host;
  const seatBtns = r.seats.map((s, i) => `
    <button class="${s.name ? 'taken' : ''} ${you.seat === i ? 'primary' : ''}" data-a="sit" data-seat="${i}">
      <span class="wind cjk">${WINDS[i]}</span>
      <span class="nm">${s.name ? esc(s.name) + (s.ready ? ' ✓' : '') : 'open seat'}</span>
    </button>`).join('');

  const variants = r.variants.map((v) => `
    <button class="variant ${r.config.variantId === v.id ? 'on' : ''}" ${host ? '' : 'disabled'} data-a="variant" data-id="${v.id}">
      <div class="nm">${esc(v.name)}<span class="zh">${esc(v.zh)}</span></div>
      <div class="bl">${esc(v.blurb)}</div>
    </button>`).join('');

  const rounds = [1, 2, 4].map((n) => `<button class="${r.config.rounds === n ? 'on' : ''}" ${host ? '' : 'disabled'} data-a="rounds" data-n="${n}">${n === 1 ? '1 round (東)' : n === 2 ? '2 rounds' : '4 rounds'}</button>`).join('');
  const timers = [0, 10, 20, 45].map((n) => `<button class="${r.config.claimSeconds === n ? 'on' : ''}" ${host ? '' : 'disabled'} data-a="timer" data-n="${n}">${n === 0 ? 'no timer' : `${n}s`}</button>`).join('');

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

    <h2>Ruleset ${host ? '' : '<span class="eyebrow">host picks</span>'}</h2>
    <div class="variants">${variants}</div>
    <div class="optrow">${rounds}</div>
    <div class="optrow"><span class="eyebrow">claim timer</span>${timers}</div>
    <div class="optrow">
      <button class="${r.config.bots ? 'on' : ''}" ${host ? '' : 'disabled'} data-a="bots">${r.config.bots ? 'bots fill empty seats' : 'humans only'}</button>
      <button data-a="mute">${muted ? 'sound off' : 'sound on'}</button>
    </div>
    <div class="sub" style="margin-top:8px">
      ${info.minFaan !== null && info.minFaan !== undefined ? `Minimum ${info.minFaan} faan · limit ${info.limitFaan} · ${info.payment === 'half' ? 'shooter pays double, others a quarter' : 'shooter pays the table'}` : ''}
      ${info.base ? `底 ${info.base} · 台 ${info.taiValue}` : ''}
      ${info.unit === 'points' ? 'Riichi sticks, honba and noten penalties are in play.' : ''}
    </div>

    <div class="actions" style="justify-content:flex-start;margin-top:14px">
      ${you.seat !== null ? `<button class="${me?.ready ? '' : 'primary'}" data-a="ready" data-v="${me?.ready ? '0' : '1'}">${me?.ready ? 'Not ready' : "I'm ready"}</button>` : ''}
      ${host ? `<button class="primary" data-a="start">Start the game</button>` : '<span class="eyebrow">waiting for the host to start</span>'}
      ${sync.game && sync.game.phase !== 'idle' ? `<button class="ghost" data-a="peek">Back to the table</button>` : ''}
    </div>
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
    case 'mute':
      muted = !muted;
      localStorage.setItem('mj_muted', muted ? '1' : '0');
      render();
      break;
    case 'sit': send({ t: 'sit', seat: +b.dataset.seat }); break;
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

document.addEventListener('input', (e) => {
  if (e.target.id === 'nameinput') {
    myName = e.target.value.slice(0, 16);
    localStorage.setItem('mj_name', myName);
    clearTimeout(window.__nt);
    window.__nt = setTimeout(() => send({ t: 'name', name: myName }), 350);
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
