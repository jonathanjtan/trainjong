# 五方 · Five Directions

**`hk-new-5`** — Hong Kong New Style for five players, and the rule set that
generalises it to N.

Everything below runs on the standard 144-tile box, a 13-tile hand, and the
existing `HK_TABLE`. There is no new tile, no new meld, no new pattern. Five
numbers change, and every one of them changes because of arithmetic you can
check.

---

## 1. Seats

Five seats, counter-clockwise from the dealer: **東 南 西 北 中**.

中 is not a hack. 東南西北中 is the standard five-direction set — the fifth
direction is the centre — and the box already contains it. Your seat honour is
your direction tile; the round honour is the round's direction tile; both pay
**1 faan**, and both stack with 三元牌 exactly the way 門風 and 圈風 already
stack today (East in an East round is 2 faan for an 東 pung — same precedent).

So a 中 pung is worth 1 to everyone, 2 to the centre seat, 3 to the centre seat
in a centre round. That is a slightly hotter tile than 東 ever is, because all
five players want it as a dragon — which is precisely why it is worth more when
you land it. The asymmetry is real, it is small, and it rotates: every player
sits in every seat.

**N-extension.** Seats run 東 南 西 北 中 發 白. The box holds seven
directions, so **N ≤ 7**. For N < 4, take the first N.

---

## 2. The wall is shorter. That is the whole problem.

144 tiles, 13-tile hands, and roughly one wall tile in eighteen burned on
flower replacement:

    draws each ≈ 0.944 × (144 − 13N) / N

| N | draws each | vs. 4-player |
|---|---|---|
| 3 | 33.0 | 152% |
| 4 | 21.7 | 100% |
| 5 | **14.9** | **69%** |
| 6 | 10.4 | 48% |

A fifth pair of hands takes 13 tiles off the wall *and* adds a fifth mouth to
the queue. Five players lose a third of their draws. Nothing else about
five-player mahjong is hard; this is the only thing that is.

Two dials exist and only two: hand size and the size of the pool. The pool is
fixed at 144 — there is no fourth suit and no fifth copy that doesn't break
kongs. So the choice is:

- **13 tiles, 15 draws** — everything you know transfers, and the game runs
  about a third shorter and considerably tenser. **This is `hk-new-5`.**
- **10 tiles, 3 sets + a pair, 17.7 draws** — measured per tile you have to
  improve, that is *deeper* than standard 4-player mahjong (1.77 draws/tile vs
  1.67). Genuinely the better-balanced game. But the entire faan table assumes
  four sets: 清一色 and 對對胡 get much cheaper to reach, 十三么 stops existing,
  and every value needs retuning. Filed as §7.

Thirteen tiles is the deepest intuition in the game. `hk-new-5` keeps it and
pays for it in §3.

---

## 3. Five changes, each one paying for the short wall

### 3.1 Minimum 2 faan (was 3)

The 3-faan minimum is what forces a long, developed hand. Cut the wall by a
third and leave the minimum at 3, and the table folds every hand: five players
each eating four-opponents' worth of deal-in risk for a coin-flip at no result
at all.

At 2, one structural pattern is enough — 平和 alone, or a dragon pung plus
自摸, or 斷么九 plus 門前清. The ladder still pays properly for building
bigger; it just stops rejecting hands the wall never gave anyone time to grow.

### 3.2 平和 pays 2 (was 1)

Count the discards you can actually claim from:

| | pung/kong candidates | chow candidates |
|---|---|---|
| 4 players | 3 opponents × 21.7 = **65** | 1 upstream × 21.7 = **22** |
| 5 players | 4 opponents × 14.9 = **60** | 1 upstream × 14.9 = **15** |

Pungs barely notice the fifth player. **Chows lose a third**, because chow
still comes only from your left and your left now discards a third less. Left
alone, five-player HK drifts pung-heavy: 對對胡 quietly appreciates and 平和
quietly dies.

Bumping 平和 to 2 is the smallest possible correction and it lands on exactly
the hands that were hurt — including the melded chow hand, which is the one
that took the whole loss. A melded 平和 is now exactly the 2-faan minimum:
cheap, legal, always available. A concealed all-simples 平和 is 4. The gradient
is right.

