/* Rooms are made by anyone typing a ?room= name, and used to be kept for ever.
   This boots the real server with a short TTL and checks that a table nobody is
   connected to is cleared away — and, just as importantly, that one somebody is
   still connected to is not, however long they sit there saying nothing. */
import { spawn } from 'node:child_process';
import assert from 'node:assert';

const PORT = 8300 + (process.pid % 200);
const TTL = 400;

const server = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), ROOM_TTL_MS: String(TTL) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
server.stdout.on('data', (d) => { out += d; });
server.stderr.on('data', (d) => { out += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleared = (name) => out.includes(`cleared away the empty table “${name}”`);

function hello(name, token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${name}`);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token, name: 'P', room: name }));
    ws.onmessage = (e) => { if (JSON.parse(e.data).t === 'welcome') resolve(ws); };
  });
}

let pass = 0, fail = 0;
function test(name, ok) {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}`); }
}

await sleep(700);

// one table someone leaves, one they stay at
const going = await hello('going', 'tok-going-01');
const staying = await hello('staying', 'tok-stay-01');
going.close();

// long enough for the sweeper to see it empty and then to time it out
await sleep(TTL * 6);

test('an empty table is cleared away', cleared('going'));
test('a table with somebody at it is left alone', !cleared('staying'));

// and it comes back the moment anyone asks for it again
const again = await hello('going', 'tok-going-02');
test('the name still works afterwards', again.readyState === 1);
again.close();
staying.close();

server.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
