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
  start the server, sit in one seat, enable bots, Start. They come at three
  strengths, picked in the lobby once bots are on:
  - *easy* — plays each tile on its own merits and claims discards because they
    are offered. A beginner; this is exactly the bot that used to fill seats.
  - *normal* — counts how far its hand is from a win and picks the discard that
    keeps the most useful draws, and only claims a tile when the claim actually
    shortens that distance. Won't open a hand on a run it can't score with.
  - *hard* — also tracks how many of each tile are still unseen, keeps quiet on
    a wait that is already dead, and reads the table: against a riichi (or a
    seat with melds piling up) it will abandon a hopeless hand and discard only
    tiles that seat has already passed on.
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
  the way Mahjong Soul and friends draw it). Six discards to a row, three rows.
  The slab in the middle carries the round, the wall count and the four scores,
  each score turned towards its own seat, with the seat to play lit; it floats
  inside the ring the ponds make rather than filling it, so the middle stays out
  of the way of the tiles.
- **Every seat has a name and a face.** In the flat table the plate rides at the
  head of the strip its own seat owns, beside that player's melds; the arena,
  which cannot carry an upright name on a table that lies back, hangs it off the
  middle of each edge wherever the felt has room and keeps to the corner where
  it does not. Twelve faces come drawn in — inline SVG, like the tiles, so there
  is nothing to download — and you pick one in the lobby beside your name.
- **Faces of your own**: drop images in `public/faces` and they join the picker,
  cropped to the same circle. The list is read off the disk, so a new file shows
  up within a couple of seconds. That directory is gitignored — what you put on
  your own table stays on your own table.
- **It lies back in landscape**, again like the reference. That is not just
  decoration: a flat square table can only ever be as big as the short edge of
  the screen, and landscape has width going spare. Tilting it trades that
  surplus width for about a third more tile, and the near half — which is yours
  — gains the most. The angle comes from how much surplus width there actually
  is, so portrait, which has none, stays flat and top-down.
- **`simple` in the top bar** draws the same table without the rotation: each
  seat's melds along their own edge, their discards pooled around the middle,
  every tile facing the reader. An opponent's concealed hand is one face-down
  tile with its count on it rather than thirteen backs — thirteen say nothing
  the number does not, and the edge is better spent on the melds. It sticks per
  browser, so one player can use it without affecting the table.
  Its size is measured rather than guessed: the grid shrink-wraps and the tile
  size is bisected until the whole table fits the board. How the ponds are
  shaped — discards to a row, and whether a side seat's strip runs along its
  edge or up it — is searched at the same time, because which one a board can
  afford turns on how many rows the ponds have wrapped to. A landscape phone
  gains a fifth of its tile size taking the first; an upright one loses half.
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
- `node test/e2e.mjs hk-old 3 normal` — boots the real server, drives four
  WebSocket clients through 3+ hands; the last argument is the bot level the
  clients play at.

Layout: `src/` engine (tiles → hand logic → per-variant scorers → game state
machine), `server.js` HTTP + hand-rolled RFC 6455 WebSocket + rooms,
`public/` the client (vanilla ES modules, inline-SVG tiles). The bots live in
`src/bot.js` and see nothing a player at the table cannot — their own hand plus
the public state — and think with the shanten/ukeire pair in `src/hand.js`.

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
columns wide) and must never under-reserve. It reads `POND_COLS`, and the
renderer hands that same number to the stylesheet as `--cols` — deliberately,
because when the two were written down separately they drifted, and a pond that
wrapped to four rows was given three.

`jonathanjtan/trainjong` was empty at build time; when it grows code, a new
variant is a data object in `src/variants.js` plus one scorer function.
