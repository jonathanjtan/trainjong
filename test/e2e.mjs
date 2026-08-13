// Boots the real server and drives it with four WebSocket clients.
import { spawn } from 'node:child_process';
import assert from 'node:assert';
import { botAction } from '../src/bot.js';

const PORT = 8123 + (process.pid % 200);
const VARIANT = process.argv[2] || 'hk-old';
const HANDS = Number(process.argv[3] || 3);

const server = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(700);

const errors = [];
let handsSeen = 0;
let lastResult = null;
const clients = [];

function makeClient(i) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=e2e`);
    const c = { i, ws, sync: null, token: `tok-e2e-000${i}`, ready: false };
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: c.token, name: `P${i + 1}`, room: 'e2e' }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'error') errors.push(`P${i + 1}: ${m.msg}`);
      if (m.t === 'welcome') resolve(c);
      if (m.t === 'sync') { c.sync = m; step(c); }
    };
    ws.onerror = () => errors.push(`P${i + 1}: socket error`);
    clients.push(c);
  });
}

function send(c, o) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); }

function step(c) {
  const { room, you, game } = c.sync;
  // one action per distinct state — a human taps once, so the harness should too
  const sig = game
    ? [game.phase, game.turn, game.handNo, game.river?.length, game.hand?.length, JSON.stringify(game.legal || {})].join('|')
    : ['lobby', you.seat, room.seats.map((x) => `${x.name}${x.ready}`).join(','), room.config.variantId].join('|');
  if (c.lastSig === sig) return;
  c.lastSig = sig;
  if (!game || game.phase === 'idle') {
    if (you.seat === null) return send(c, { t: 'sit', seat: c.i });
    if (!room.seats[you.seat].ready) return send(c, { t: 'ready', v: true });
    // anyone can drive the lobby now — let P1 do it so the harness doesn't send duplicates
    if (c.i === 0) {
      if (room.config.variantId !== VARIANT) return send(c, { t: 'config', variantId: VARIANT, claimSeconds: 0 });
      if (room.seats.every((s) => s.ready)) return send(c, { t: 'start' });
    }
    return;
  }
  // sanity: hand sizes never exceed the legal maximum
  const v = room.config.variantId;
  const max = v === 'taiwan-16' ? 17 : 14;
  if (game.hand) {
    const used = game.melds[you.seat].reduce((n, m) => n + (m.type === 'kong' ? 3 : 3), 0);
    assert.ok(game.hand.length + used <= max + 1, `P${c.i + 1} hand too big: ${game.hand.length} + ${used}`);
  }
  if (game.phase === 'hand-over') {
    if (game.result !== lastResult) {
      lastResult = game.result;
      handsSeen++;
    }
    return send(c, { t: 'next' });
  }
  if (game.phase === 'match-over') return;
  const mine = (game.phase === 'play' && game.turn === you.seat)
    || (game.phase === 'claim' && game.legal
      && (game.legal.win || game.legal.pung || game.legal.chows || game.legal.kong !== undefined || game.legal.canPass));
  if (!mine) return;
  const a = botAction(game);
  if (a) send(c, { t: 'action', action: a });
}

for (let i = 0; i < 4; i++) await makeClient(i);
await sleep(300);
for (const c of clients) step(c);

const started = Date.now();
while (handsSeen < HANDS && Date.now() - started < 60000) await sleep(150);

const g = clients[0].sync?.game;
console.log(`variant ${VARIANT}: hands completed ${handsSeen}, phase ${g?.phase}, scores ${g?.scores?.join(' / ')}`);
if (errors.length) console.log('client errors:\n  ' + errors.join('\n  '));

for (const c of clients) c.ws.close();
await sleep(150);
server.kill('SIGTERM');

const bad = errors.filter((e) => !/below the minimum|already responded|no claim available/.test(e));
assert.strictEqual(bad.length, 0, `unexpected protocol errors: ${bad.join('; ')}`);
assert.ok(handsSeen >= HANDS, `only ${handsSeen} hands completed\n${serverOut}`);
assert.ok(g.scores.reduce((a, b) => a + b, 0) + (g.riichiPot || 0) === (VARIANT === 'riichi' ? 100000 : 0),
  `bank drifted: ${g.scores}`);
console.log('e2e ok');
process.exit(0);
