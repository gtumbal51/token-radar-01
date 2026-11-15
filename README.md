# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gtumbal51/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gtumbal51/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for the [make.fun](https://make.fun) bounty
**"Build the best token launch radar"**
(`token-radar-01`). One program, `main.ts`, Node 22, standard library
only, no network. It reads the sealed snapshot of 758 protocols, ranks
every protocol that records no token by an implied value, and hands in a
dashboard a reader can sort, filter and open row by row.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`--input` defaults to `/input/snapshot.json`, the sealed snapshot. Locally,
pass the kit's snapshot instead:
`--input ../token-radar-01-kit/token-radar-01-kit/input/snapshot.json`.

The grader runs `node main.ts` against the sealed `/input/snapshot.json`
and takes `/output`. The run is deterministic: two runs write the same
bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=x5za685e&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## The model (radar-3)

Implied value is a size curve, fitted and tested, not asserted. The
snapshot's own traded protocols tell us what the market pays for a dollar
of TVL, and the relationship is a curve, not a flat ratio: log(market cap)
= 7.79 + 0.47 × log(TVL), fitted by ordinary least squares on the 119
traded protocols outside the centralised-exchange category. A launch is
priced as a range, not a point: the band around each implied value is the
model's own measured error, the time-split median error factor of ×2.81.

The curve is tested before it is trusted. A time split fits the older half
of the traded protocols by listing date and predicts the younger half:
median error ×2.81, 45% within 2×, 50% within 3×. A leave-one-out
ablation refits the curve 119 times and tests every extra factor —
category, growth, maturity, all of them together — and none of them earns
its place: the curve alone (leave-one-out median ×3.36) beats the curve
plus any tilt, so the model is the curve alone. The page refits the curve
from the traded protocols itself, and every number on screen is the page's
own arithmetic.

The board covers all 198 rankable protocols — all 40 watchlist slugs plus
every other pre-token protocol that passes the watchlist's own exclusion
rules — so no wrapped or staked product of a token that already trades is
presented as a launch candidate. Protocols whose token already trades are
set aside on a Live tab with the market cap the market itself sets.

Every row carries a $1,000 farm plan, the same size for every protocol so
the rows can be compared. A wallet's allocation is the low end of the band
shared by 40,000 farming wallets. The plan's cost is what it burns: the
gas its steps spend, plus the yield the $1,000 forgoes at 4% a year. The
$1,000 is a deposit, returned on exit. Net is gross minus cost: FARM when
it clears $100, THIN when it is positive but under $100, SKIP when it is
zero or negative. The board's verdicts are FARM 30 · THIN 128 · SKIP 40.

## Files

- `main.ts` — the entrypoint: reads the snapshot, writes `board.json`,
  `data.js`, copies `dashboard/` and `screenshots/`, writes `dossier.json`.
- `lib/model.ts` — the model, the farm plans and the snapshot parser.
- `vendor/makefun-board.ts` — make.fun's dossier library (copied as-is).
- `dashboard/` — `index.html`, `app.css`, `app.js`: the page. Sortable
  and filterable board with verdicts and net dollars, an inline detail
  view per protocol with its band, its nearest traded tokens and its
  netted farm plan, a Live tab, and a Model tab with the curve, the
  validation and the ablation.
- `screenshots/` — four renders of the dashboard: the board, a detail
  view, a filtered view, and the model and validation view.

## License

MIT — see `LICENSE`.
