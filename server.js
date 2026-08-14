#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { handleUpgrade, heartbeat } from './src/ws.js';
import { Game } from './src/game.js';
import { VARIANT_LIST, variant as getVariant } from './src/variants.js';
import { botAction } from './src/bot.js';
import { guideData } from './src/guide.js';
import { HK_TABLE } from './src/score/hk.js';
import { TW_TABLE } from './src/score/taiwan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const PORT = Number(process.env.PORT || process.argv[2] || 8080);
const DEV = !!process.env.DEV;

// ------------------------------------------------------------------ static files

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const cache = new Map();
function loadStatic() {
  cache.clear();
  const walk = (dir, base = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel = `${base}/${e.name}`;
      if (e.isDirectory()) walk(p, rel);
      else {
        const buf = fs.readFileSync(p);
        cache.set(rel, {
          buf,
          gz: buf.length > 512 ? zlib.gzipSync(buf, { level: 9 }) : null,
          type: MIME[path.extname(e.name)] || 'application/octet-stream',
          etag: `"${crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 16)}"`,
        });
      }
    }
  };
  if (fs.existsSync(PUBLIC)) walk(PUBLIC);
}
loadStatic();

let guideCache = null;
function serveGuide(req, res) {
  // built from the live scoring tables, so house-rule edits show up in the app
  if (DEV || !guideCache) {
    const body = Buffer.from(JSON.stringify(guideData()));
    guideCache = {
      buf: body,
      gz: zlib.gzipSync(body, { level: 6 }),
      etag: `W/"${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}"`,
    };
  }
  const f = guideCache;
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304); res.end(); return; }
  const gz = (req.headers['accept-encoding'] || '').includes('gzip');
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': gz ? f.gz.length : f.buf.length,
    'cache-control': DEV ? 'no-store' : 'no-cache',
    etag: f.etag,
    ...(gz ? { 'content-encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : (gz ? f.gz : f.buf));
}

function serve(req, res) {
  if (DEV) loadStatic();
  let url = req.url.split('?')[0];
  if (url === '/guide.json') return serveGuide(req, res);
  if (url === '/') url = '/index.html';
  const file = cache.get(url) || (path.extname(url) === '' ? cache.get('/index.html') : null);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  if (req.headers['if-none-match'] === file.etag) {
    res.writeHead(304);
    res.end();
    return;
  }
  const gz = file.gz && (req.headers['accept-encoding'] || '').includes('gzip');
  res.writeHead(200, {
    'content-type': file.type,
    'content-length': gz ? file.gz.length : file.buf.length,
    'cache-control': DEV ? 'no-store' : 'no-cache',
    etag: file.etag,
    ...(gz ? { 'content-encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : (gz ? file.gz : file.buf));
}

// -------------------------------------------------------------------- room state

const DEFAULT_CONFIG = { variantId: 'hk-old', rounds: 4, claimSeconds: 20, bots: false };

class Room {
  constructor(name) {
    this.name = name;
    this.players = new Map();   // token -> player
    this.seats = [null, null, null, null];
    this.config = { ...DEFAULT_CONFIG };
    this.game = null;
    this.claimTimer = null;
    this.claimDeadline = null;
    this.claimRef = null;
    this.botTimer = null;
    this.nextReady = new Set();
  }

  player(token) { return this.players.get(token); }

  join(conn, token, name) {
    let p = this.players.get(token);
    if (!p) {
      p = { token, name: name || 'Player', seat: null, conns: new Set(), bot: false, ready: false };
      this.players.set(token, p);
    }
    if (name) p.name = name.slice(0, 16);
    p.conns.add(conn);
    // reclaim a seat held by this token
    for (let s = 0; s < 4; s++) if (this.seats[s] === token) p.seat = s;
    return p;
  }

  leave(conn, token) {
    const p = this.players.get(token);
    if (!p) return;
    p.conns.delete(conn);
  }

  occupant(seat) {
    const t = this.seats[seat];
    return t ? this.players.get(t) : null;
  }

  seatView() {
    return this.seats.map((t, s) => {
      const p = t ? this.players.get(t) : null;
      return {
        seat: s,
        name: p ? p.name : null,
        bot: !!p?.bot,
        ready: !!p?.ready,
        connected: p ? (p.bot || p.conns.size > 0) : false,
        nextReady: p ? this.nextReady.has(p.token) : false,
      };
    });
  }

  view(token) {
    const p = this.players.get(token);
    const seat = p?.seat ?? null;
    const v = getVariant(this.config.variantId);
    return {
      t: 'sync',
      room: {
        name: this.name,
        seats: this.seatView(),
        config: this.config,
        variants: VARIANT_LIST,
        started: !!this.game && this.game.phase !== 'idle',
        watching: this.players.size - this.seats.filter(Boolean).length,
        // sent as time remaining, not as an instant: every phone at the table
        // has its own idea of what Date.now() means
        claimMs: this.claimDeadline === null ? null : Math.max(0, this.claimDeadline - Date.now()),
        scoringInfo: {
          unit: v.scorer === 'riichi' ? 'points' : v.scorer === 'taiwan' ? '底/台' : 'faan',
          minFaan: v.scoring?.minFaan ?? null,
          limitFaan: v.scoring?.limitFaan ?? null,
          base: v.scoring?.base ?? null,
          taiValue: v.scoring?.taiValue ?? null,
          payment: v.scoring?.payment ?? null,
        },
      },
      you: { token, name: p?.name, seat },
      game: this.game ? this.game.view(seat) : null,
    };
  }

  broadcast() {
    // arm first: the claim deadline has to be in the snapshot we're about to
    // send, otherwise the countdown is always one message behind
    this.armTimers();
    for (const p of this.players.values()) {
      if (!p.conns.size) continue;
      const msg = this.view(p.token);
      for (const c of p.conns) c.send(msg);
    }
  }

  armTimers() {
    const g = this.game;
    clearTimeout(this.claimTimer);
    this.claimTimer = null;
    if (g && g.phase === 'claim' && this.config.claimSeconds > 0) {
      // a different claim object is a different discard, and only that starts a
      // fresh countdown — answering a claim already on the table must not push
      // everyone else's clock back to the top
      if (this.claimRef !== g.claim) { this.claimRef = g.claim; this.claimDeadline = null; }
      const humans = Object.keys(g.claim.options)
        .filter((s) => !g.claim.responses[s])
        .some((s) => { const p = this.occupant(+s); return p && !p.bot; });
      if (humans) {
        if (!this.claimDeadline) this.claimDeadline = Date.now() + this.config.claimSeconds * 1000;
        this.claimTimer = setTimeout(() => {
          this.claimDeadline = null;
          if (this.game?.phase === 'claim') {
            this.game.forceResolveClaims();
            this.broadcast();
          }
        }, Math.max(250, this.claimDeadline - Date.now()));
      } else this.claimDeadline = null;
    } else {
      this.claimRef = null;
      this.claimDeadline = null;
    }
    this.scheduleBots();
  }

  scheduleBots() {
    const g = this.game;
    clearTimeout(this.botTimer);
    this.botTimer = null;
    if (!g || g.phase === 'idle' || g.phase === 'match-over') return;
    const pending = [];
    if (g.phase === 'play') {
      const p = this.occupant(g.turn);
      if (p?.bot) pending.push(g.turn);
    } else if (g.phase === 'claim') {
      for (const s of Object.keys(g.claim.options)) {
        if (g.claim.responses[s]) continue;
        const p = this.occupant(+s);
        if (p?.bot) pending.push(+s);
      }
    } else if (g.phase === 'hand-over') {
      for (let s = 0; s < 4; s++) {
        const p = this.occupant(s);
        if (p?.bot) this.nextReady.add(p.token);
      }
      return;
    }
    if (!pending.length) return;
    this.botTimer = setTimeout(() => {
      const seat = pending[0];
      const a = botAction(this.game.view(seat));
      if (a) this.game.act(seat, a);
      this.broadcast();
    }, 420 + Math.random() * 260);
  }

  start() {
    const filled = this.seats.filter(Boolean).length;
    if (filled < 4 && !this.config.bots) return { error: 'need four players (or turn on bots)' };
    if (this.config.bots) {
      for (let s = 0; s < 4; s++) {
        if (this.seats[s]) continue;
        const token = `bot-${s}-${crypto.randomBytes(3).toString('hex')}`;
        this.players.set(token, { token, name: `Bot ${s + 1}`, seat: s, conns: new Set(), bot: true, ready: true });
        this.seats[s] = token;
      }
    }
    const names = this.seats.map((t) => this.players.get(t)?.name || '');
    this.game = new Game({
      variantId: this.config.variantId,
      rounds: this.config.rounds,
      seed: crypto.randomBytes(4).readUInt32BE(0),
      names,
    });
    this.game.startHand();
    this.nextReady.clear();
    return { ok: true };
  }
}

const rooms = new Map();
function room(name) {
  const key = (name || 'table').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'table';
  if (!rooms.has(key)) rooms.set(key, new Room(key));
  return rooms.get(key);
}

// ---------------------------------------------------------------------- protocol

const conns = new Set();

function onConnection(conn, req) {
  conns.add(conn);
  let r = null, token = null;

  conn.on('message', (m) => {
    try { handle(m); }
    catch (e) { conn.send({ t: 'error', msg: e.message }); }
  });

  conn.on('close', () => {
    conns.delete(conn);
    if (r && token) { r.leave(conn, token); r.broadcast(); }
  });

  function handle(m) {
    if (m.t === 'hello') {
      r = room(m.room || new URL(req.url, 'http://x').searchParams.get('room'));
      token = m.token && /^[a-zA-Z0-9-]{6,40}$/.test(m.token) ? m.token : crypto.randomBytes(8).toString('hex');
      const p = r.join(conn, token, m.name);
      conn.send({ t: 'welcome', token, name: p.name, room: r.name });
      r.broadcast();
      return;
    }
    if (!r || !token) return conn.send({ t: 'error', msg: 'say hello first' });
    const p = r.player(token);
    if (!p) return;

    switch (m.t) {
      case 'name':
        p.name = String(m.name || '').slice(0, 16) || p.name;
        break;
      case 'sit': {
        const s = Number(m.seat);
        if (!(s >= 0 && s < 4)) return;
        const occupantToken = r.seats[s];
        const occupant = occupantToken ? r.players.get(occupantToken) : null;
        if (r.game && r.game.phase !== 'idle') {
          // mid-game, only an empty-handed spectator can step into a bot's seat
          if (p.seat !== null) return conn.send({ t: 'error', msg: 'you already have a seat' });
          if (!occupant || !occupant.bot) return conn.send({ t: 'error', msg: 'game in progress' });
        } else if (occupantToken && occupantToken !== token) {
          return conn.send({ t: 'error', msg: 'seat taken' });
        }
        if (p.seat !== null) r.seats[p.seat] = null;
        if (occupant?.bot) r.players.delete(occupantToken);
        r.seats[s] = token;
        p.seat = s;
        break;
      }
      case 'stand':
        if (r.game && r.game.phase !== 'idle') return;
        if (p.seat !== null) { r.seats[p.seat] = null; p.seat = null; p.ready = false; }
        break;
      case 'ready':
        p.ready = !!m.v;
        break;
      case 'config': {
        if (r.game && r.game.phase !== 'idle' && r.game.phase !== 'match-over') {
          return conn.send({ t: 'error', msg: 'finish the match first' });
        }
        if (m.variantId && VARIANT_LIST.some((v) => v.id === m.variantId)) r.config.variantId = m.variantId;
        if (m.rounds) r.config.rounds = Math.min(4, Math.max(1, Number(m.rounds) | 0));
        if (m.claimSeconds !== undefined) r.config.claimSeconds = Math.min(60, Math.max(0, Number(m.claimSeconds) | 0));
        if (m.bots !== undefined) r.config.bots = !!m.bots;
        break;
      }
      case 'start': {
        const seated = r.seats.map((t) => t && r.players.get(t)).filter(Boolean);
        if (!r.config.bots && seated.some((x) => !x.ready)) {
          return conn.send({ t: 'error', msg: 'everyone needs to be ready' });
        }
        const res = r.start();
        if (res.error) return conn.send({ t: 'error', msg: res.error });
        break;
      }
      case 'action': {
        if (p.seat === null || !r.game) return;
        const res = r.game.act(p.seat, m.action);
        // a claim that lost the race is not the player's mistake — their prompt
        // is about to vanish on its own, so don't shout at them about it
        if (res?.error && !res.stale) conn.send({ t: 'error', msg: res.error });
        break;
      }
      case 'next': {
        if (!r.game || r.game.phase !== 'hand-over') return;
        r.nextReady.add(token);
        const seated = r.seats.map((t) => r.players.get(t)).filter(Boolean);
        const waiting = seated.filter((x) => !x.bot && !r.nextReady.has(x.token));
        if (!waiting.length) {
          r.nextReady.clear();
          r.game.nextHand();
        }
        break;
      }
      case 'restart': {
        for (const [t, pl] of [...r.players]) if (pl.bot) { r.players.delete(t); if (pl.seat !== null) r.seats[pl.seat] = null; }
        r.game = null;
        r.nextReady.clear();
        for (const pl of r.players.values()) pl.ready = false;
        break;
      }
      case 'rematch': {
        // straight into another match with the same table — nobody has to
        // re-seat and re-ready just because the last one finished
        if (!r.game || r.game.phase !== 'match-over') return;
        const res = r.start();
        if (res.error) return conn.send({ t: 'error', msg: res.error });
        break;
      }
      case 'pong': break;
      default: break;
    }
    r.broadcast();
  }
}

// ------------------------------------------------------------------------- boot

const server = http.createServer(serve);
server.on('upgrade', (req, socket, head) => {
  void head;
  if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
  handleUpgrade(req, socket, onConnection);
});
heartbeat(conns);
server.keepAliveTimeout = 65000;

server.listen(PORT, '0.0.0.0', () => {
  const addrs = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) addrs.push({ name, addr: i.address });
    }
  }
  const line = '─'.repeat(46);
  console.log(`\n  麻雀  Mahjong table is up\n${line}`);
  console.log(`  This machine   http://localhost:${PORT}`);
  for (const a of addrs) console.log(`  ${a.name.padEnd(13)}  http://${a.addr}:${PORT}`);
  console.log(`${line}`);
  console.log('  Everyone joins the same URL, picks a seat, hits Ready.');
  console.log('  Prop this laptop up and open /?view=table for a table view.');
  console.log(`  Variants: ${VARIANT_LIST.map((v) => v.id).join(', ')}`);
  console.log('  Ctrl-C to stop.\n');
  void HK_TABLE; void TW_TABLE;
});