*House alternative:* allow chow from either of your two upstream neighbours and
leave 平和 at 1. That restores ~29 chow candidates — an overcorrection, and it
costs you the upstream/downstream asymmetry that makes seat position mean
anything. Not recommended, but it's a one-line change if your table prefers it.

### 3.3 Half-shooter, generalised

The current rule is: **the innocent bystanders pay ½ unit each, the shooter
covers the balance.** Hold the HK invariant that the winner's income does not
depend on how they won, and the general form falls straight out:

    self-draw:  each of (N−1) pays 1     → income N−1
    discard:    (N−2) bystanders pay ½   → shooter pays N/2, income N−1

| N | shooter | each bystander | winner's income |
|---|---|---|---|
| 3 | 1½ | ½ | 2 |
| 4 | **2** | **½** | **3** |
| 5 | 2½ | ½ | 4 |
| 6 | 3 | ½ | 5 |
| 7 | 3½ | ½ | 6 |

N=4 reproduces the printed rule exactly. Nothing was invented here. Set
`baseUnit: 2` at odd N to keep every number integral (shooter 5, bystanders 1,
income 8).

### 3.4 Noten penalty at the exhaustive draw

HK has no penalty for a drawn hand, and at four players that's tolerable. At
five it is the bug that eats the game: draws are frequent, folding is safe,
folding is free, so everyone folds and the wall dies. Every incentive points
the same wrong way.

**Each noten player pays 2 units to each tenpai player.** A minimum win at
five players moves 16 units; this moves at most 8. Half a cheap hand is enough
to make pushing to tenpai worth the risk, and not enough to make it worth
pushing into a live danger tile.

This is the single most important addition in the document. Everything else is
tuning; this one changes what strategy the game rewards.

### 3.5 The dealer passes on a non-tenpai draw

`dealerRepeatsOnDraw: true` plus a draw-heavy five-player wall is an unbounded
dealership. Switch to `dealerRepeatsIfTenpai: true` — already implemented, the
riichi rule — and the hand count stays predictable.

Match length: **2 rounds × 5 hands**, each player dealing twice. (Full 五方場 is
25 hands, which is an evening.)

---

## 4. Flowers

The eight bonus tiles map 梅蘭菊竹 / 春夏秋冬 onto four seats. At five seats,
one player per hand can never score 正花 — a flat, unearned deficit for
whoever is sitting at 中.

**For N ≠ 4, 正花 pays nothing.** Bonus tiles score only as complete suites:
花槓 2 faan for all four flowers or all four seasons, 八仙過海 at the limit for
all eight. Both are seat-independent, so all five players chase them on equal
terms. It also removes a faan or so of free value per hand, which sits well
next to the lower minimum in §3.1.

---

## 5. Everything else already generalises

- **Claim priority.** Win > pung/kong > chow, ties to the seat nearest
  counter-clockwise from the discarder. Works at any N unchanged; head-bump on
  a multi-ron, which becomes noticeably more common at five and makes seat
  position matter — and seat position rotates.
- **Chow from the left only.** The upstream relation exists at any N. Costed in
  §3.2.
- **Kongs, robbing the added kong, replacement draws, 海底/河底.** Untouched.
- **包 (liability).** Optional and recommended at N ≥ 5: feed the visible third
  dragon pung to an obvious 大三元 chase and you pay the whole thing. The chases
  are more visible with five hands on the table, and it stops three innocent
  bystanders funding someone else's carelessness.
- **Dice.** Two dice mod 5 for the opening dealer.

---

## 6. The N table

Hand size has to shrink past five, because 144/N runs out of room: at N=6 a
13-tile hand gets ten draws, which is not a game.

| N | hand | sets + pair | draws each | depth (draws ÷ hand) | min faan |
|---|---|---|---|---|---|
| 3 | 13 | 4 | 33.0 | 2.54 | 3 (better fix: pull 萬2–8) |
| 4 | 13 | 4 | 21.7 | 1.67 | 3 |
| **5** | **13** | **4** | **14.9** | **1.15** | **2** |
| 6 | 10 | 3 | 13.2 | 1.32 | 2 |
| 7 | 10 | 3 | 10.0 | 1.00 | 2 — the ragged edge |

