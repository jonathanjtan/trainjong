# 麻雀 — offline LAN mahjong

Four phones, one laptop, no internet. Zero dependencies — Node's standard
library only. No `npm install`, no build step, no assets fetched at play time.

## Before you leave (the one online step)

macOS does **not** ship with Node. On the MacBook, check:

```
node --version
```

If that fails, install Node while you still have internet
(https://nodejs.org — any recent LTS works; v18+ is fine). Everything after
this point works fully offline.

## Playing

1. Power the travel router. Internet is not required — it only needs to hand
   out wi-fi. Connect the MacBook and all four phones to it.
2. On the MacBook:

   ```
   cd mahjong
   node server.js
   ```

   It prints the join address, something like:

   ```
   ▶ http://192.168.8.147:8080
   ```

3. Everyone opens that address in their phone browser. Type a name, pick a
   seat, hit **Ready**. The first person in becomes the host and picks the
   ruleset. Host presses **Start**.
4. Optional: on the MacBook, open `http://localhost:8080/?view=table` and prop
   it up in the middle. It shows the river, melds and scores with no private
   info — a shared table surface.

Port taken? `node server.js 9000` or `PORT=9000 node server.js`.

## Things worth knowing

- **Phones sleeping is fine.** Your seat is held by a token in the browser;
  when the screen wakes, the client reconnects and repaints from a full
  snapshot. Nothing is lost.
- **Claim timer** (lobby setting, default 20 s) keeps a sleeping phone from
  stalling the table — pung/chow/win prompts auto-pass when it runs out. Set
  it to *no timer* if you'd rather wait for everyone.
- **Bots** fill empty seats when enabled, so you can test solo tonight:
  start the server, sit in one seat, enable bots, Start.
- **Multiple tables**: append `?room=anything` to the URL; each room name is
  its own table.
- **Sound**: the bell icon toggles a small "your turn" chime (synthesized —
  no audio files).
- **Flowers are announced.** Drawing a bonus tile shows a card naming the tile
  you set aside and confirming the replacement draw — no more silent additions.
  It clears itself after a few seconds so a distracted player can't hold up the
  table, and everyone else sees the tile named in the table log.
- **Vibration** on your turn and on a claim prompt (`buzz` in the top bar).
  Android only — iOS Safari has no vibration API, which is why the chime exists
  too.
- **Landscape works**, and so does a zoomed-in laptop: the layout is sized from
  the viewport, so the table and your hand always fit without scrolling.
- **`?view=table` is full screen** — the `full` button in the top bar goes
  properly fullscreen if the browser allows it.
- **How to play**: the `?` button in the top bar opens a guide — the basics,
  the full hand/pattern list for the chosen ruleset, and a side-by-side matrix
  of what each ruleset changes. Pattern values are read live from the scoring
  tables, so house-rule edits show up there automatically.

## Rulesets

| id | name | shape |
|---|---|---|
| `hk-old` | Hong Kong Old Style 廣東牌 | 13 tiles, flowers, faan → laak ladder, 3-faan minimum |
| `hk-new` | Hong Kong New Style 新章 | as above, 10-faan cap, half-shooter payments |
| `taiwan-16` | Taiwanese 台灣十六張 | 16 tiles, 5 sets + pair, 底+台, dealer streaks |
| `riichi` | Riichi 立直麻雀 | Japanese: riichi, dora, han/fu, furiten, honba |

See `RULES.md` for exactly what each implements, the full scoring tables, and
the deliberate omissions. All faan/tai values live in small tables at the top
of `src/score/*.js` — edit them to match your house rules; no other code
changes needed.

## Development

- `DEV=1 node server.js` — re-reads `public/` on every request (no caching).
- `node test/engine.test.mjs` — engine tests + cross-variant fuzz with tile-,
  per-seat- and money-conservation invariants. The fuzz is fully seeded: the
  wall *and* the action choices, so a failure reproduces exactly.
- `node test/e2e.mjs hk-old 3` — boots the real server, drives four WebSocket
  clients through 3+ hands.

Layout: `src/` engine (tiles → hand logic → per-variant scorers → game state
machine), `server.js` HTTP + hand-rolled RFC 6455 WebSocket + rooms,
`public/` the client (vanilla ES modules, inline-SVG tiles).

`jonathanjtan/trainjong` was empty at build time; when it grows code, a new
variant is a data object in `src/variants.js` plus one scorer function.
