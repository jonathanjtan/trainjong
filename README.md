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
   seat, hit **Ready**. Anyone can pick the ruleset and press **Start** — there's
   no host. If bots are filling empty seats, a spectator can tap **seats** during
   the game to take one over.
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
- **The table is drawn as a table.** Discards pool in the middle in four blocks,
  and every tile a player owns — their discards, their concealed wall, their
  melds — is turned to face that player, the way it sits on a real table (and
  the way Mahjong Soul and friends draw it). Six discards to a row, three rows,
  and the slab in the middle exactly as wide as a row — the reference's ratio.
  The slab carries the round, the wall count and the four scores, each score
  turned towards its own seat, with the seat to play lit. Names stay upright in
  the corners.
- **It lies back in landscape**, again like the reference. That is not just
  decoration: a flat square table can only ever be as big as the short edge of
  the screen, and landscape has width going spare. Tilting it trades that
  surplus width for about a third more tile, and the near half — which is yours
  — gains the most. The angle comes from how much surplus width there actually
  is, so portrait, which has none, stays flat and top-down.
- **`simple` in the top bar** flattens all that back to the older layout: every
  seat upright, ponds beside their player rather than pooled. It sticks per
  browser, so one player can use it without affecting the table.
- **Landscape works**, and so does a zoomed-in laptop: the layout is sized from
  the viewport, so the table and your hand always fit without scrolling. The
  table is square and sized to the shorter edge, so on a wide screen it sits
  centred with felt either side.
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

The table itself is worth knowing about before you edit `.arena` in
`public/style.css`. One seat's band — pond, wall, melds, plate — is written for
the bottom player and the other three are that same band rotated 90/180/270°
about the square's centre, so the four sides cannot disagree. Two things hold
it together:

- **Every length is `n × --dw + n px`.** That makes the square's side a straight
  line in `--dw`, which `fitArena()` solves by rendering two probe sizes and
  measuring — no duplicated arithmetic in the JS. A `clamp()` or `min()`
  anywhere in the `--S` chain breaks the solve and the table stops fitting.
- **No `border` on `.arena`.** `box-sizing` is `border-box` everywhere, so a
  border shrinks the content box and the rotation centre the bands are spun
  about lands a pixel off — which shows up as all four sides being out of true.
  The rim is an inset `box-shadow` for that reason.
- **The vanishing distance is a multiple of `--S`, not a fixed px.** That keeps
  the perspective looking the same on a phone as on a laptop, and it keeps the
  projection a plain scale of the square, so the fit still lands in one
  correction. A fixed `perspective` would make it a different shape at every
  size and the solve would have to iterate blindly.

Watch for the flat layout's CSS reaching into the arena. Both share `.backs`,
and the flat layout's landscape block sets `flex: 0 0 auto` on it — shrink
zero. `.arena .backs` has to spell `flex` out, or a 17-tile Taiwanese wall
stops shrinking and spills into the corner plates, in landscape only.

The ponds are a fixed number of rows so the bands stay the same size all hand;
`pondRows()` predicts what flex wrap will do (a sideways riichi tile is 1.4
columns wide) and must never under-reserve.

`jonathanjtan/trainjong` was empty at build time; when it grows code, a new
variant is a data object in `src/variants.js` plus one scorer function.