"Depth" is draws per tile you have to improve, and it is the number that
actually predicts whether hands mature. Five players at 13 tiles sits at 1.15
against four players' 1.67: a real, deliberate tightening, which §3 pays for.

Beyond 7 the honours run out and you would need a different scheme for seat
identity. Seven is a clean place to stop.

---

## 7. `hk-new-5-short` — the alternative worth building

Ten tiles, three sets and a pair, 17.7 draws each, depth 1.77. On the numbers
it is the best-balanced five-player game available from a standard box — it
plays *smoother* than four-player HK, not tighter. The reason it isn't the
recommendation is that it needs its own faan table, not this one:

- 清一色 and 對對胡 want deflating (7→5 and 3→2 or so); three sets is a much
  shorter road than four.
- 十三么, 九蓮寶燈, 四暗刻, 大四喜 are unreachable or trivial and need dropping
  or restating.
- Minimum stays at 3 — the wall is deep enough to ask for it.

Worth doing as a second variant. Not worth pretending it's the same game.

---

## 8. What the engine needs

The variant is data; the seat count isn't, yet. `src/game.js` hardcodes 4 in
roughly two dozen places:

- `const next = (s) => (s + 1) % 4` → `% this.n`
- every `[[], [], [], []]` and `[null, null, null, null]` literal in
  `startHand()` → `Array.from({ length: n }, ...)`
- `seatWind: (seat - this.dealer + 4) % 4` (×2) → `% n`, and the result indexes
  seat *honours* now, not just winds
- `firstGoAround && this.turnsTaken < 4` → `< n`
- `winners.sort(... (a - from + 4) % 4 ...)` → `% n`
- `exhaustiveDraw()`: `tenpai.length < 4`, `penalty / (4 - tenpai.length)`, and
  the fixed-pot split — the pairwise rule in §3.4 replaces the pot entirely
- `src/score/hk.js`: `payments()` returns `[0,0,0,0]` and loops `s < 4`; the
  `'half'` branch needs `s === ctx.discarder ? units * (n/2) : units / 2`
- `src/score/util.js`: `bonusScore()` compares `bonusSeat(t) === seatWind`,
  which must go quiet for n ≠ 4 (§4)
- `src/tiles.js`: `WIND_LABEL` → `['東','南','西','北','中','發','白']` for seat
  plates; `bonusSeat` stays `% 4`, it's a property of the tile
- `src/bot.js:321`: `m.tile === E + ((s - view.dealer + 4) % 4)` → `% n`
- `public/app.js`: the table is four seat bands rotated four ways; five needs a
  radial layout at 72°

`checkWin` already takes `need` from `v.setsNeeded`, and `faanToUnits` is
seat-count-blind. The hand engine and the ladder need nothing.

Add to `src/variants.js`:

```js
'hk-new-5': {
  id: 'hk-new-5',
  name: 'Five Directions',
  zh: '五方',
  blurb: 'Five seats 東南西北中, 13 tiles, 2 faan minimum, noten penalty.',
  seats: 5,
  seatHonors: [E, S, W, N, RED],       // 東南西北中 — extend 發白 to reach 7
  handSize: 13,
  setsNeeded: 4,
  bonusTiles: true,
  seatFlowers: false,                   // §4
  thirteenOrphans: true,
  sevenPairs: false,
  riichi: false,
  deadWallSize: 0,
  dora: false,
  scorer: 'hk',
  startScore: 0,
  scoring: {
    minFaan: 2, limitFaan: 10, payment: 'half', baseUnit: 2,
    table: {
      ...HK_TABLE,
      allSimples: 1,      // new style
      allChows: 2,        // §3.2 — chows lost a third of their supply
      allHonors: 10, smallFourWinds: 6, mixedTerminals: 6,
      seatFlower: 0,      // §4
    },
  },
  dealerRepeatsOnWin: true,
  dealerRepeatsOnDraw: false,
  dealerRepeatsIfTenpai: true,          // §3.5
  flowerReplacementCountsAsKong: true,
  chowFromLeftOnly: true,
  notenPenalty: 2,                      // §3.4 — pairwise, not a pot
},
```

---

## 9. Honest edges

