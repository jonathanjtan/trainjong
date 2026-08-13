# What the engine plays

Common to all variants: server-authoritative state, claim priority
**Win > Pung/Kong > Chow** (ties between winners go to the seat nearest the
discarder counter-clockwise), chow only from the player on your left, three
kong types (claimed 明槓, concealed 暗槓, added 加槓), replacement draws from
the dead wall, and robbing the added kong (搶槓).

Values below are the defaults in `src/score/*.js` — every table is exported
and editable.

---

## Hong Kong Old Style · `hk-old`

13 tiles + flowers/seasons (8 bonus tiles, auto-replaced). **Minimum 3 faan**
to win; chicken hands are rejected. Faan convert to payment units on the
classic doubling-then-flattening ladder:

| faan | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| units | 1 | 2 | 4 | 8 | 16 | 24 | 32 | 48 | 64 | 96 | 128 | 192 | 256 | 384 |

Cap: **13 faan** (limit hands score as 13). Payments: **full shooter** — on a
discard the shooter pays 3 units alone; on self-draw all three pay 1 unit
each (winner's income is the same either way).

Scored patterns include: 平和 common hand 1, 對對和 all pungs 3, 混一色 mixed
one suit 3, 清一色 pure one suit 7, 小三元 3 / 大三元 8, 小四喜 6 / 大四喜 13,
字一色 all honours 10, 清老頭 all terminals 10, 十三么 thirteen orphans 13,
四暗刻 concealed pungs 8, 九蓮寶燈 nine gates 13, 十八羅漢 all kongs 13,
八仙過海 all eight flowers 13, plus the 1-faan set: seat/round winds, dragon
pungs, own flower/season, no flowers, self-draw, all concealed, robbing the
kong, last tile (海底/河底), win off a kong replacement.

## Hong Kong New Style · `hk-new`

Same engine and patterns with the modern tweaks: cap **10 faan**, 斷么九
all-simples scores 1, and **half-shooter** payments — the shooter pays 2
units, the other two pay ½ unit each (self-draw: 1 unit from everyone).

## Taiwanese 16-tile · `taiwan-16`

16 tiles, **5 sets + a pair**, flowers in play. Payment = 底 (base, 30) +
台 × tai (10 per tai). Every payer pays the winner in full on self-draw; only
the shooter pays on a discard. Dealer hands involve an extra
**1 + 2 × streak** tai (連莊/拉莊), and the dealer repeats on winning *or* on
a drawn hand. Tai table includes 門清 1, 自摸 1, 莊家 1, dragon/wind pungs,
碰碰和 4, 混一色 4, 清一色 8, 小三元 4 / 大三元 8, 五暗刻 8, 字一色 16,
天聽/地聽, 八仙過海 8, and friends.

## Riichi · `riichi`

13 tiles, no flowers, red-less 136-tile wall. Implemented: riichi / double
riichi / ippatsu, dora + kan-dora + ura-dora, menzen tsumo, pinfu, tanyao,
yakuhai, sanshoku (both), ittsu, chanta/junchan, chiitoitsu, toitoi, sanankou,
sankantsu, honroutou, shousangen, honitsu/chinitsu, haitei/houtei,
rinshan, chankan, and the yakuman (kokushi, suuankou, daisangen, shousuushii/
daisuushii, tsuuiisou, chinroutou, ryuuiisou, chuuren, suukantsu, tenhou/
chiihou) with doubles for the special waits. Full fu table with the standard
roundings; mangan/haneman/baiman/sanbaiman/yakuman ladder; honba at 300;
riichi sticks carry over; **furiten** (permanent and temporary) enforced;
exhaustive draws pay **noten penalty** 3000 split between tenpai players;
dealer repeats on winning or on tenpai at a draw.

---

## Deliberate omissions (agree at the table)

- **Kuikae** (swap-calling) is *not* forbidden by the engine.
- **Nagashi mangan** not scored.
- **Abortive draws** (nine terminals, four riichi, four kongs, four same
  discards) not implemented — play always continues.
- After riichi, concealed kong is allowed only on the tile just drawn (the
  engine enforces this) but does not check wait-change edge cases beyond that.
- HK/TW faan & tai values vary house to house — treat `HK_TABLE` / `TW_TABLE`
  as the start of the argument, not the end of it.
- No red-five tiles in riichi (aka dora) by default.
