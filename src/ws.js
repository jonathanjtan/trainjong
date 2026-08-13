// Minimal WebSocket server (RFC 6455, text frames only). No dependencies.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 1 << 20;

export class WSConn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = [];
    this.fragOp = 0;
    this.open = true;
    this.alive = true;
    socket.setNoDelay(true);
    socket.on('data', (c) => this.onData(c));
    socket.on('error', () => this.destroy());
    socket.on('close', () => {
      if (this.open) { this.open = false; this.emit('close'); }
    });
  }

  onData(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.destroy();
        len = Number(big); off = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (this.buf.length < off + maskLen + len) return;
      let payload = this.buf.subarray(off + maskLen, off + maskLen + len);
      if (masked) {
        const mask = this.buf.subarray(off, off + 4);
        const p = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) p[i] = payload[i] ^ mask[i & 3];
        payload = p;
      }
      this.buf = this.buf.subarray(off + maskLen + len);
      this.frame(fin, op, payload);
    }
  }

  frame(fin, op, payload) {
    if (op === 0x8) { this.close(1000); return; }
    if (op === 0x9) { this.write(0xa, payload); return; }
    if (op === 0xa) { this.alive = true; return; }
    if (op === 0x1 || op === 0x2 || op === 0x0) {
      if (op !== 0x0) { this.frag = []; this.fragOp = op; }
      this.frag.push(payload);
      const size = this.frag.reduce((n, b) => n + b.length, 0);
      if (size > MAX_MESSAGE) return this.destroy();
      if (!fin) return;
      const data = Buffer.concat(this.frag);
      this.frag = [];
      if (this.fragOp === 0x1) {
        let msg;
        try { msg = JSON.parse(data.toString('utf8')); }
        catch { return; }
        this.emit('message', msg);
      }
    }
  }

  write(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | op;
    try { this.socket.write(Buffer.concat([header, payload])); }
    catch { this.destroy(); }
  }

  send(obj) {
    this.write(0x1, Buffer.from(JSON.stringify(obj), 'utf8'));
  }

  ping() {
    this.alive = false;
    this.write(0x9, Buffer.alloc(0));
  }

  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.allocUnsafe(2);
    b.writeUInt16BE(code, 0);
    this.write(0x8, b);
    this.open = false;
    try { this.socket.end(); } catch { /* already gone */ }
    this.emit('close');
  }

  destroy() {
    if (!this.open) return;
    this.open = false;
    try { this.socket.destroy(); } catch { /* already gone */ }
    this.emit('close');
  }
}

export function handleUpgrade(req, socket, onConnection) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  onConnection(new WSConn(socket), req);
}

/** keep phones from silently dropping: ping every interval, cull the dead */
export function heartbeat(conns, ms = 20000) {
  return setInterval(() => {
    for (const c of conns) {
      if (!c.open) continue;
      if (!c.alive) { c.destroy(); continue; }
      c.ping();
    }
  }, ms).unref?.() ?? null;
}