- **Variance is up.** Four opponents, a fifth of the hands, and a 10-faan limit
  now paying 4 units instead of 3 — one limit hand can decide a 10-hand match.
  Recommended default is to live with it and keep the match short. If you want
  stakes comparable across table sizes, set `baseUnit = 3 / (N − 1)` and the
  winner's income is invariant; the cost is that deal-in stops hurting, and
  deal-in hurting is what makes the defensive game worth playing.
- **Defence is genuinely harder.** Reading four opponents off 15 discards each
  is not four-player mahjong with an extra seat; it's a different, blurrier
  problem. The noten penalty in §3.4 exists to stop that blurriness from
  collapsing the game into universal folding, but it is a counterweight, not a
  fix — expect the five-player game to reward pushing more than you're used to.
- **中 is the hottest tile on the table.** Priced in §1, but it's the first
  thing a table will notice and argue about.
- **Three-way ron** is a live possibility at five seats. Head-bump is what the
  engine already does and it's fine. If your table hates it, void the hand and
  let the dealer repeat — the riichi 三家和 rule.
- **These numbers are the start of the argument, not the end of it**, same as
  `HK_TABLE`. The two that matter most are `minFaan: 2` and `notenPenalty`;
  those two carry the design. `allChows: 2` is a correction I'd defend on the
  discard-count arithmetic. The rest is taste.

---

## 10. What the simulation says

Built and measured. `hk-new-5` is in `src/variants.js`; the engine takes a seat
count (`new Game({ variantId, seats })`), so the same rules can be run at four
seats and at five and the two compared directly.

300 matches per configuration, two rounds each, every seat played by the `hard`
bot so any asymmetry is the rules and not the players. 14,116 hands, no engine
errors. `hk-new-5` uses `baseUnit: 2` to keep the half-units integral at an odd
seat count, so its money columns are halved below to compare with the baseline.

| | 4p `hk-new` | 5p untuned | 5p `hk-new-5` |
|---|---|---|---|
| draws each per hand | 14.2 | 11.9 | 10.7 |
| exhaustive draw rate | 11.6% | **36.6%** | 19.6% |
| tenpai share at draw | 80.9% | 57.8% | 52.2% |
| blocked wins per hand | 0.17 | 0.12 | 0.06 |
| mean faan of a win | 3.70 | 3.64 | 3.15 |
| self-draw share | 59.3% | 55.5% | 32.3% |
| winner's income | 41.8 | 53.4 | 41.1 |
| final spread σ | 86.4 | 107.4 | 82.2 |
| final range | 222.9 | 295.8 | 225.4 |

**The draw explosion is the real failure mode, and §3 fixes most of it.**
Untuned, five-seat Hong Kong ends 36.6% of its hands with nobody winning —
more than triple the four-player rate. The tuned rules bring that to 19.6%.

**§3.1 is right, and going further would be pointless.** At `minFaan: 2` the
table refuses 0.06 complete hands per hand — *fewer* than the four-player game
refuses at `minFaan: 3` (0.17). The minimum has stopped being the binding
constraint; the wall is. Dropping to 1 faan would buy almost nothing and would
cost the game its floor.

**§9 was wrong about variance.** Divide out `baseUnit` and the winner's income
(41.1 vs 41.8), the final spread (82.2 vs 86.4) and the final range (225.4 vs
222.9) all land on the four-player baseline. The extra payer is cancelled almost
exactly by the lower mean faan, because a 15-draw wall does not grow big hands.
No stakes normalisation is needed. The `baseUnit = 3/(N-1)` toggle is not.

**§3.2 is confirmed, and the correction is about the right size.** The ratio of
all-sequence to all-triplet winning hands is 51:1 at four seats; untuned at five
it collapses to **24:1**, which is the chow supply falling a third while the
pung supply does not. With 平和 at 2 it comes back to 43:1. If anything the
bump is slightly under-sized rather than over.

**§1's worry does not materialise: 中 is an ordinary seat.** It scores −1.54 a
hand against North's −1.62 and takes 19.0% of the deal-ins against a table
spread of 19–21%. Making the fifth seat's honour a dragon costs it nothing
measurable.

### What the numbers say is still wrong

**The dealer's edge roughly quadruples.** East takes 22.8% of wins against a
fair 20%, and scores +1.27 units a hand against +0.28 at four seats. This is
structural rather than anything §3 introduced — the untuned five-seat game shows
it too. A one-turn head start is simply worth more when you only draw fifteen
times. It rotates out over a match (每人做莊兩次 at two rounds), but the
dealership is worth materially more here than at four seats, and a one-round
game would not be fair.

**The game shifts hard towards winning off a discard.** Self-draws fall from
59% to 32% and 門清自摸 from 54% to 25% of wins: four opponents feeding you
beats drawing it yourself. That is what pulls the mean win down to 3.15 faan,
and it means 五方 rewards reading the table more than four-player HK does.

**19.6% draws is still 1.7× the baseline.** Much better than 36.6%, not the
same game as four-player. A fifth of five-player hands ending in a tenpai
settlement is the price of a 13-tile hand on a 144-tile wall, and §7's ten-tile
variant remains the way to buy it back.

---

## 11. Ablations: which of the five changes earn their place

Same harness, 300 matches each, one tuned rule reverted at a time.

| reverted | draw rate | blocked/hand | mean faan | winner's income | 中 per hand | hands/match | spread σ |
|---|---|---|---|---|---|---|---|
| *(none — `hk-new-5`)* | 19.6% | 0.06 | 3.15 | 82.2 | −1.54 | 14.1 | 164.3 |
| §3.1 → `minFaan: 3` | **29.0%** | 0.12 | 3.54 | 99.0 | −1.04 | 14.8 | 178.2 |
| §3.2 → `allChows: 1` | 19.6% | 0.06 | **2.60** | **58.4** | −0.96 | 14.1 | 119.1 |
| §3.4 → no penalty | 19.6% | 0.06 | 3.15 | 82.2 | −1.63 | 14.1 | 163.9 |
| §3.4 → fixed pot | 19.6% | 0.06 | 3.15 | 82.2 | −1.57 | 14.1 | 164.1 |
| §3.5 → repeat on draw | 19.7% | 0.06 | 3.15 | 82.4 | −1.35 | **16.1** | 178.5 |
| §4 → 正花 on | 16.4% | 0.04 | 3.27 | 91.4 | **−4.66** | 13.9 | 191.5 |

**§4 is the most important change in the document, and it is not close.** With
正花 switched back on, the centre seat scores **−4.66 a hand** against a table
where nobody else is worse than −0.92, and takes 16.7% of the wins against a
fair 20%. Eight bonus tiles onto five seats is not a rounding error — it is the
single largest unfairness in the whole study, and it lands on 中 every hand.
Turning 正花 off removes it completely: 中 goes to −1.54, level with North's
−1.62, and back to an 18.4% win share.

**§3.1 earns its place decisively.** Reverting to a 3-faan minimum sends the
draw rate from 19.6% to **29.0%** and doubles the hands the table refuses to
pay for. This is the change that makes five-player mahjong finish its hands.

**§3.2 turns out to do a second job.** It changes no decision the bot makes,
but it is what keeps the pot the right size: with 平和 back at 1 the winner's
income falls to 58.4 — 29.2 in four-player units, nearly 30% *below* the
four-player baseline of 41.8, because a 15-draw wall does not grow expensive
hands. At 平和 2 the income is 41.1, level with four-player. The bump corrects
the chow/pung drift and the deflation at once.

**§3.5 is real but modest.** Letting the dealer keep the deal on any draw
stretches a two-round match from 14.1 hands to 16.1 (+15%) and raises the final
spread 9%, without changing the dealer's per-hand edge at all. Worth having for
predictable match length; not load-bearing.

### What this harness cannot tell us

**§3.4 is untested, and the table above should not be read as evidence for it.**
Removing the noten penalty entirely — and swapping the pairwise rule for a fixed
pot — changes *not one* behavioural number: draws each 10.73, draw rate 19.6%,
tenpai share 52.2%, blocked 0.06, self-draw 32.3%, all identical to four
significant figures. That is not a finding about the rule; it is a finding about
the bot. `src/bot.js` folds on tile danger and its own distance from a win, and
has no model of the value of reaching tenpai before the wall dies, so a penalty
aimed squarely at push/fold incentives cannot move it.

What the run does establish is that the penalty is aggregate-neutral — it
redistributes without inflating the game — and that pairwise and pot forms are
indistinguishable in money. The argument in §3.4 stands on reasoning, not on
this data. Testing it properly needs a bot that values tenpai at the draw, and
that is the obvious next piece of work.

The dealer's edge in §10 has the same caveat in reverse: it is measured with
bots that do not adjust their aggression to seat, so a human table would likely
show a different, probably larger, number.

---

## 12. §3.4, tested properly

The harness in §11 could not test the noten penalty because `src/bot.js` had no
notion of what tenpai at the draw was worth. It does now, and the missing piece
turned out to be a specific play rather than a weighting:

**形式聴牌.** The bot refused, in every position, to claim a tile that only
bought it a hand it could never legally declare — a plain run of simples under a
2-faan minimum. That refusal is correct for most of a hand and exactly wrong at
the end of one, because the settlement pays for a wait whether or not the wait
could ever have been cashed. Once the wall is nearly out and the rules charge
for noten, the value gate comes off. Two smaller changes go with it: a hand one
step further out will now push rather than fold in the endgame, and a folding
hand keeps its wait if any tile safe enough keeps it.

Re-run, 300 matches each, everything else identical:

| | penalty (pairwise 4) | no penalty | fixed pot (16) |
|---|---|---|---|
| exhaustive draw rate | **16.5%** | 20.4% | 16.5% |
| tenpai share at draw | **69.2%** | 52.6% | 69.2% |
| blocked wins per hand | 0.10 | 0.07 | 0.10 |
| mean faan of a win | 3.07 | 3.16 | 3.07 |
| final spread σ | 158.6 | 167.3 | 158.2 |

**The penalty does what §3.4 claimed.** Tenpai at the draw goes from 52.6% to
**69.2%**, and the share of hands that die with nobody having got anywhere falls
from 20.4% to **16.5%** — because chasing a formal wait opens hands, and an open
hand sometimes wins outright. It also takes a little heat out of the game
(spread 167.3 → 158.6): a settlement is a small transfer where a deal-in is a
large one, so the more hands end in one, the flatter the ride.

Note that this improves on §10: with the tenpai-aware bot the tuned five-seat
draw rate is 16.5%, not 19.6%, which is much nearer the four-player 11.6%. The
earlier figure was measuring a bot that did not know the rule was there.

**Pairwise versus a fixed pot is still not measurable.** The two are identical
on every behavioural column and differ by 0.4 in final spread, which is noise.
The bot chases a wait whenever chasing one pays, and both forms pay. The case
for pairwise in §3.4 is that it does not thin out as the table grows — a
fairness argument about bigger tables, not a claim about play, and it should be
read that way.

---

## 13. Five seats on the screen

The arena was four bands rotated 0/90/180/270° about the middle of a square. It
is now one band per side of a regular N-gon, spun by a whole turn divided by the
seat count, and the square is not a special case in the code — it is a special
case in the arithmetic:

    apothem / side = 1 / (2·tan(π/N))     →  0.5 at N=4
    box / side     = the polygon's own bounding box, in sides  →  1.0 at N=4

Both are plain multipliers on the side length, which is what keeps the table's
size a straight line in `--dw` so `fitArena()` can still solve it by measuring
two probes. The renderer hands the stylesheet those two numbers and a rotation
per seat; nothing is positioned per-seat, so the sides cannot drift out of
agreement however many of them there are.

- Past four seats the felt is drawn **round**, because a pentagon has no corners
  worth squaring off — and a table that seats five is round anyway.
- The centre slab keeps its three-by-three grid at four seats and goes radial
  past that, each readout turned by its own seat's angle so a score always faces
  its owner.
- Names ride an **ellipse** rather than a circle: the table is laid back, so it
  is wider on screen than it is tall. The renderer hands the stylesheet an
  outward unit vector per seat and the plate itself is never rotated — a band
  can lie back with the felt, a name cannot.
- The flat "simple" layout is a three-by-three grid with four cells to give, so
  a table bigger than four always gets the polygon.

`test/layout.test.mjs` renders the real `app.js` under a DOM stub and asserts
both halves: that five seats come out as five bands 72° apart with 東南西北中 on
them, and that four seats still come out as the square, down to the named grid
cells and the apothem being exactly ½.

`test/e2e.mjs` now sizes its table from the variant, so 五方 is driven through
the real server by five WebSocket clients like any other rule set.
